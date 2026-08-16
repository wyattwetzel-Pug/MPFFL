/*
 * Drives a real two-sided trade from filing to approval to reversal, on the
 * local database, and rolls back everything it created.
 *
 * A trade is the case where both directions have to be right at once: two
 * players cross, cap dollars move one way, a pick moves the other, and every
 * balance must land back where it started when the trade is reverted.
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

async function assetsOf(teamId: number) {
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
  return { cap: a.capDollars, picks: a.rookiePicks.length };
}

const rosterOf = (playerId: number) =>
  prisma.rosterSpot.findFirst({ where: { playerId, cutAt: null }, select: { teamId: true } });

async function main() {
  const commish = await prisma.owner.findFirst({ where: { isCommissioner: true } });
  const [a, b] = await prisma.team.findMany({
    take: 2,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (!commish || !a || !b) throw new Error("Need a commissioner and two teams.");

  const pa = await prisma.rosterSpot.findFirst({
    where: { teamId: a.id, cutAt: null },
    select: { playerId: true, salary: true, player: { select: { name: true } } },
    orderBy: { salary: "asc" },
  });
  const pb = await prisma.rosterSpot.findFirst({
    where: { teamId: b.id, cutAt: null },
    select: { playerId: true, salary: true, player: { select: { name: true } } },
    orderBy: { salary: "asc" },
  });
  if (!pa || !pb) throw new Error("Both teams need a player.");

  const beforeA = await assetsOf(a.id);
  const beforeB = await assetsOf(b.id);
  console.log(
    `${a.name} sends ${pa.player.name} ($${pa.salary}) + $5 cap\n` +
    `${b.name} sends ${pb.player.name} ($${pb.salary})\n`
  );

  const created = await prisma.transaction.create({
    data: {
      type: "TRADE",
      status: "SUBMITTED",
      note: "[test] two-sided trade path check",
      submittedByOwnerId: commish.id,
      submittedForTeamId: a.id,
      entries: {
        create: [
          { assetType: "PLAYER", seasonYear: SEASON, amount: pa.salary,
            playerId: pa.playerId, fromTeamId: a.id, toTeamId: b.id },
          { assetType: "CAP_DOLLARS", seasonYear: SEASON, amount: 5,
            fromTeamId: a.id, toTeamId: b.id },
          { assetType: "PLAYER", seasonYear: SEASON, amount: pb.salary,
            playerId: pb.playerId, fromTeamId: b.id, toTeamId: a.id },
        ],
      },
      statusLogs: { create: { newStatus: "SUBMITTED", changedByOwnerId: commish.id } },
    },
    select: { id: true },
  });

  console.log("Submitted:");
  check("no player has moved", (await rosterOf(pa.playerId))?.teamId === a.id &&
        (await rosterOf(pb.playerId))?.teamId === b.id);
  check("no cap has moved", (await assetsOf(a.id)).cap === beforeA.cap);

  console.log("\nApproved:");
  await applyStatusChange(created.id, "APPROVED", commish.id);
  {
    const nowA = await assetsOf(a.id), nowB = await assetsOf(b.id);
    check("players swapped rosters",
      (await rosterOf(pa.playerId))?.teamId === b.id &&
      (await rosterOf(pb.playerId))?.teamId === a.id);
    check("$5 left the sender", nowA.cap === beforeA.cap - 5, `${beforeA.cap} → ${nowA.cap}`);
    check("$5 reached the receiver", nowB.cap === beforeB.cap + 5, `${beforeB.cap} → ${nowB.cap}`);
  }

  console.log("\nReverted:");
  await applyStatusChange(created.id, "SUBMITTED", commish.id, "[test] undo");
  {
    const nowA = await assetsOf(a.id), nowB = await assetsOf(b.id);
    check("players back where they started",
      (await rosterOf(pa.playerId))?.teamId === a.id &&
      (await rosterOf(pb.playerId))?.teamId === b.id);
    check("both caps restored", nowA.cap === beforeA.cap && nowB.cap === beforeB.cap);
  }

  await prisma.transaction.delete({ where: { id: created.id } });
  console.log("\nCleanup:");
  const afterA = await assetsOf(a.id), afterB = await assetsOf(b.id);
  check("league is exactly as it was",
    afterA.cap === beforeA.cap && afterB.cap === beforeB.cap &&
    afterA.picks === beforeA.picks && afterB.picks === beforeB.picks);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
