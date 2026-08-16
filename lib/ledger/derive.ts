import { currentSeason } from "@/lib/constants";
/*
 * Asset derivation.
 *
 * A team's holdings are a fold over ledger entries — never a stored balance.
 * v1 kept both an event log and a materialized `Asset` table and could not hold
 * them in agreement; 47 of its 85 emergency scripts existed to repair the
 * difference, and it shipped an endpoint purely to detect the drift.
 *
 * Only entries whose transaction is APPROVED or COMPLETED count. That single
 * rule is what makes the lifecycle safe to run backwards: demoting a
 * transaction stops its entries counting, with no applied state to unwind.
 */
import type { AssetType, TransactionStatus } from "@prisma/client";

/** Entries only count once a commissioner has approved the transaction. */
export const COUNTED_STATUSES: TransactionStatus[] = ["APPROVED", "COMPLETED"];

/**
 * The season whose opening balances were seeded from v1 when the league moved
 * to this system. History through this season is already baked into that
 * balance, so importing it again would double-count; later seasons are real
 * obligations that must still count.
 */
export const SEED_SEASON = 2026;

/** The rule-given cap base for seasons the league hasn't allocated yet. */
export const BASE_CAP = 500;

/** How many seasons ahead a rookie pick may be traded. */
export const PICK_HORIZON = 5;

/** Whether an imported entry contributes to balances, or is kept only for the record. */
export function historicalEntryCounts(seasonYear: number): boolean {
  return seasonYear > SEED_SEASON;
}

export type DerivableEntry = {
  seasonYear: number;
  /** Contingent terms don't count until their condition is settled. */
  isContingent?: boolean;
  resolvedAt?: Date | null;
  assetType: AssetType;
  fromTeamId: number | null;
  toTeamId: number | null;
  amount: number;
  round: number | null;
  pickNumber: number | null;
  originTeamId: number | null;
  playerId: number | null;
  label: string | null;
};

/** A rookie pick is identified by whose pick it was, which season, which round. */
export type PickHolding = {
  seasonYear: number;
  round: number;
  originTeamId: number | null;
  pickNumber: number | null;
  count: number;
};

/*
 * A topper right on one named player, which is what a rookie pick becomes when
 * it's used to top rather than to hold over.
 *
 * Counted apart from `topperHoldovers` on purpose. The T/H a non-playoff team
 * is granted may be spent on anybody; this one is welded to a single rookie.
 * Folding them together would tell a team it holds a spendable T/H it doesn't
 * have, and the trade form would happily let them trade it.
 */
export type NamedTopper = {
  playerId: number;
  label: string | null;
  count: number;
  /**
   * Filled in by the read path, not by derivation — entries carry ids, not
   * names, and derivation stays pure over entries. Undefined means nobody has
   * resolved it yet, which is different from a player with no name.
   */
  playerName?: string | null;
};

export type TeamAssets = {
  teamId: number;
  seasonYear: number;
  capDollars: number;
  psSpots: number;
  conditionalCuts: number;
  unconditionalCuts: number;
  /** Unattached toppers — spendable on any eligible player. */
  topperHoldovers: number;
  /** Toppers tied to a specific player. Not interchangeable with the above. */
  namedToppers: NamedTopper[];
  rookiePicks: PickHolding[];
};

const COUNTABLE: AssetType[] = [
  "CAP_DOLLARS",
  "PS_SPOT",
  "CONDITIONAL_CUT",
  "UNCONDITIONAL_CUT",
  "TOPPER_HOLDOVER",
];

function emptyAssets(teamId: number, seasonYear: number): TeamAssets {
  return {
    teamId,
    seasonYear,
    capDollars: 0,
    psSpots: 0,
    conditionalCuts: 0,
    unconditionalCuts: 0,
    topperHoldovers: 0,
    namedToppers: [],
    rookiePicks: [],
  };
}

const FIELD: Partial<Record<AssetType, keyof TeamAssets>> = {
  CAP_DOLLARS: "capDollars",
  PS_SPOT: "psSpots",
  CONDITIONAL_CUT: "conditionalCuts",
  UNCONDITIONAL_CUT: "unconditionalCuts",
  TOPPER_HOLDOVER: "topperHoldovers",
};

/*
 * Before pick numbers exist, picks are fungible within a round and origin —
 * "their 2027 1st" is one tradeable thing. Once numbered, each is distinct, so
 * the number joins the key; otherwise two picks a team holds in the same round
 * collapse into one and the count is lost.
 */
const pickKey = (e: DerivableEntry) =>
  e.pickNumber != null
    ? `${e.seasonYear}|#${e.pickNumber}`
    : `${e.seasonYear}|${e.round ?? 0}|${e.originTeamId ?? "?"}`;

/**
 * Fold entries into each team's holdings for one season.
 *
 * Signed by direction: an entry adds to `toTeamId` and subtracts from
 * `fromTeamId`. A null side is the league itself — an allocation coming in, or
 * an asset being spent — so nothing is double-counted.
 */
