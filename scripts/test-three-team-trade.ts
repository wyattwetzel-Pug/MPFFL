/*
 * Drives a three-team hub trade — the Pickens shape — from filing to approval
 * to reversal, on the local database, and rolls back everything it created.
 *
 * The topology under test: D sends cap to N; N sends more cap to a third team
 * C and a player to D; C sends an asset back to N. Cap rides two legs, the hub
 * both gains and loses, and every one of the six balances has to land back
 * where it started on revert. This is the case a pair of bilaterals cannot
 * express atomically — which is why the form grew a third team at all.
 *
 *   npx tsx --env-file=.env scripts/test-three-team-trade.ts
 */
import { prisma } from "../lib/prisma";
import { applyStatusChange } from "../lib/ledger/transition";
import { currentSeason } from "../lib/constants";
import { COUNTED_STATUSES, SEED_SEASON, deriveAssets } from "../lib/ledger/derive";

const SEASON = currentSeason();
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`   ${ok ? "✔" : "✘"} ${name}${ok || !detail ? "" : `  — ${detail}`}`);
  if (ok) pass++;
  else fail++;
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
  return { cap: a.capDollars, ps: a.psSpots };
}

const rosterOf = (playerId: number) =>
  prisma.rosterSpot.findFirst({ where: { playerId, cutAt: null }, select: { teamId: true } });

async function main() {
  const commish = await prisma.owner.findFirst({ where: { isCommissioner: true } });
  const [c, d, n] = await prisma.team.findMany({
    take: 3,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (!commish || !c || !d || !n) throw new Error("Need a commissioner and three teams.");

  // The hub's player — the piece that moves to a different team than his cap.
  const player = await prisma.rosterSpot.findFirst({
    where: { teamId: n.id, cutAt: null },
    select: { playerId: true, salary: true, player: { select: { name: true } } },
    orderBy: { salary: "asc" },
  });
  if (!player) throw new Error("The hub team needs a player.");

  const before = {
    c: await assetsOf(c.id),
    d: await assetsOf(d.id),
    n: await assetsOf(n.id),
  };
  console.log(
    `Hub: ${n.name}\n` +
    `  ${d.name} sends $3 cap to ${n.name}\n` +
    `  ${n.name} sends $17 cap to ${c.name}\n` +
    `  ${c.name} sends 1 PS spot to ${n.name}\n` +
    `  ${n.name} sends ${player.player.name} ($${player.salary}) to ${d.name}\n`
  );

  const created = await prisma.transaction.create({
    data: {
      type: "TRADE",
      status: "SUBMITTED",
      note: "[test] three-team hub trade path check",
      submittedByOwnerId: commish.id,
      submittedForTeamId: n.id,
      entries: {
        create: [
          { assetType: "CAP_DOLLARS", seasonYear: SEASON, amount: 3,
            fromTeamId: d.id, toTeamId: n.id },
          { assetType: "CAP_DOLLARS", seasonYear: SEASON, amount: 17,
            fromTeamId: n.id, toTeamId: c.id },
          { assetType: "PS_SPOT", seasonYear: SEASON, amount: 1,
            fromTeamId: c.id, toTeamId: n.id },
          { assetType: "PLAYER", seasonYear: SEASON, amount: player.salary,
            playerId: player.playerId, fromTeamId: n.id, toTeamId: d.id },
        ],
      },
      statusLogs: { create: { newStatus: "SUBMITTED", changedByOwnerId: commish.id } },
    },
    select: { id: true },
  });

  console.log("Submitted:");
  check("nothing has moved", (await rosterOf(player.playerId))?.teamId === n.id &&
        (await assetsOf(d.id)).cap === before.d.cap);

  console.log("\nApproved — one status change commits all three teams:");
  await applyStatusChange(created.id, "APPROVED", commish.id);
  {
    const now = { c: await assetsOf(c.id), d: await assetsOf(d.id), n: await assetsOf(n.id) };
    check("the player crossed the hub to the third team",
      (await rosterOf(player.playerId))?.teamId === d.id);
    check(`${d.name}: −$3`, now.d.cap === before.d.cap - 3, `${before.d.cap} → ${now.d.cap}`);
    check(`${n.name} nets +3 −17: −$14`, now.n.cap === before.n.cap - 14, `${before.n.cap} → ${now.n.cap}`);
    check(`${c.name}: +$17`, now.c.cap === before.c.cap + 17, `${before.c.cap} → ${now.c.cap}`);
    check("the PS spot moved against the money",
      now.c.ps === before.c.ps - 1 && now.n.ps === before.n.ps + 1,
      `C ${before.c.ps}→${now.c.ps}, N ${before.n.ps}→${now.n.ps}`);
  }

  console.log("\nReverted — one status change releases all three:");
  await applyStatusChange(created.id, "SUBMITTED", commish.id, "[test] undo");
  {
    const now = { c: await assetsOf(c.id), d: await assetsOf(d.id), n: await assetsOf(n.id) };
    check("the player is back on the hub", (await rosterOf(player.playerId))?.teamId === n.id);
    check("all three caps restored",
      now.c.cap === before.c.cap && now.d.cap === before.d.cap && now.n.cap === before.n.cap);
    check("the PS spot came home", now.c.ps === before.c.ps && now.n.ps === before.n.ps);
  }

  await prisma.transaction.delete({ where: { id: created.id } });
  console.log("\nCleanup:");
  const after = { c: await assetsOf(c.id), d: await assetsOf(d.id), n: await assetsOf(n.id) };
  check("league is exactly as it was",
    after.c.cap === before.c.cap && after.d.cap === before.d.cap && after.n.cap === before.n.cap &&
    after.c.ps === before.c.ps && after.n.ps === before.n.ps);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
