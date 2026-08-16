/*
 * Drives a real transaction from filing to approval to reversal, on the local
 * database, and rolls back everything it created.
 *
 * The path worth proving is the one a browser session makes hardest to reach:
 * a cut has no destination team, so approving it must remove a roster spot and
 * reverting must put it back. Nothing else in the lifecycle behaves that way.
 */
import { prisma } from "../lib/prisma";
import { applyStatusChange } from "../lib/ledger/transition";
import { currentSeason } from "../lib/constants";
import { COUNTED_STATUSES, SEED_SEASON, deriveAssets } from "../lib/ledger/derive";

const SEASON = currentSeason();
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`   ${ok ? "✔" : "✘"} ${name}${ok || !detail ? "" : `  — ${detail}`}`);
  ok ? pass++ : fail++;
};

async function capOf(teamId: number) {
  const ids = (await prisma.team.findMany({ select: { id: true } })).map((t) => t.id);
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
  const a = deriveAssets(entries, SEASON, ids).get(teamId)!;
  return { cap: a.capDollars, condCuts: a.conditionalCuts };
}

async function main() {
  const owner = await prisma.owner.findFirst({ where: { isCommissioner: true } });
  const team = await prisma.team.findFirst({
    orderBy: { id: "asc" },
    select: { id: true, name: true },
  });
  if (!owner || !team) throw new Error("Need a commissioner and a team.");

  // A contracted player, so the cut has a real cap cost.
  const spot = await prisma.rosterSpot.findFirst({
    where: { teamId: team.id, cutAt: null, contractEndSeason: { not: null } },
    select: { id: true, playerId: true, salary: true, player: { select: { name: true } } },
    orderBy: { salary: "asc" },
  });
  if (!spot) throw new Error("No contracted player to cut.");

  console.log(`Conditional cut: ${spot.player.name} ($${spot.salary}) from ${team.name}\n`);
  const before = await capOf(team.id);

  const created = await prisma.transaction.create({
    data: {
      type: "CONDITIONAL_CUT",
      status: "SUBMITTED",
      note: "[test] end-to-end path check",
      submittedByOwnerId: owner.id,
      submittedForTeamId: team.id,
      entries: {
        create: [
          { assetType: "PLAYER", seasonYear: SEASON, amount: spot.salary,
            playerId: spot.playerId, fromTeamId: team.id, toTeamId: null },
          { assetType: "CONDITIONAL_CUT", seasonYear: SEASON, amount: 1,
            fromTeamId: team.id, toTeamId: null },
          { assetType: "CAP_DOLLARS", seasonYear: SEASON, amount: spot.salary,
            fromTeamId: team.id, toTeamId: null },
        ],
      },
      statusLogs: { create: { newStatus: "SUBMITTED", changedByOwnerId: owner.id } },
    },
    select: { id: true },
  });

  console.log("Submitted:");
  {
    const now = await capOf(team.id);
    const stillOn = await prisma.rosterSpot.findFirst({ where: { id: spot.id, cutAt: null } });
    check("nothing counts yet", now.cap === before.cap && now.condCuts === before.condCuts,
          `cap ${before.cap}→${now.cap}, cuts ${before.condCuts}→${now.condCuts}`);
    check("player still on the roster", !!stillOn);
  }

  console.log("\nApproved:");
  const approve = await applyStatusChange(created.id, "APPROVED", owner.id);
  {
    const now = await capOf(team.id);
    const gone = await prisma.rosterSpot.findFirst({ where: { id: spot.id, cutAt: { not: null } } });
    check("player left the roster", !!gone, JSON.stringify(approve));
    check(`cap fell by $${spot.salary}`, now.cap === before.cap - spot.salary,
          `${before.cap} → ${now.cap}`);
    check("a conditional cut was spent", now.condCuts === before.condCuts - 1,
          `${before.condCuts} → ${now.condCuts}`);
  }

  console.log("\nReverted to submitted:");
  await applyStatusChange(created.id, "SUBMITTED", owner.id, "[test] undo");
  {
    const now = await capOf(team.id);
    const back = await prisma.rosterSpot.findFirst({ where: { id: spot.id, cutAt: null } });
    check("player is back on the roster", !!back);
    check("cap restored", now.cap === before.cap, `${now.cap} vs ${before.cap}`);
    check("conditional cut restored", now.condCuts === before.condCuts);
  }

  // Leave no trace.
  await prisma.transaction.delete({ where: { id: created.id } });
  const after = await capOf(team.id);
  const spotOk = await prisma.rosterSpot.findFirst({ where: { id: spot.id, cutAt: null } });
  console.log("\nCleanup:");
  check("test transaction removed", !(await prisma.transaction.findUnique({ where: { id: created.id } })));
  check("league is exactly as it was", after.cap === before.cap && !!spotOk);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
