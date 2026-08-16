import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { currentSeason } from "@/lib/constants";
import { COUNTED_STATUSES, PICK_HORIZON, SEED_SEASON, deriveAssets } from "@/lib/ledger/derive";
import { committedFor, contractedFor } from "@/lib/ledger/commitment";
import type { TeamSnapshot } from "@/lib/ledger/validate";

/*
 * What every team holds, for the seasons a proposal might touch.
 *
 * Built once and shared by the form (live feedback) and the server action
 * (authority), so the two cannot reach different conclusions about the same
 * trade — which is the whole point of deriving rather than storing.
 */
/** Current season plus every season a pick may still be traded in. */
export const HORIZON = PICK_HORIZON + 1;

export const leagueSnapshot = cache(async (): Promise<Map<number, TeamSnapshot>> => {
  const season = currentSeason();
  const teams = await prisma.team.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const ids = teams.map((t) => t.id);

  const entries = await prisma.ledgerEntry.findMany({
    where: {
      transaction: { status: { in: COUNTED_STATUSES } },
      OR: [{ transaction: { isHistorical: false } }, { seasonYear: { gt: SEED_SEASON } }],
    },
    select: {
      seasonYear: true, isContingent: true, resolvedAt: true, assetType: true,
      fromTeamId: true, toTeamId: true, amount: true, round: true,
      pickNumber: true, originTeamId: true, playerId: true, label: true,
    },
  });

  const spots = await prisma.rosterSpot.findMany({
    where: { cutAt: null },
    select: {
      teamId: true, playerId: true, salary: true, contractEndSeason: true,
      acquiredForSeason: true,
      player: { select: { name: true, position: true } },
    },
  });

  const seasons = Array.from({ length: HORIZON }, (_, i) => season + i);
  const derived = new Map(seasons.map((s) => [s, deriveAssets(entries, s, ids)]));

  const out = new Map<number, TeamSnapshot>();
  for (const t of teams) {
    const mine = spots.filter((s) => s.teamId === t.id);
    const assets = new Map(
      seasons.flatMap((s) => {
        const d = derived.get(s)!.get(t.id);
        return d ? [[s, d] as const] : [];
      })
    );
    out.set(t.id, {
      teamId: t.id,
      teamName: t.name,
      assets,
      roster: new Map(
        mine.map((s) => [
          s.playerId,
          {
            name: s.player.name,
            salary: s.salary,
            contractEndSeason: s.contractEndSeason,
            acquiredForSeason: s.acquiredForSeason,
          },
        ])
      ),
      // Multi-year money only. The season in question counts, along with every
      // year beyond it; contracts that ended before it are spent.
      contracted: new Map(seasons.map((s) => [s, contractedFor(mine, s)])),
      /*
       * Every dollar the team owes for the season, contract or not — a holdover
       * is an auction win that happened early, and the money is gone the moment
       * it's declared. `contracted` misses exactly those, which is why the
       * draft board had to sum its own "Committed" figure.
       */
      committed: new Map(seasons.map((s) => [s, committedFor(mine, s)])),
    });
  }

  /*
   * Names for toppers on named players. They're usually rookies nobody has
   * rostered yet, so the roster join above can't supply them — and "topper on
   * #1683" is not something a trade form can ask anyone to agree to.
   */
  const topperIds = new Set<number>();
  for (const team of out.values())
    for (const a of team.assets.values())
      for (const t of a.namedToppers) topperIds.add(t.playerId);

  if (topperIds.size > 0) {
    const players = await prisma.player.findMany({
      where: { id: { in: [...topperIds] } },
      select: { id: true, name: true },
    });
    const names = new Map(players.map((p) => [p.id, p.name]));
    for (const team of out.values())
      for (const a of team.assets.values())
        for (const t of a.namedToppers) t.playerName = names.get(t.playerId) ?? null;
  }

  return out;
});

/** Cost to buy a player out on waivers: salary for every year still to run. */
export function waiverCost(
  salary: number,
  contractEndSeason: number | null,
  season = currentSeason()
): number {
  if (contractEndSeason == null || contractEndSeason <= season) return 0;
  return salary * (contractEndSeason - season);
}
