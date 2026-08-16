/*
 * What a practice-squad designation change does to a contract.
 *
 * The league rule: a PS year "essentially turns the contract
 * into a four year contract." PS can be applied to rookies or any contracted
 * player in any year of the term; nobody goes on PS two years running; and a
 * player pulled off PS returns to a three-year deal.
 *
 * The whole subtlety is the last clause. Pulling him off *during* the PS year
 * gives the year back — that's the in-season activation the rule describes.
 * Flipping his designation back after the year completed must keep the
 * extension, because the year was spent stashed and the extra season was the
 * point. The designation alone can't tell those apart; `psSeason` — stamped
 * when PS is applied — is the difference.
 *
 * Pure decision table, no I/O, so the suite can walk every branch. The roster
 * actions own the write.
 */

export type PsBefore = {
  designation: string;
  contractEndSeason: number | null;
  psSeason: number | null;
};

export type PsEffect = {
  /** Applied to contractEndSeason when the spot has one. 0 otherwise. */
  contractDelta: 0 | 1 | -1;
  /** The new value for psSeason. */
  psSeason: number | null;
  /** Shown in the editor banner; the change explains itself. */
  note?: string;
  /** A rule being bent — shown louder, but never a block. */
  warning?: string;
};

export function psTransition(
  before: PsBefore,
  newDesignation: string,
  season: number,
  /** The player's most recent completed PS year, for the two-in-a-row rule. */
  lastPsSeason: number | null,
  playerName: string
): PsEffect {
  const wasPs = before.designation === "PS";
  const isPs = newDesignation === "PS";

  if (wasPs === isPs) return { contractDelta: 0, psSeason: before.psSeason };

  if (isPs) {
    // Going on PS: the contract stretches by the stashed year.
    const contracted = before.contractEndSeason != null;
    const twoRunning = lastPsSeason === season - 1;
    return {
      contractDelta: contracted ? 1 : 0,
      psSeason: season,
      note: contracted
        ? `PS year: ${playerName}'s contract extends a year, to ${before.contractEndSeason! + 1}.`
        : `${playerName} is on the practice squad for ${season}. No contract yet — when one lands, it covers the PS year.`,
      warning: twoRunning
        ? `${playerName} was on the practice squad last year too — two years running isn't a thing the manual allows.`
        : undefined,
    };
  }

  // Coming off PS.
  if (before.psSeason == null) {
    // A row from before the automation — we can't know whether his PS year
    // completed, so we refuse to guess about somebody's contract.
    return {
      contractDelta: 0,
      psSeason: null,
      note: `${playerName} is off the practice squad, but this row predates the PS bookkeeping — check the contract year by hand.`,
    };
  }

  if (before.psSeason === season) {
    // In-season activation: the year comes back.
    const contracted = before.contractEndSeason != null;
    return {
      contractDelta: contracted ? -1 : 0,
      psSeason: null,
      note: contracted
        ? `${playerName} activated off the practice squad — the contract returns to ${before.contractEndSeason! - 1}.`
        : `${playerName} activated off the practice squad.`,
    };
  }

  // The PS year completed; the extension was earned and stays.
  return {
    contractDelta: 0,
    psSeason: null,
    note: `${playerName}'s ${before.psSeason} practice-squad year is done — the contract keeps its extra season.`,
  };
}
