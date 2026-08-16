import type { AssetType } from "@prisma/client";
import { countsFor } from "@/lib/ledger/commitment";
import type { TeamAssets } from "@/lib/ledger/derive";

/*
 * Whether a proposed transaction is legal.
 *
 * These are pure functions over *derived* assets — the same derivation the
 * ledger itself reads. A form that validated against its own idea of what a
 * team holds could disagree with the ledger, and in v1 that class of drift was
 * what 47 of 85 fix scripts existed to repair.
 *
 * Current-season conflicts block: the team simply does not have the thing.
 * Later-season conflicts only warn — an owner still has a season of trading to
 * resolve a 2027 problem, and forbidding it today would forbid ordinary
 * deal-making.
 */

export const MAX_SALARY_CAP = 600;

export type ProposedEntry = {
  assetType: AssetType;
  seasonYear: number;
  /** Dollars for CAP_DOLLARS, otherwise a count. Players carry their salary. */
  amount: number;
  round?: number | null;
  pickNumber?: number | null;
  originTeamId?: number | null;
  playerId?: number | null;
  fromTeamId: number | null;
  toTeamId: number | null;
};

/** What a team holds right now, per season the proposal touches. */
export type TeamSnapshot = {
  teamId: number;
  teamName: string;
  /** Derived holdings, keyed by season. */
  assets: Map<number, TeamAssets>;
  /** Players on the roster, by player id. */
  roster: Map<
    number,
    {
      name: string;
      salary: number;
      contractEndSeason: number | null;
      acquiredForSeason: number | null;
    }
  >;
  /** Salary already committed to multi-year deals, by season. */
  contracted: Map<number, number>;
  /**
   * Every dollar owed for the season, contract or not — see
   * `lib/ledger/commitment.ts`. Differs from `contracted` by exactly the
   * uncontracted salaries that belong to this season: rookie holdovers today,
   * auction holdovers and wins shortly.
   */
  committed: Map<number, number>;
};

export type Finding = {
  level: "block" | "warn";
  teamId: number;
  seasonYear: number;
  message: string;
};

const COUNTABLE: Partial<Record<AssetType, keyof TeamAssets>> = {
  CAP_DOLLARS: "capDollars",
  PS_SPOT: "psSpots",
  CONDITIONAL_CUT: "conditionalCuts",
  UNCONDITIONAL_CUT: "unconditionalCuts",
  TOPPER_HOLDOVER: "topperHoldovers",
};

/*
 * Assets awarded only to teams that miss the playoffs. Nobody can know who
 * those will be, so these can't be traded for a season that hasn't awarded
 * them yet — unlike cap dollars, PS spots, conditional cuts and rookie picks,
 * which every team is allocated every year.
 */
const PLAYOFF_DEPENDENT: AssetType[] = ["UNCONDITIONAL_CUT", "TOPPER_HOLDOVER"];

const LABEL: Partial<Record<AssetType, string>> = {
  CAP_DOLLARS: "cap dollars",
  PS_SPOT: "PS spots",
  CONDITIONAL_CUT: "conditional cuts",
  UNCONDITIONAL_CUT: "unconditional cuts",
  TOPPER_HOLDOVER: "toppers/holdovers",
};

function pickLabel(e: Pick<ProposedEntry, "round" | "pickNumber" | "seasonYear">): string {
  if (e.pickNumber != null) return `${e.seasonYear} pick ${e.round ?? "?"}.${e.pickNumber}`;
  const ord = e.round === 1 ? "1st" : e.round === 2 ? "2nd" : "rookie";
  return `${e.seasonYear} ${ord} round pick`;
}

/**
 * @param entries what the proposal moves
 * @param teams   snapshot of every team the proposal touches
 * @param currentSeason conflicts at or below this season block; beyond it, warn
 */
