import { prisma } from "@/lib/prisma";
import type { TransactionStatus } from "@prisma/client";

/*
 * Lifecycle transitions, with no framework around them.
 *
 * Kept free of next/cache and of auth so the whole submit → approve → revert
 * path can be driven from a script. The action wrapper adds the commissioner
 * check and cache invalidation; the rules themselves live here, where they can
 * be tested against a real database.
 *
 * APPROVED is where rosters move — it's labelled "Rosters Updated" in the UI
 * because that's what commissioners actually need to know. Asset balances need
 * no application step at all: they derive from the ledger, and crossing this
 * boundary simply changes whether the entries count.
 */

/** Which moves the commissioner may make from a given state. */
export const ALLOWED_TRANSITIONS: Record<TransactionStatus, TransactionStatus[]> = {
  SUBMITTED: ["APPROVED", "REJECTED", "WITHDRAWN"],
  APPROVED: ["COMPLETED", "SUBMITTED"], // back to submitted un-applies it
  COMPLETED: ["APPROVED"],
  REJECTED: ["SUBMITTED"],
  WITHDRAWN: ["SUBMITTED"],
};

const APPLIED: TransactionStatus[] = ["APPROVED", "COMPLETED"];

/**
 * Move each traded player's roster spot to its new team, or back again.
 *
 * Exported because the rookie draft records a pick as already-approved in a
 * single write — it still needs rosters moved by *this* code rather than by a
 * second copy of it living in the draft action.
 */
export async function movePlayers(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  transactionId: number,
  direction: "apply" | "revert"
) {
  const entries = await tx.ledgerEntry.findMany({
    where: { transactionId, assetType: "PLAYER", playerId: { not: null } },
  });

  const moved: string[] = [];
  for (const e of entries) {
    if (e.isContingent && !e.resolvedAt) continue;
    if (e.playerId == null) continue;

    /*
     * A player arriving from outside the league — a rookie held over in the
     * slow draft, and eventually an auction win. There is no spot to move, so
     * applying creates one and un-applying removes it.
     *
     * Deleting rather than cutting is deliberate: a cut spot says "they were
     * here and were released", which would be a false record of something that
     * never happened. The ledger keeps the true account either way.
     */
    if (e.fromTeamId == null && e.toTeamId != null) {
      if (direction === "revert") {
        const { count } = await tx.rosterSpot.deleteMany({
          where: { playerId: e.playerId, teamId: e.toTeamId, cutAt: null },
        });
        moved.push(
          count
            ? `player ${e.playerId}: removed from team ${e.toTeamId}`
            : `⚠ player ${e.playerId} not on team ${e.toTeamId} to remove`
        );
        continue;
      }

      const already = await tx.rosterSpot.findFirst({
        where: { playerId: e.playerId, teamId: e.toTeamId, cutAt: null },
      });
      if (already) {
        moved.push(`player ${e.playerId}: already on team ${e.toTeamId}`);
        continue;
      }
      const detail = e.details as { salary?: number; notes?: string } | null;
      const salary = detail?.salary;
      if (typeof salary !== "number") {
        moved.push(`⚠ player ${e.playerId} has no salary recorded — not added to a roster`);
        continue;
      }
      await tx.rosterSpot.create({
        // The note says where the player came from — "14th rookie pick in
        // 2026", the way an auction win reads "Auction 2025". It travels in the
        // entry so whatever applies the entry writes it, rather than every
        // caller remembering to.
        data: {
          teamId: e.toTeamId,
          playerId: e.playerId,
          salary,
          notes: detail?.notes ?? null,
          /*
           * The season this salary belongs to. Arriving from outside the league
           * means no contract yet — a rookie holdover, and later an auction win
           * — so without this the money would be invisible to the cap until
           * somebody signed them at cut-down. The entry's own season is the
           * answer, and this is the single place such a spot is ever born.
           */
          acquiredForSeason: e.seasonYear,
        },
      });
      moved.push(
        `player ${e.playerId}: joined team ${e.toTeamId} at $${salary} for ${e.seasonYear}`
      );
      continue;
    }

    // A cut or waiver has no destination: the player leaves the roster
    // entirely rather than moving between two teams.
    if (e.toTeamId == null && e.fromTeamId != null) {
      const spot = await tx.rosterSpot.findFirst({
        where: {
          playerId: e.playerId,
          teamId: e.fromTeamId,
          ...(direction === "apply" ? { cutAt: null } : { cutAt: { not: null } }),
        },
        orderBy: { id: "desc" },
      });
      if (!spot) {
        moved.push(`⚠ player ${e.playerId} not found on team ${e.fromTeamId} to release`);
        continue;
      }
      await tx.rosterSpot.update({
        where: { id: spot.id },
        data: { cutAt: direction === "apply" ? new Date() : null },
      });
      moved.push(`player ${e.playerId}: ${direction === "apply" ? "released" : "restored"}`);
      continue;
    }

    const from = direction === "apply" ? e.fromTeamId : e.toTeamId;
    const to = direction === "apply" ? e.toTeamId : e.fromTeamId;
    if (from == null || to == null) continue;

    const spot = await tx.rosterSpot.findFirst({
      where: { playerId: e.playerId, teamId: from, cutAt: null },
    });
    if (!spot) {
      // Someone edited the roster by hand in between. Say so rather than
      // silently doing nothing — v1's habit of failing quietly is what made
      // its state drift in the first place.
      moved.push(`⚠ player ${e.playerId} not found on team ${from}`);
      continue;
    }
    await tx.rosterSpot.update({ where: { id: spot.id }, data: { teamId: to } });
    moved.push(`player ${e.playerId}: team ${from} → ${to}`);
  }
  return moved;
}

/*
 * The transition itself, with the caller's identity already established.
 *
 * Split out from the action so the whole submit → approve → roster path can be
 * exercised outside a browser session — the part most worth testing is exactly
 * the part a signed-in-user-only entry point makes hardest to reach.
 */
export async function applyStatusChange(
  transactionId: number,
  newStatus: TransactionStatus,
  ownerId: number,
  comment?: string
) {
  const current = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { entries: { select: { isContingent: true, resolvedAt: true } } },
  });
  if (!current) return { error: "Transaction not found." };
  if (current.status === newStatus) return { success: true, notes: [] };

  if (!ALLOWED_TRANSITIONS[current.status].includes(newStatus)) {
    return { error: `Can't move a ${current.status.toLowerCase()} transaction to ${newStatus.toLowerCase()}.` };
  }

  // "Completed" means nothing is outstanding — that's the whole point of the state.
  if (newStatus === "COMPLETED") {
    const open = current.entries.filter((e) => e.isContingent && !e.resolvedAt).length;
    if (open > 0) {
      return {
        error: `${open} contingent term${open === 1 ? "" : "s"} still unresolved. Resolve them before completing.`,
      };
    }
  }

  const wasApplied = APPLIED.includes(current.status);
  const willApply = APPLIED.includes(newStatus);

  const notes = await prisma.$transaction(async (tx) => {
    let moved: string[] = [];
    if (!wasApplied && willApply) moved = await movePlayers(tx, transactionId, "apply");
    else if (wasApplied && !willApply) moved = await movePlayers(tx, transactionId, "revert");

    await tx.transaction.update({ where: { id: transactionId }, data: { status: newStatus } });
    await tx.transactionStatusLog.create({
      data: {
        transactionId,
        oldStatus: current.status,
        newStatus,
        changedByOwnerId: ownerId,
        comment: comment?.trim() || null,
      },
    });
    return moved;
  });

  return { success: true, notes };
}