export function deriveAssets(
  entries: DerivableEntry[],
  seasonYear: number,
  teamIds: number[]
): Map<number, TeamAssets> {
  const out = new Map(teamIds.map((id) => [id, emptyAssets(id, seasonYear)]));
  const picks = new Map<number, Map<string, PickHolding>>();
  const toppers = new Map<number, Map<number, NamedTopper>>();
  teamIds.forEach((id) => {
    picks.set(id, new Map());
    toppers.set(id, new Map());
  });

  /*
   * Seasons the league hasn't allocated yet start from the rule: every team
   * holds its own 1st and 2nd. Trades then move them like anything else.
   *
   * This is the whole answer to future pick trades. v1 stored balances, so it
   * would have had to materialise sixteen teams × two rounds × every future
   * year as rows before anyone could trade one — it refused, and invented
   * "lazy accounting" instead. Deriving means the rows never need to exist.
   *
   * Once a season *is* allocated, the allocation is the authority and the rule
   * steps aside, so a team that traded a pick away doesn't get it handed back.
   */
  const allocated = entries.some(
    (e) =>
      e.seasonYear === seasonYear &&
      e.assetType === "ROOKIE_PICK" &&
      e.fromTeamId == null &&
      e.toTeamId != null
  );
  if (!allocated && seasonYear <= currentSeason() + PICK_HORIZON) {
    for (const id of teamIds) {
      for (const round of [1, 2]) {
        picks.get(id)!.set(`${seasonYear}|${round}|${id}`, {
          seasonYear,
          round,
          originTeamId: id,
          // Slots only exist once standings settle; until then a pick is known
          // by its round and whose it is, which is how they're traded.
          pickNumber: null,
          count: 1,
        });
      }
    }
  }

  /*
   * Cap dollars follow the same rule (added 2026-08-16, after the trade form
   * blocked a legal trade of 2027 cap on auction day): every team holds the
   * $500 base in any season the league hasn't allocated yet, and trades net
   * against it — the balance is a query, exactly like future picks.
   *
   * "Allocated" is detected by majority: a real March allocation grants cap
   * to every team at once, so league→team grants reaching at least half the
   * teams flip the season to entries-only. A one-off grant (a condition
   * payout, a commissioner adjustment) stays additive on top of the seed —
   * which is what a grant means. Consequence for the rollover, recorded in
   * PLAN §23: the future allocation must file the PLAIN base ($500 + that
   * year's granted extras), never a pre-netted figure — the carried trades
   * already count as ordinary entries, and netting them into the grant would
   * charge them twice.
   */
  const capGrantees = new Set(
    entries
      .filter(
        (e) =>
          e.seasonYear === seasonYear &&
          e.assetType === "CAP_DOLLARS" &&
          e.fromTeamId == null &&
          e.toTeamId != null
      )
      .map((e) => e.toTeamId!)
  );
  const capAllocated = capGrantees.size * 2 > teamIds.length;
  if (!capAllocated && seasonYear <= currentSeason() + PICK_HORIZON) {
    for (const id of teamIds) out.get(id)!.capDollars = BASE_CAP;
  }

  const applyPick = (teamId: number, e: DerivableEntry, sign: number) => {
    const forTeam = picks.get(teamId);
    if (!forTeam) return;
    const key = pickKey(e);
    const held = forTeam.get(key) ?? {
      seasonYear: e.seasonYear,
      round: e.round ?? 0,
      originTeamId: e.originTeamId,
      pickNumber: e.pickNumber,
      count: 0,
    };
    held.count += sign * e.amount;
    // A later entry may resolve the pick number once standings are known.
    if (e.pickNumber != null) held.pickNumber = e.pickNumber;
    forTeam.set(key, held);
  };

  const applyTopper = (teamId: number, e: DerivableEntry, sign: number) => {
    const forTeam = toppers.get(teamId);
    if (!forTeam || e.playerId == null) return;
    const held = forTeam.get(e.playerId) ?? { playerId: e.playerId, label: e.label, count: 0 };
    held.count += sign * e.amount;
    forTeam.set(e.playerId, held);
  };

  for (const e of entries) {
    if (e.seasonYear !== seasonYear) continue;
    // An unresolved contingency is a promise, not a holding.
    if (e.isContingent && !e.resolvedAt) continue;

    // A topper naming a player is a different asset from a spendable T/H.
    if (e.assetType === "TOPPER_HOLDOVER" && e.playerId != null) {
      if (e.toTeamId != null) applyTopper(e.toTeamId, e, +1);
      if (e.fromTeamId != null) applyTopper(e.fromTeamId, e, -1);
      continue;
    }

    if (e.assetType === "ROOKIE_PICK") {
      if (e.toTeamId != null) applyPick(e.toTeamId, e, +1);
      if (e.fromTeamId != null) applyPick(e.fromTeamId, e, -1);
      continue;
    }

    const field = FIELD[e.assetType];
    if (!field || !COUNTABLE.includes(e.assetType)) continue;

    const to = e.toTeamId != null ? out.get(e.toTeamId) : undefined;
    if (to) (to[field] as number) += e.amount;
    const from = e.fromTeamId != null ? out.get(e.fromTeamId) : undefined;
    if (from) (from[field] as number) -= e.amount;
  }

  for (const [teamId, held] of toppers) {
    const team = out.get(teamId);
    if (!team) continue;
    team.namedToppers = [...held.values()].filter((t) => t.count > 0);
  }

  for (const [teamId, held] of picks) {
    const team = out.get(teamId);
    if (!team) continue;
    team.rookiePicks = [...held.values()]
      .filter((p) => p.count > 0)
      .sort((a, b) => a.round - b.round || (a.pickNumber ?? 99) - (b.pickNumber ?? 99));
  }

  return out;
}

/** Every season that has any activity, newest first — for season pickers. */
export function seasonsPresent(entries: DerivableEntry[]): number[] {
  return [...new Set(entries.map((e) => e.seasonYear))].sort((a, b) => b - a);
}
