/*
 * The 2026 draft board, derived.
 *
 * Order comes from the pick numbers already in the ledger; who holds each slot
 * comes from deriveAssets, so trades are reflected without a second source of
 * truth. If this matches the official order, the board needs no stored copy.
 */
import { prisma } from "../lib/prisma";
import { COUNTED_STATUSES, SEED_SEASON, deriveAssets } from "../lib/ledger/derive";
import { currentSeason } from "../lib/constants";

const SEASON = currentSeason();

async function main() {
  const teams = await prisma.team.findMany({ select: { id: true, name: true } });
  const names = new Map(teams.map((t) => [t.id, t.name]));
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

  const derived = deriveAssets(entries, SEASON, teams.map((t) => t.id));
  const board: { slot: number; round: number; holder: string; origin: string }[] = [];
  for (const [teamId, assets] of derived)
    for (const p of assets.rookiePicks)
      if (p.pickNumber != null)
        board.push({
          slot: p.pickNumber,
          round: p.round,
          holder: names.get(teamId) ?? "?",
          origin: p.originTeamId ? names.get(p.originTeamId) ?? "?" : "—",
        });

  board.sort((a, b) => a.round - b.round || a.slot - b.slot);

  console.log(`${board.length} slots in ${SEASON}\n`);
  for (const b of board) {
    const traded = b.origin !== "—" && b.origin !== b.holder;
    console.log(
      `${b.round}.${String(b.slot).padStart(2, "0")}  ${b.holder.padEnd(28)}` +
        (traded ? `via ${b.origin}` : "")
    );
  }

  const slots = board.map((b) => `${b.round}.${b.slot}`);
  const dupes = slots.filter((s, i) => slots.indexOf(s) !== i);
  console.log(dupes.length ? `\nDUPLICATE SLOTS: ${dupes.join(", ")}` : "\nNo duplicate slots.");
}

main().finally(() => prisma.$disconnect());
