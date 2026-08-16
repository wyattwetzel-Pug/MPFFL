"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionOwner } from "@/lib/auth";
import { recordWin, revertWin } from "@/lib/auction/win";

/*
 * Thin wrappers: auth and cache invalidation here, rules in lib/auction/win.ts
 * where a script can reach them. The same split as the draft.
 */

type Result = { ok: true; transactionId: number } | { ok: false; error: string };

const me = async () => {
  const owner = await getSessionOwner();
  if (!owner) return null;
  return { id: owner.id, teamId: owner.teamId, isCommissioner: owner.isCommissioner };
};

const touched = () => {
  revalidatePath("/auction");
  revalidatePath("/rosters");
  revalidatePath("/transactions");
};

export async function recordAuctionWin(input: {
  playerId: number;
  teamId: number;
  bid: number;
  note?: string;
  topped?: { byTeamId: number };
}): Promise<Result> {
  const owner = await me();
  if (!owner) return { ok: false, error: "You must be signed in." };
  const res = await recordWin({ ...input, owner });
  if (res.ok) touched();
  return res;
}

export async function undoAuctionWin(transactionId: number): Promise<Result> {
  const owner = await me();
  if (!owner) return { ok: false, error: "You must be signed in." };
  const res = await revertWin(transactionId, owner);
  if (res.ok) touched();
  return res;
}

/**
 * Fix a mis-keyed win: the old transaction is withdrawn, a corrected one filed.
 *
 * Deliberately *not* an edit — entries are immutable, and a correction is a
 * thing that happened. The corrected win never consumes a topper: if the
 * original was a top, the revert returns the right, and topping again is a
 * decision to make explicitly, not a side effect of fixing a number.
 */
export async function refileAuctionWin(
  transactionId: number,
  changes: { bid: number; teamId: number }
): Promise<Result> {
  const owner = await me();
  if (!owner) return { ok: false, error: "You must be signed in." };

  const original = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: {
      type: true,
      entries: { where: { playerId: { not: null } }, select: { playerId: true }, take: 1 },
    },
  });
  const playerId = original?.entries[0]?.playerId;
  if (original?.type !== "AUCTION_WIN" || playerId == null)
    return { ok: false, error: "That isn't an auction win." };

  const undone = await revertWin(transactionId, owner);
  if (!undone.ok) return undone;

  const refiled = await recordWin({
    playerId,
    teamId: changes.teamId,
    bid: changes.bid,
    owner,
    note: "Corrected entry",
  });
  if (refiled.ok) touched();
  return refiled;
}

/** Open bidding on a player — closes any live nomination first. */
export async function openNomination(playerId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const { requireCommissioner } = await import("@/lib/auth");
  await requireCommissioner();
  const { currentSeason } = await import("@/lib/constants");
  await prisma.nomination.updateMany({
    where: { seasonYear: currentSeason(), closedAt: null },
    data: { closedAt: new Date() },
  });
  await prisma.nomination.create({ data: { seasonYear: currentSeason(), playerId } });
  touched();
  return { ok: true };
}

/** Close the live nomination without recording a win. */
export async function closeNomination(): Promise<{ ok: true } | { ok: false; error: string }> {
  const { requireCommissioner } = await import("@/lib/auth");
  await requireCommissioner();
  const { currentSeason } = await import("@/lib/constants");
  await prisma.nomination.updateMany({
    where: { seasonYear: currentSeason(), closedAt: null },
    data: { closedAt: new Date() },
  });
  touched();
  return { ok: true };
}
