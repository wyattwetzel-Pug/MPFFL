/*
 * Whose salary counts against which season.
 *
 * The rule the league states plainly: **the salary always counts, and the
 * contract only says for how many years.** A player on the roster at $60 is
 * $60 of that season's cap whether or not anyone has decided yet to sign them
 * to three years — that decision happens at cut-down and changes nothing about
 * the money already spent.
 *
 * That leaves exactly one question for an uncontracted spot: *which* season is
 * it? `contracted` — the figure the site has always used — answered it by
 * ignoring uncontracted players entirely, which is right before an auction
 * clear (they are about to expire into the pool) and wrong the moment a
 * holdover exists, because a holdover is an auction win that happened early.
 *
 * So a spot counts for a season when its contract runs that far, or when it has
 * no contract and was acquired for exactly that season.
 *
 * Pure, and free of `server-only`, so scripts and verification can drive it.
 * No I/O: hand it rows.
 */

/** The parts of a roster spot this rule needs. */
export type Committable = {
  salary: number;
  contractEndSeason: number | null;
  acquiredForSeason: number | null;
};

/**
 * Is this spot an obligation for `season`?
 *
 * A contract covers every season up to and including the one it ends in — a
 * deal through 2026 is live for the 2026 season and returns at the 2027
 * auction. Without a contract, one season only.
 */
export function countsFor(spot: Committable, season: number): boolean {
  return spot.contractEndSeason != null
    ? spot.contractEndSeason >= season
    : spot.acquiredForSeason === season;
}

/** What a set of roster spots commits against one season. */
export function committedFor(spots: Committable[], season: number): number {
  return spots.reduce((sum, s) => (countsFor(s, season) ? sum + s.salary : sum), 0);
}

/**
 * The older, narrower figure: multi-year money only.
 *
 * Kept because trade and cut validation still read it, and because the two
 * disagreeing is the interesting signal — every dollar of difference is an
 * uncontracted salary that belongs to this season and was previously invisible.
 */
export function contractedFor(spots: Committable[], season: number): number {
  return spots.reduce(
    (sum, s) => (s.contractEndSeason != null && s.contractEndSeason >= season ? sum + s.salary : sum),
    0
  );
}
