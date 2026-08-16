/*
 * Future rookie picks, now that they derive from a rule rather than rows.
 *
 * Confirms the seeded picks appear, that a traded one actually leaves, and
 * that an allocated season still derives purely from its entries.
 */
import { prisma } from "../lib/prisma";
import { COUNTED_STATUSES, PICK_HORIZON, SEED_SEASON, deriveAssets } from "../lib/ledger/derive";
import { currentSeason } from "../lib/constants";

const SEASON = currentSeason();

async function main() {
  const teams = await prisma.team.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
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

  for (let y = SEASON; y <= SEASON + PICK_HORIZON; y++) {
    const derived = deriveAssets(entries, y, ids);
    const total = teams.reduce((n, t) => n + (derived.get(t.id)?.rookiePicks.length ?? 0), 0);
    const counts = teams
      .map((t) => `${t.name.slice(0, 14)}:${derived.get(t.id)!.rookiePicks.reduce((n, p) => n + p.count, 0)}`)
      .filter((c) => !c.endsWith(":2"));
    console.log(
      `${y}  ${String(total).padStart(2)} holdings across 16 teams` +
        (counts.length ? `   off-baseline → ${counts.join("  ")}` : "   every team 1st + 2nd")
    );
  }
  console.log(`\nHorizon: ${SEASON}–${SEASON + PICK_HORIZON}`);
}

main().finally(() => prisma.$disconnect());