export function validateProposal(
  entries: ProposedEntry[],
  teams: Map<number, TeamSnapshot>,
  currentSeason: number
): Finding[] {
  const findings: Finding[] = [];
  const seasons = [...new Set(entries.map((e) => e.seasonYear))];

  // Always a block, never a warning: a later season may never award these at
  // all, so there is nothing to trade one's way out of.
  for (const e of entries) {
    if (
      e.fromTeamId != null &&
      e.seasonYear > currentSeason &&
      PLAYOFF_DEPENDENT.includes(e.assetType)
    ) {
      findings.push({
        level: "block",
        teamId: e.fromTeamId,
        seasonYear: e.seasonYear,
        message: `${LABEL[e.assetType] ?? "That asset"} aren't awarded until the season arrives, so none can be traded for ${e.seasonYear}.`,
      });
    }
  }

  const add = (teamId: number, seasonYear: number, message: string) =>
    findings.push({
      level: seasonYear > currentSeason ? "warn" : "block",
      teamId,
      seasonYear,
      message,
    });

  for (const [teamId, team] of teams) {
    for (const season of seasons) {
      const held = team.assets.get(season);
      if (!held) continue;

      const out = entries.filter((e) => e.fromTeamId === teamId && e.seasonYear === season);
      const incoming = entries.filter((e) => e.toTeamId === teamId && e.seasonYear === season);

      // Countable assets: you cannot send what you do not hold.
      for (const [assetType, key] of Object.entries(COUNTABLE) as [AssetType, keyof TeamAssets][]) {
        const sending = out
          .filter((e) => e.assetType === assetType)
          // A topper naming a player is checked individually below. Counting it
          // here would test it against the wrong pile — the spendable T/H —
          // and pass or fail for reasons that have nothing to do with it.
          .filter((e) => !(e.assetType === "TOPPER_HOLDOVER" && e.playerId != null))
          .reduce((sum, e) => sum + e.amount, 0);
        if (sending === 0) continue;
        const have = held[key] as number;
        if (sending > have) {
          add(
            teamId,
            season,
            `${team.teamName} would send ${sending} ${LABEL[assetType]} in ${season} but holds ${have}.`
          );
        }
      }

      // Rookie picks are individually identified, not fungible.
      for (const e of out.filter((x) => x.assetType === "ROOKIE_PICK")) {
        const match = held.rookiePicks.find((p) =>
          e.pickNumber != null
            ? p.pickNumber === e.pickNumber
            : p.round === e.round &&
              (e.originTeamId == null || p.originTeamId === e.originTeamId)
        );
        if (!match) {
          add(teamId, season, `${team.teamName} does not hold the ${pickLabel(e)}.`);
        }
      }

      // A topper on a named player is that player's topper and no other's.
      for (const e of out.filter(
        (x) => x.assetType === "TOPPER_HOLDOVER" && x.playerId != null
      )) {
        const held_ = held.namedToppers.find((t) => t.playerId === e.playerId && t.count > 0);
        if (!held_) {
          add(teamId, season, `${team.teamName} does not hold a topper on that player.`);
        }
      }

      // Players move from a roster, so they must be on it.
      for (const e of out.filter((x) => x.assetType === "PLAYER" && x.playerId != null)) {
        if (!team.roster.has(e.playerId!)) {
          add(teamId, season, `That player is not on ${team.teamName}'s roster.`);
        }
      }

      // The ceiling, and the money actually committed against it.
      const capIn = incoming
        .filter((e) => e.assetType === "CAP_DOLLARS")
        .reduce((sum, e) => sum + e.amount, 0);
      const capOut = out
        .filter((e) => e.assetType === "CAP_DOLLARS")
        .reduce((sum, e) => sum + e.amount, 0);
      const allocation = held.capDollars + capIn - capOut;

      if (allocation > MAX_SALARY_CAP) {
        add(
          teamId,
          season,
          `${team.teamName} would hold $${allocation} of ${season} cap, above the $${MAX_SALARY_CAP} ceiling.`
        );
      }

      /*
       * Every dollar owed for this season, moved by the proposal.
       *
       * Not total roster spend: a player whose salary belongs to a season
       * already gone expires into the pool at the auction, so a team "over
       * cap" on expiring salary is over nothing. And not `contracted` either,
       * which was the rule here until holdovers existed — it counts only
       * multi-year money, so a rookie held over for $60 registered as free and
       * a team could trade its way past the cap on the strength of it.
       *
       * `countsFor` is the same predicate the rosters and the auction budget
       * use. Applied to *both* sides, from the spot each player actually sits
       * in: a departing player's spot is on this roster, an arriving one's is
       * on the sender's. Reading only one side is how the arithmetic goes
       * wrong in a new way while looking fixed.
       */
      const salaryIn = incoming
        .filter((e) => e.assetType === "PLAYER" && e.playerId != null)
        .reduce((sum, e) => {
          const sender = e.fromTeamId != null ? teams.get(e.fromTeamId) : undefined;
          const spot = sender?.roster.get(e.playerId!);
          // No sending spot means the player is arriving from outside the
          // league — a holdover, or an auction win. The entry's own season is
          // then the season the salary belongs to.
          if (!spot) return sum + (e.seasonYear === season ? e.amount : 0);
          return sum + (countsFor(spot, season) ? spot.salary : 0);
        }, 0);

      const salaryOut = out
        .filter((e) => e.assetType === "PLAYER" && e.playerId != null)
        .reduce((sum, e) => {
          const spot = team.roster.get(e.playerId!);
          return sum + (spot && countsFor(spot, season) ? spot.salary : 0);
        }, 0);

      const committed = (team.committed.get(season) ?? 0) + salaryIn - salaryOut;

      if (committed > allocation) {
        add(
          teamId,
          season,
          `${team.teamName} would commit $${committed} against $${allocation} of ${season} cap — $${committed - allocation} over.`
        );
      }
    }
  }

  return findings;
}

export const blocking = (f: Finding[]) => f.filter((x) => x.level === "block");
export const warnings = (f: Finding[]) => f.filter((x) => x.level === "warn");
