/*
 * One-time seed of the all-time standings carried over from the parent
 * league (see lib/legacy/standings.ts for the source values and the
 * team-matching notes). Idempotent — looked up by label, the business key,
 * not id. After this runs once, edit rows at /legacy as the commissioner;
 * this script never needs to run again.
 *
 *   npx tsx --env-file=.env scripts/seed-legacy-standings.ts
 */
import { prisma } from "../lib/prisma";
import { legacyStandings } from "../lib/legacy/standings";

async function main() {
  let created = 0;
  let skipped = 0;
  for (const [index, row] of legacyStandings.entries()) {
    const team = await prisma.team.findUnique({ where: { slug: row.slug } });
    if (!team) {
      console.error(`no team with slug "${row.slug}" for legacy row "${row.team}" — skipped`);
      continue;
    }

    const existing = await prisma.legacyStanding.findFirst({ where: { label: row.team } });
    if (existing) { skipped++; continue; }

    await prisma.legacyStanding.create({
      data: {
        teamId: team.id,
        label: row.team,
        wins: row.wins,
        losses: row.losses,
        winPct: row.winPct,
        pointsScored: row.pointsScored,
        pointsAgainst: row.pointsAgainst,
        highestScorerSeasons: row.highestScorerSeasons,
        playoffAppearances: row.playoffAppearances,
        playoffRecord: row.playoffRecord,
        oneSeedAppearances: row.oneSeedAppearances,
        titleAppearances: row.titleAppearances,
        titleWins: row.titleWins,
        bpotya: row.bpotya,
        coty: row.coty,
        sortOrder: index,
      },
    });
    created++;
  }
  console.log(`legacy standings seeded: ${created} created, ${skipped} already present`);
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
