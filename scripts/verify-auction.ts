/**
 * Drive auction wins against the real ledger and put everything back.
 *
 * Asserts the things that would ruin an auction: that a win lands on the
 * roster at the bid with its season stamped, that the money moves in
 * `committed` and nowhere else, that a topped win costs last-bid-plus-one and
 * consumes the named right, that the automatic right consumes nothing, that
 * the same player can't be won twice, and that undo restores the world.
 *
 * Refuses to run if the season already has real wins — it writes and removes
 * its own, and must never do that to a live auction.
 *
 *   npx tsx --env-file=.env scripts/verify-auction.ts
 */
import { prisma } from "../lib/prisma";
import { recordWin, revertWin, rightsOn } from "../lib/auction/win";
import { committedFor } from "../lib/ledger/commitment";
import { currentSeason } from "../lib/constants";

const SEASON = currentSeason();
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok || !detail ? "" : ` — ${detail}`}`);
  if (ok) pass++;
  else fail++;
};

async function committedOf(teamId: number) {
  const spots = await prisma.rosterSpot.findMany({
    where: { teamId, cutAt: null },
    select: { salary: true, contractEndSeason: true, acquiredForSeason: true },
  });
  return committedFor(spots, SEASON);
}

async function main() {
  console.log(`\n=== auction wins, ${SEASON} ===\n`);

  const existing = await prisma.transaction.count({
    where: { type: "AUCTION_WIN", entries: { some: { seasonYear: SEASON } } },
  });
  if (existing > 0) {
    console.log(`The ${SEASON} auction already has ${existing} win(s) — refusing to touch it.`);
    return;
  }

  const commish = await prisma.owner.findFirst({ where: { isCommissioner: true } });
  if (!commish) throw new Error("no commissioner");
  const me = { id: commish.id, teamId: null, isCommissioner: true };
  const notCommish = { id: commish.id, teamId: 1, isCommissioner: false };

  const [teamA, teamB] = await prisma.team.findMany({ take: 2, orderBy: { id: "asc" } });

  // Players nobody has rostered — the pool.
  const pool = await prisma.player.findMany({
    where: { active: true, rosterSpots: { none: {} } },
    take: 3,
    orderBy: { id: "asc" },
  });
  if (pool.length < 3) throw new Error("need three never-rostered players to test with");
  const [p1, p2, p3] = pool;

  const cleanup: { transactions: number[]; spots: number[]; extraTx: number[] } = {
    transactions: [], spots: [], extraTx: [],
  };

  try {
    // ---- A plain win ----
    console.log("A plain win:");
    const before = await committedOf(teamA.id);
    const w1 = await recordWin({ playerId: p1.id, teamId: teamA.id, bid: 37, owner: me });
    check("records", w1.ok, w1.ok ? "" : w1.error);
    if (w1.ok) cleanup.transactions.push(w1.transactionId);

    const spot = await prisma.rosterSpot.findFirst({
      where: { playerId: p1.id, teamId: teamA.id, cutAt: null },
    });
    check("the player is on the roster", !!spot);
    check("at the bid", spot?.salary === 37, `$${spot?.salary}`);
    check("with no contract", spot?.contractEndSeason == null);
    check("and the season stamped", spot?.acquiredForSeason === SEASON, String(spot?.acquiredForSeason));
    check("notes read like an auction win", spot?.notes === `Auction ${SEASON}`, spot?.notes ?? "(none)");
    check("committed moved by exactly the bid", (await committedOf(teamA.id)) === before + 37);

    // ---- Refusals ----
    console.log("\nRefusals:");
    const dupe = await recordWin({ playerId: p1.id, teamId: teamB.id, bid: 5, owner: me });
    check("the same player can't be won twice", !dupe.ok, dupe.ok ? "it allowed it" : dupe.error);
    const zero = await recordWin({ playerId: p2.id, teamId: teamA.id, bid: 0, owner: me });
    check("a $0 bid is refused", !zero.ok);
    const notMe = await recordWin({ playerId: p2.id, teamId: teamA.id, bid: 5, owner: notCommish });
    check("a non-commissioner is refused", !notMe.ok);
    const noRight = await recordWin({
      playerId: p2.id, teamId: teamA.id, bid: 10, owner: me, topped: { byTeamId: teamB.id },
    });
    check("a top without a right is refused", !noRight.ok, noRight.ok ? "allowed" : noRight.error);

    // ---- A named topper, granted and exercised ----
    console.log("\nA named topper:");
    const grant = await prisma.transaction.create({
      data: {
        type: "ADJUSTMENT", status: "COMPLETED",
        note: "[test] grant a named topper",
        entries: {
          create: [{
            seasonYear: SEASON, assetType: "TOPPER_HOLDOVER",
            fromTeamId: null, toTeamId: teamB.id, amount: 1,
            playerId: p2.id, label: `[test] topper on ${p2.name}`,
          }],
        },
      },
      select: { id: true },
    });
    cleanup.extraTx.push(grant.id);

    const rights = await rightsOn(p2.id, SEASON);
    check("rightsOn sees the named right", rights.some((r) => r.kind === "NAMED" && r.teamId === teamB.id),
      JSON.stringify(rights));

    const w2 = await recordWin({
      playerId: p2.id, teamId: teamA.id, bid: 20, owner: me, topped: { byTeamId: teamB.id },
    });
    check("the top records", w2.ok, w2.ok ? "" : w2.error);
    if (w2.ok) cleanup.transactions.push(w2.transactionId);

    const topSpot = await prisma.rosterSpot.findFirst({
      where: { playerId: p2.id, cutAt: null }, select: { teamId: true, salary: true },
    });
    check("the player goes to the topper's team", topSpot?.teamId === teamB.id);
    check("at last bid plus one", topSpot?.salary === 21, `$${topSpot?.salary}`);
    check("the named right is consumed", (await rightsOn(p2.id, SEASON)).length === 0);

    // ---- The automatic right ----
    console.log("\nThe automatic right:");
    // Fabricate a finished stint: p3 played for teamA on a contract that ended
    // last season, and was cleared into the pool.
    const stint = await prisma.rosterSpot.create({
      data: {
        teamId: teamA.id, playerId: p3.id, salary: 25,
        contractEndSeason: SEASON - 1, cutAt: new Date(),
      },
      select: { id: true },
    });
    cleanup.spots.push(stint.id);

    const auto = await rightsOn(p3.id, SEASON);
    check("an expired contract leaves the old team the right",
      auto.some((r) => r.kind === "AUTOMATIC" && r.teamId === teamA.id), JSON.stringify(auto));

    const w3 = await recordWin({
      playerId: p3.id, teamId: teamB.id, bid: 12, owner: me, topped: { byTeamId: teamA.id },
    });
    check("the automatic top records", w3.ok, w3.ok ? "" : w3.error);
    if (w3.ok) cleanup.transactions.push(w3.transactionId);
    const autoSpot = await prisma.rosterSpot.findFirst({
      where: { playerId: p3.id, cutAt: null }, select: { teamId: true, salary: true },
    });
    check("player to the old team at +$1", autoSpot?.teamId === teamA.id && autoSpot?.salary === 13,
      `team ${autoSpot?.teamId} $${autoSpot?.salary}`);
    // The proof that nothing was consumed: undo the win and the right is
    // simply *there* again, because it was never an asset to spend.
    if (w3.ok) {
      const undoAuto = await revertWin(w3.transactionId, me);
      check("undoing the automatic top runs", undoAuto.ok, undoAuto.ok ? "" : undoAuto.error);
      check("and the automatic right is simply there again",
        (await rightsOn(p3.id, SEASON)).some((r) => r.kind === "AUTOMATIC" && r.teamId === teamA.id));
    }

    // ---- Undo ----
    console.log("\nUndo:");
    const beforeUndo = await committedOf(teamA.id);
    const undo = await revertWin(cleanup.transactions[0], me);
    check("the undo runs", undo.ok, undo.ok ? "" : undo.error);
    check("the player leaves the roster",
      !(await prisma.rosterSpot.findFirst({ where: { playerId: p1.id, cutAt: null } })));
    check("committed gives the bid back", (await committedOf(teamA.id)) === beforeUndo - 37);
    const dead = await prisma.transaction.findUnique({
      where: { id: cleanup.transactions[0] }, select: { status: true },
    });
    check("the win is withdrawn, not deleted", dead?.status === "WITHDRAWN");
    const again = await revertWin(cleanup.transactions[0], me);
    check("a withdrawn win can't be undone twice", !again.ok);

    const undoTop = await revertWin(cleanup.transactions[1], me);
    check("undoing a top returns the named right", undoTop.ok &&
      (await rightsOn(p2.id, SEASON)).some((r) => r.kind === "NAMED" && r.teamId === teamB.id));
  } finally {
    // ---- Put everything back ----
    for (const id of cleanup.transactions) {
      const t = await prisma.transaction.findUnique({ where: { id }, select: { status: true } });
      if (t && (t.status === "APPROVED" || t.status === "COMPLETED")) {
        await revertWin(id, me).catch(() => {});
      }
    }
    await prisma.rosterSpot.deleteMany({
      where: {
        playerId: { in: [p1.id, p2.id, p3.id] },
        id: { notIn: cleanup.spots },
      },
    });
    await prisma.rosterSpot.deleteMany({ where: { id: { in: cleanup.spots } } });
    for (const id of [...cleanup.transactions, ...cleanup.extraTx]) {
      await prisma.transactionStatusLog.deleteMany({ where: { transactionId: id } });
      await prisma.ledgerEntry.deleteMany({ where: { transactionId: id } });
      await prisma.transaction.deleteMany({ where: { id } });
    }
    console.log("\n  (test data removed)");
  }

  const leftoverSpots = await prisma.rosterSpot.count({
    where: { playerId: { in: [p1.id, p2.id, p3.id] } },
  });
  const leftoverTx = await prisma.transaction.count({ where: { type: "AUCTION_WIN" } });
  check("no spots left behind", leftoverSpots === 0, String(leftoverSpots));
  check("no win transactions left behind", leftoverTx === 0, String(leftoverTx));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
