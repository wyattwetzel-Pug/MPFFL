import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { currentSeason } from "@/lib/constants";

/*
 * Bye weeks are stored per NFL team (32 rows a season), so a page loads them
 * once and resolves every player through a Map — no per-player join, and a
 * traded player's bye follows their new team automatically.
 *
 * Cached per request: layouts and pages can all call this freely.
 */
export const getByeWeeks = cache(
  async (season: number = currentSeason()): Promise<Map<string, number>> => {
    const rows = await prisma.nflTeamBye.findMany({
      where: { season },
      select: { nflTeam: true, week: true },
    });
    return new Map(rows.map((r) => [r.nflTeam, r.week]));
  }
);
