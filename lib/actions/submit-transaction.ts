"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionOwner } from "@/lib/auth";
import { currentSeason } from "@/lib/constants";
import { leagueSnapshot, waiverCost } from "@/lib/ledger/snapshot";
import { validateProposal, blocking, warnings, type ProposedEntry } from "@/lib/ledger/validate";
import type { AssetType, TransactionType } from "@prisma/client";

/*
 * Filing a transaction.
 *
 * The form's shape is the ledger's shape, so this builds LedgerEntry rows
 * directly — no translation layer to disagree with. Validation runs here as the
 * authority even though the form ran it too: the client's copy is a courtesy,
 * this one is the rule.
 *
 * Nothing is applied on submission. Entries only start counting when a
 * commissioner approves, which is what makes rejection cost nothing.
 */

export type CutKind = "WAIVER" | "CONDITIONAL_CUT" | "UNCONDITIONAL_CUT";

export type TransactionInput = {
  teamId: number;
  type: CutKind | "ADJUSTMENT";
  note: string;
  /** Roster spot player ids being cut or waived. */
  playerIds?: number[];
  /** Waiver buyouts may be paid from more than one season's cap. */
  payments?: { seasonYear: number; amount: number }[];
  /** Free-form asset movement, for adjustments. */
  lines?: {
    assetType: AssetType;
    seasonYear: number;
    amount: number;
    round?: number | null;
    direction: "in" | "out";
  }[];
};

export type SubmitResult =
  | { ok: true; id: number; warnings: string[] }
  | { ok: false; errors: string[] };

export async function submitTransaction(input: TransactionInput): Promise<SubmitResult> {
  const owner = await getSessionOwner();
  if (!owner) return { ok: false, errors: ["You must be signed in."] };

  // Owners file for their own team; commissioners file for anyone.
  if (!owner.isCommissioner && owner.teamId !== input.teamId) {
    return { ok: false, errors: ["You can only file transactions for your own team."] };
  }

  const season = currentSeason();
  const snapshot = await leagueSnapshot();
  const team = snapshot.get(input.teamId);
  if (!team) return { ok: false, errors: ["Unknown team."] };

  const entries: ProposedEntry[] = [];
  const errors: string[] = [];

  if (input.type === "ADJUSTMENT") {
    for (const l of input.lines ?? []) {
      entries.push({
        assetType: l.assetType,
        seasonYear: l.seasonYear,
        amount: l.amount,
        round: l.round ?? null,
        fromTeamId: l.direction === "out" ? input.teamId : null,
        toTeamId: l.direction === "in" ? input.teamId : null,
      });
    }
  } else {
    const players = input.playerIds ?? [];
    if (players.length === 0) errors.push("Select at least one player.");

    for (const playerId of players) {
      const p = team.roster.get(playerId);
      if (!p) {
        errors.push("A selected player is not on this roster.");
        continue;
      }

      // The player leaves the league, not another team — no destination.
      entries.push({
        assetType: "PLAYER",
        seasonYear: season,
        amount: p.salary,
        playerId,
        fromTeamId: input.teamId,
        toTeamId: null,
      });

      if (input.type === "UNCONDITIONAL_CUT") {
        // Only a live contract can be cut unconditionally.
        if (p.contractEndSeason == null || p.contractEndSeason < season) {
          errors.push(`${p.name} has no live contract to cut unconditionally.`);
        }
        entries.push({
          assetType: "UNCONDITIONAL_CUT", seasonYear: season, amount: 1,
          fromTeamId: input.teamId, toTeamId: null,
        });
      }

      if (input.type === "CONDITIONAL_CUT") {
        entries.push({
          assetType: "CONDITIONAL_CUT", seasonYear: season, amount: 1,
          fromTeamId: input.teamId, toTeamId: null,
        });
        // A conditional cut costs the player's salary against this year's cap.
        entries.push({
          assetType: "CAP_DOLLARS", seasonYear: season, amount: p.salary,
          fromTeamId: input.teamId, toTeamId: null,
        });
      }
    }

    if (input.type === "WAIVER") {
      const due = players.reduce((sum, id) => {
        const p = team.roster.get(id);
        return sum + (p ? waiverCost(p.salary, p.contractEndSeason, season) : 0);
      }, 0);
      const paid = (input.payments ?? []).reduce((sum, p) => sum + p.amount, 0);
      if (paid !== due) {
        errors.push(`Buyout payments must total $${due}; they total $${paid}.`);
      }
      for (const p of input.payments ?? []) {
        if (p.amount <= 0) continue;
        entries.push({
          assetType: "CAP_DOLLARS", seasonYear: p.seasonYear, amount: p.amount,
          fromTeamId: input.teamId, toTeamId: null,
        });
      }
    }
  }

  /*
   * A commissioner may file an adjustment that moves nothing.
   *
   * Not every correction is an asset moving. "Savion Williams' contract runs to
   * 2027, per Steve" changes a roster row that was always meant to read that
   * way — there is no asset to debit, and yet the log is the league's record and
   * has to be able to say it happened and why. Without this the only way to
   * leave that record was to invent a movement, which is worse than saying
   * nothing.
   *
   * The note carries the whole meaning here, so it is required rather than
   * optional — an entry-less transaction with no note records literally nothing.
   */
  const recordOnly =
    input.type === "ADJUSTMENT" && owner.isCommissioner && entries.length === 0;
  if (recordOnly && !input.note.trim()) {
    errors.push("A record-only adjustment needs a note — it's the whole entry.");
  } else if (entries.length === 0 && !recordOnly) {
    errors.push("Nothing would move.");
  }
  if (errors.length) return { ok: false, errors };

  const findings = validateProposal(entries, snapshot, season);
  const blocks = blocking(findings);
  if (blocks.length) return { ok: false, errors: blocks.map((b) => b.message) };

  const created = await prisma.transaction.create({
    data: {
      type: input.type as TransactionType,
      status: "SUBMITTED",
      note: input.note.trim(),
      submittedByOwnerId: owner.id,
      submittedForTeamId: input.teamId,
      entries: {
        create: entries.map((e) => ({
          assetType: e.assetType,
          seasonYear: e.seasonYear,
          amount: e.amount,
          round: e.round ?? null,
          pickNumber: e.pickNumber ?? null,
          originTeamId: e.originTeamId ?? null,
          playerId: e.playerId ?? null,
          fromTeamId: e.fromTeamId,
          toTeamId: e.toTeamId,
        })),
      },
      statusLogs: {
        create: { newStatus: "SUBMITTED", changedByOwnerId: owner.id },
      },
    },
    select: { id: true },
  });

  revalidatePath("/transactions");
  revalidatePath("/rosters");
  return { ok: true, id: created.id, warnings: warnings(findings).map((w) => w.message) };
}
