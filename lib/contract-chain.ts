/*
 * Is this contract the player's second in a row?
 *
 * The league's back-to-back rule: a second consecutive multi-year contract —
 * no trip through the auction pool in between — sends the player back to the
 * pool when it expires, topper rights only, no holdover. The chain is the
 * *player's*: trades don't break it, and it doesn't matter whether the
 * retention between contracts was the free expiring-contract holdover or a
 * spent compensatory T/H. Only the auction resets it. A practice-squad year
 * stretches a contract; it neither breaks nor resets the chain, because the
 * chain reads `contractEndSeason` as the truth of when a deal actually ended.
 *
 * Computed at the only moment it can change — a contract landing on a spot —
 * rather than derived on read, because for every player whose history predates
 * the cutover there is nothing to derive from: the migration brought current
 * state, not stint chains (James Cook, back-to-back through 2027, has exactly
 * one row). The stored flag is the record; this function is the one place the
 * record gets written, which is what keeps it from becoming v1's drift.
 *
 * Framework-free, so the suite can drive it.
 */
import { prisma } from "@/lib/prisma";

export type ChainVerdict = {
  backToBack: boolean;
  /** The previous contract was already back-to-back — a third in a row. */
  thirdConsecutive: boolean;
  /** Why, in words a commissioner can read back. */
  reason: string;
};

const NOT = (reason: string): ChainVerdict => ({ backToBack: false, thirdConsecutive: false, reason });

/**
 * Verdict for a contract being recorded on `spotId` now.
 *
 * Reads the player's previous stint and this stint's provenance. Never
 * writes — the caller owns the write, so a manual override can win.
 */
export async function chainVerdict(spotId: number): Promise<ChainVerdict> {
  const spot = await prisma.rosterSpot.findUnique({
    where: { id: spotId },
    select: {
      id: true, playerId: true, teamId: true, acquiredForSeason: true, notes: true,
      player: { select: { name: true } },
    },
  });
  if (!spot) return NOT("No such roster spot.");

  /*
   * The season this stint began. Every spot the system has created since the
   * cutover carries it; a hand-added row without one has no provenance worth
   * trusting, and guessing wrongly here flags somebody's contract wrongly.
   */
  const forSeason = spot.acquiredForSeason;
  if (forSeason == null) {
    return NOT(
      `${spot.player.name}'s stint doesn't say which season it began — the flag stays manual for this row.`
    );
  }

  const prev = await prisma.rosterSpot.findFirst({
    where: { playerId: spot.playerId, cutAt: { not: null }, id: { lt: spot.id } },
    orderBy: { id: "desc" },
    select: { contractEndSeason: true, isBackToBack: true },
  });

  if (!prev) return NOT(`${spot.player.name} has no previous stint — this is contract #1.`);
  if (prev.contractEndSeason == null) {
    return NOT(`${spot.player.name}'s last stint was uncontracted — this is contract #1.`);
  }
  if (prev.contractEndSeason >= forSeason) {
    return NOT(
      `${spot.player.name} was cut while his last contract still ran — the chain broke there.`
    );
  }
  if (prev.contractEndSeason < forSeason - 1) {
    return NOT(
      `${spot.player.name}'s last contract ended ${prev.contractEndSeason}, before ${forSeason - 1} — he went through the pool in between.`
    );
  }

  /*
   * The last contract expired exactly last season. The only remaining escape
   * is the auction: a player *won* rather than held over starts fresh. The
   * creating ledger entry says which this was; the notes column is the
   * fallback for rows added by hand.
   */
  const born = await prisma.ledgerEntry.findFirst({
    where: {
      playerId: spot.playerId,
      toTeamId: spot.teamId,
      fromTeamId: null,
      assetType: "PLAYER",
      seasonYear: forSeason,
      transaction: { status: { in: ["APPROVED", "COMPLETED"] } },
    },
    orderBy: { id: "desc" },
    select: { details: true },
  });
  const source = (born?.details as { source?: string } | null)?.source;
  const fromAuction =
    source === "AUCTION" || (source == null && /^Auction \d{4}$/.test(spot.notes ?? ""));
  if (fromAuction) {
    return NOT(`${spot.player.name} came through the auction — the chain reset.`);
  }

  return {
    backToBack: true,
    thirdConsecutive: prev.isBackToBack,
    reason: prev.isBackToBack
      ? `${spot.player.name}'s last contract was already back-to-back — a third consecutive deal isn't a thing the manual allows.`
      : `${spot.player.name}'s last contract ended ${prev.contractEndSeason} and he was retained, not re-auctioned — this deal is back-to-back.`,
  };
}
