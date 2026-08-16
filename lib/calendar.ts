import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { currentSeason } from "@/lib/constants";
import type { MilestoneKey } from "@prisma/client";
import { zonedToInstant } from "@/lib/tz";

/*
 * The league calendar.
 *
 * Every date the league year turns on, read through one place. Before this,
 * `currentSeason()` was the only date knowledge in the codebase and everything
 * else lived in people's heads — which is how v1 ended up deciding whether a
 * trade was legal from `new Date().getMonth()`.
 *
 * Unset milestones fall back rather than failing, and say so. A date the site
 * is guessing must never be indistinguishable from one the commissioner chose,
 * because these will eventually enforce.
 */

export type MilestoneSpec = {
  key: MilestoneKey;
  label: string;
  /** How the league actually determines it. Shown beside the field. */
  rule: string;
  /** month, day — used when nothing is set for the season. */
  fallback: [number, number];
  /** March 1st is a rule, not a choice; it is displayed, never entered. */
  derived?: boolean;
  /** Deadlines land at a specific minute; the auction is just a day. */
  timeMatters?: boolean;
};

/*
 * In the order the league year runs them: March 1st, the August auction, the
 * week-1 cut-down, the week-12 deadline, and settlement the following February.
 * Contract settlement lands last because it belongs to the calendar year the
 * season rolls into.
 */
export const MILESTONES: MilestoneSpec[] = [
  {
    key: "LEAGUE_YEAR_START",
    label: "League year start",
    rule: "March 1st",
    fallback: [3, 1],
    derived: true,
  },
  {
    key: "AUCTION",
    timeMatters: true,
    label: "Auction",
    rule: "Usually the second weekend of August",
    fallback: [8, 15],
  },
  {
    key: "ROSTER_CUTDOWN",
    timeMatters: true,
    label: "Roster cut-down",
    rule: "Wednesday at midnight before the first NFL game of week 1",
    fallback: [10, 1],
  },
  {
    key: "TRADE_DEADLINE",
    timeMatters: true,
    label: "Trade deadline",
    rule: "Wednesday before NFL week 12",
    fallback: [11, 20],
  },
  {
    key: "CONTRACT_SETTLEMENT",
    timeMatters: true,
    label: "Contract settlement",
    rule: "Super Bowl Sunday, midnight — last day to settle contracts",
    fallback: [2, 21],
  },
];

export type Milestone = {
  key: MilestoneKey;
  label: string;
  rule: string;
  at: Date;
  /** "set" means a commissioner chose it. "fallback" means we're guessing. */
  source: "set" | "fallback";
  note: string | null;
  setAt: Date | null;
};

const fallbackDate = (season: number, [month, day]: [number, number]) => {
  // Contract settlement and the league year start belong to the calendar year
  // the season rolls into, not the one it began in.
  const year = month <= 2 ? season + 1 : season;
  // League time, like everything else here — `new Date(y, m, d)` would have
  // been the server's midnight, which on Vercel is the previous afternoon.
  return zonedToInstant(
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  )!;
};

/** Every milestone for a season, set or fallen back. */
export const leagueCalendar = cache(
  async (season: number = currentSeason()): Promise<Milestone[]> => {
    const rows = await prisma.leagueMilestone.findMany({ where: { seasonYear: season } });
    const bySpec = new Map(rows.map((r) => [r.key, r]));

    return MILESTONES.map((spec) => {
      const row = spec.derived ? undefined : bySpec.get(spec.key);
      return {
        key: spec.key,
        label: spec.label,
        rule: spec.rule,
        at: row?.occursAt ?? fallbackDate(season, spec.fallback),
        source: row ? "set" : "fallback",
        note: row?.note ?? null,
        setAt: row?.setAt ?? null,
      };
    });
  }
);

/** One milestone, for the code that will eventually enforce against it. */
export async function milestone(
  key: MilestoneKey,
  season: number = currentSeason()
): Promise<Milestone> {
  const all = await leagueCalendar(season);
  return all.find((m) => m.key === key)!;
}

/**
 * Has a milestone passed?
 *
 * Returns the source alongside the answer on purpose: enforcing against a date
 * nobody chose should be a deliberate decision at the call site, not something
 * that happens quietly because a row was missing.
 */
export async function hasPassed(
  key: MilestoneKey,
  season: number = currentSeason(),
  now: Date = new Date()
): Promise<{ passed: boolean; source: "set" | "fallback"; at: Date }> {
  const m = await milestone(key, season);
  return { passed: now >= m.at, source: m.source, at: m.at };
}
