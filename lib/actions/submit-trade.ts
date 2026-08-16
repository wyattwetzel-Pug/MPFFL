"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionOwner } from "@/lib/auth";
import { currentSeason } from "@/lib/constants";
import { leagueSnapshot } from "@/lib/ledger/snapshot";
import { checkTradeShape } from "@/lib/trade-shape";
import { validateProposal, blocking, warnings, type ProposedEntry } from "@/lib/ledger/validate";
import type { AssetType } from "@prisma/client";

/*
 * Filing a trade, between however many teams the deal names.
 *
 * A trade is a set of *legs* — sender, recipient, asset — which is also
 * exactly what the ledger stores. The earlier two-sided shape
 * ({fromAssets, toAssets}) was a translation layer over this; it lasted until
 * the first real three-team deal arrived in the group chat and couldn't be
 * filed. Most trades are still two teams, and for them the form builds the
 * same legs it always effectively did.
 *
 * One approval commits every team. The deal was agreed as one package, so it
 * is approved or rejected as one — a hub trade split into bilaterals can be
 * half-approved, and the remaining half is a deal nobody agreed to.
 *
 * Shape (lib/trade-shape.ts) and legality (validateProposal) stay separate,
 * and both live outside this file so scripts can drive them. This wrapper
 * adds what only a request has: a session, and the roster read that prices
 * player legs server-side.
 */

export type TradeAsset = {
  assetType: AssetType;
  seasonYear: number;
  amount: number;
  round?: number | null;
  pickNumber?: number | null;
  originTeamId?: number | null;
  playerId?: number | null;
};

export type TradeLeg = TradeAsset & {
  fromTeamId: number;
  toTeamId: number;
};

export type TradeInput = {
  /** Every team in the deal — a leg may only connect teams named here. */
  teamIds: number[];
  legs: TradeLeg[];
  note: string;
};

export type TradeResult =
  | { ok: true; id: number; warnings: string[] }
  | { ok: false; errors: string[] };

export async function submitTrade(input: TradeInput): Promise<TradeResult> {
  const owner = await getSessionOwner();
  if (!owner) return { ok: false, errors: ["You must be signed in."] };

  // An owner may file a trade their team is part of; commissioners, any trade.
  if (!owner.isCommissioner && (owner.teamId == null || !input.teamIds.includes(owner.teamId))) {
    return { ok: false, errors: ["You can only file trades your team is part of."] };
  }

  const season = currentSeason();
  const snapshot = await leagueSnapshot();

  for (const id of input.teamIds) {
    if (!snapshot.has(id)) return { ok: false, errors: ["Unknown team."] };
  }
  const nameOf = (id: number) => snapshot.get(id)?.teamName ?? `Team #${id}`;

  const errors = checkTradeShape(input.teamIds, input.legs, nameOf);

  const entries: ProposedEntry[] = [];
  for (const leg of input.legs) {
    if (leg.assetType === "PLAYER") {
      const sender = snapshot.get(leg.fromTeamId);
      const p = leg.playerId != null ? sender?.roster.get(leg.playerId) : undefined;
      if (!p) {
        errors.push(`A player named in the trade isn't on ${nameOf(leg.fromTeamId)}'s roster.`);
        continue;
      }
      // Salary comes from the roster, never from the client: a contract that
      // could be edited in transit isn't immutable.
      entries.push({
        assetType: "PLAYER",
        seasonYear: season,
        amount: p.salary,
        playerId: leg.playerId,
        fromTeamId: leg.fromTeamId,
        toTeamId: leg.toTeamId,
      });
      continue;
    }

    if (leg.amount <= 0) continue;
    entries.push({
      assetType: leg.assetType,
      seasonYear: leg.seasonYear,
      amount: leg.amount,
      round: leg.round ?? null,
      pickNumber: leg.pickNumber ?? null,
      originTeamId: leg.originTeamId ?? null,
      /*
       * A TOPPER_HOLDOVER with a player attached is a NAMED topper — a
       * different asset from the spendable right, and the playerId is its
       * whole identity. Dropping it here (a real historical bug) made
       * validation check the spendable pile — zero for a team holding only
       * named rights — and block a perfectly legal trade; three had to be
       * hand-filed in the ledger.
       */
      playerId: leg.assetType === "TOPPER_HOLDOVER" ? (leg.playerId ?? null) : null,
      fromTeamId: leg.fromTeamId,
      toTeamId: leg.toTeamId,
    });
  }

  if (entries.length === 0 && !errors.includes("Nothing would move.")) {
    errors.push("Nothing would move.");
  }
  if (errors.length) return { ok: false, errors };

  const findings = validateProposal(entries, snapshot, season);
  const blocks = blocking(findings);
  if (blocks.length) return { ok: false, errors: blocks.map((b) => b.message) };

  const created = await prisma.transaction.create({
    data: {
      type: "TRADE",
      status: "SUBMITTED",
      note: input.note.trim(),
      submittedByOwnerId: owner.id,
      // The filer's own team when they have one, so the ledger knows who asked.
      submittedForTeamId: owner.teamId ?? input.teamIds[0],
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
      statusLogs: { create: { newStatus: "SUBMITTED", changedByOwnerId: owner.id } },
    },
    select: { id: true },
  });

  revalidatePath("/transactions");
  revalidatePath("/rosters");
  return { ok: true, id: created.id, warnings: warnings(findings).map((w) => w.message) };
}
