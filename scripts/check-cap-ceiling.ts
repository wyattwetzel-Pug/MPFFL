/*
 * Is any team above the $600 ceiling for 2026?
 *
 * v1 had the rule commented out, so it has never actually been enforced.
 * Before the trade form starts blocking on it, we need to know whether it
 * would block anyone the moment it's switched on.
 */
import { prisma } from "../lib/prisma";
import { COUNTED_STATUSES, SEED_SEASON, deriveAssets } from "../lib/ledger/derive";
import { SALARY_CAP, currentSeason } from "../lib/constants";

const MAX_SALARY_CAP = 600;

async function main() {
  const season = currentSeason();
  const teams = await prisma.team.findMany({ select: { id: true, name: true } });
  // Inlined rather than imported: lib/ledger/queries is server-only.
  const entries = await prisma.ledgerEntry.findMany({
    where: {
      transaction: { status: { in: COUNTED_STATUSES } },
      OR: [{ transaction: { isHistorical: false } }, { seasonYear: { gt: SEED_SEASON } }],
    },
    select: {
      seasonYear: true,
      isContingent: true,
      resolvedAt: true,
      assetType: true,
      fromTeamId: true,
      toTeamId: true,
      amount: true,
      round: true,
      pickNumber: true,
      originTeamId: true,
      playerId: true,
      label: true,
    },
  });
  const assets = deriveAssets(entries, season, teams.map((t) => t.id));

  const spendByTeam = new Map<number, number>();
  for (const s of await prisma.rosterSpot.findMany({
    where: { cutAt: null },
    select: { teamId: true, salary: true },
  })) {
    spendByTeam.set(s.teamId, (spendByTeam.get(s.teamId) ?? 0) + s.salary);
  }

  console.log(`Ceiling check for ${season} (base $${SALARY_CAP}, max $${MAX_SALARY_CAP})\n`);
  const rows = teams
    .map((t) => {
      const spent = spendByTeam.get(t.id) ?? 0;
      // capDollars is the team's cap *allocation* — base $500 plus or minus
      // dollars traded — not what's left after signing anyone.
      const allocation = assets.get(t.id)?.capDollars ?? 0;
      return { name: t.name, spent, allocation, remaining: allocation - spent };
    })
    .sort((a, b) => b.allocation - a.allocation);

  for (const r of rows) {
    const flag = r.allocation > MAX_SALARY_CAP ? "  ← OVER CEILING" : "";
    const broke = r.remaining < 0 ? "  ← OVERSPENT" : "";
    console.log(
      `${r.name.slice(0, 26).padEnd(27)} cap $${String(r.allocation).padStart(3)}` +
        `  spent $${String(r.spent).padStart(3)}  left $${String(r.remaining).padStart(4)}${flag}${broke}`
    );
  }

  const over = rows.filter((r) => r.allocation > MAX_SALARY_CAP);
  const negative = rows.filter((r) => r.remaining < 0);
  if (negative.length) {
    console.log(`\n${negative.length} team(s) overspent: ${negative.map((n) => n.name).join(", ")}`);
  }
  console.log(
    `\n${over.length} of ${rows.length} teams above $${MAX_SALARY_CAP}` +
      (over.length ? `: ${over.map((o) => o.name).join(", ")}` : " — safe to enforce.")
  );
}

main().finally(() => prisma.$disconnect());
