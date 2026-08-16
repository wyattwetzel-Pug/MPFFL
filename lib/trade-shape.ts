/*
 * Is this a well-formed trade at all?
 *
 * Shape, not legality. Whether teams hold what they're sending is
 * `validateProposal`'s job; this answers the earlier question — do these legs
 * describe a coherent deal between these teams? It exists apart from the
 * server action so a script can drive it: the rules that guard the ledger
 * should never be reachable only through a browser session.
 *
 * A leg is one directed movement: sender, recipient, asset. The two-sided
 * trade was a special case of this all along — "from's assets" were legs to
 * `to`, and vice versa. Multi-team just stops pretending otherwise.
 */

export type TradeLegShape = {
  fromTeamId: number;
  toTeamId: number;
  /** Only players need naming here; other assets are fungible per team. */
  playerId?: number | null;
};

/**
 * Every reason these legs don't form a trade, in the order a reader would
 * want them. Empty means well-formed.
 *
 * Team names are for messages only; ids are the identity.
 */
export function checkTradeShape(
  teamIds: number[],
  legs: TradeLegShape[],
  teamName: (id: number) => string = (id) => `Team #${id}`
): string[] {
  const errors: string[] = [];
  const teams = new Set(teamIds);

  if (teamIds.length < 2) errors.push("A trade needs at least two teams.");
  if (teams.size !== teamIds.length) errors.push("The same team is listed twice.");
  if (legs.length === 0) errors.push("Nothing would move.");

  for (const leg of legs) {
    if (leg.fromTeamId === leg.toTeamId) {
      errors.push(`${teamName(leg.fromTeamId)} can't send something to itself.`);
      continue;
    }
    if (!teams.has(leg.fromTeamId) || !teams.has(leg.toTeamId)) {
      errors.push("A leg names a team that isn't part of this trade.");
    }
  }

  /*
   * Every named team must actually participate. An idle team is a mistake —
   * either someone forgot their leg or the team doesn't belong here — and
   * approving a trade that commits a team to nothing would still put their
   * name on it. Receiving alone counts: one-sided giving is a real trade and
   * always has been.
   */
  for (const id of teamIds) {
    if (!legs.some((l) => l.fromTeamId === id || l.toTeamId === id)) {
      errors.push(`${teamName(id)} is in this trade but sends and receives nothing.`);
    }
  }

  /*
   * One leg per player. A relay — N sends a player to D, D sends the same
   * player on to C — is incoherent inside a single atomic transaction: both
   * legs are true at once or neither is, so there is no moment at which the
   * middle team held him. The deal people actually mean is the direct leg.
   */
  const seen = new Map<number, number>();
  for (const leg of legs) {
    if (leg.playerId == null) continue;
    const first = seen.get(leg.playerId);
    if (first != null) {
      errors.push(
        `The same player is on two legs. If he's meant to pass through ` +
          `${teamName(legs[first].toTeamId)}, send him straight to his destination instead.`
      );
    } else {
      seen.set(leg.playerId, legs.indexOf(leg));
    }
  }

  return errors;
}
