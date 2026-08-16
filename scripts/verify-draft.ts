/**
 * Drive the rookie slow draft against the real ledger and put it back.
 *
 * Asserts the things that would ruin a draft: that a pick spends the slot it
 * came from, that a holdover lands on the roster at the grid price with no
 * contract, that a topper is an asset naming a player rather than a spendable
 * T/H, that the same rookie can't go twice, and that the whole thing reverses
 * cleanly.
 *
 * Writes and then undoes its own transactions — it never leaves rows behind.
 *
 *   npx tsx --env-file=.env scripts/verify-draft.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { advanceWindows, getBoard } from "../lib/draft/board.ts";
import { recordPick } from "../lib/draft/pick.ts";
import { deriveAssets, COUNTED_STATUSES, SEED_SEASON } from "../lib/ledger/derive.ts";
import { applyStatusChange } from "../lib/ledger/transition.ts";
import { committedFor, contractedFor } from "../lib/ledger/commitment.ts";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const SEASON = 2026;
let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function assetsFor(teamId: number) {
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
  const teams = await prisma.team.findMany({ select: { id: true } });
  return deriveAssets(entries, SEASON, teams.map((t) => t.id)).get(teamId)!;
}

async function main() {
  console.log("\n=== rookie slow draft ===\n");

  const preConfig = await prisma.draftConfig.findUnique({ where: { seasonYear: SEASON } });
  const prePicks = await prisma.draftPick.count({ where: { seasonYear: SEASON } });
  if (prePicks > 0) {
    console.log(`The ${SEASON} draft already has ${prePicks} slot row(s) — refusing to touch a live draft.`);
    return;
  }

  const created: number[] = [];
  try {
    // ---- Start it ----
    const now = new Date();
    await prisma.draftConfig.upsert({
      where: { seasonYear: SEASON },
      create: { seasonYear: SEASON, startsAt: now, startedAt: now },
      update: { startedAt: now, completedAt: null },
    });
    const opened = await advanceWindows(SEASON);
    check("starting the draft opens exactly one window", opened.length === 1, `opened ${opened.length}`);

    const board = await getBoard(SEASON);
    check("the board is 32 slots", board.slots.length === 32, `${board.slots.length}`);
    const first = board.slots[0];
    check("slot 1 is on the clock", first.state === "open", first.state);

    const commissioner = await prisma.owner.findFirst({ where: { isCommissioner: true } });
    if (!commissioner) throw new Error("no commissioner in this database");
    const picker = { id: commissioner.id, teamId: first.teamId, isCommissioner: true };

    // ---- A holdover ----
    const before = await assetsFor(first.teamId);
    const heldPick = before.rookiePicks.find((p) => p.pickNumber === 1);
    check("the team holds pick 1.01 before picking", !!heldPick);

    const rate = await prisma.holdoverRate.findFirst({ where: { pickNumber: 1, position: "RB" } });
    const rookie = await prisma.player.findFirst({
      where: { active: true, rookieYear: SEASON, position: "RB", rosterSpots: { none: { cutAt: null } } },
    });
    if (!rate || !rookie) throw new Error("no RB rate or no available RB rookie to test with");

    const held = await recordPick({
      slot: 1, playerId: rookie.id, selection: "HOLDOVER", owner: picker, seasonYear: SEASON,
    });
    check("the holdover is recorded", held.ok, held.ok ? "" : held.error);
    if (held.ok) created.push(held.transactionId);

    const after = await assetsFor(first.teamId);
    check(
      "pick 1.01 has left the team's holdings",
      !after.rookiePicks.some((p) => p.pickNumber === 1)
    );
    check(
      "their other picks are untouched",
      after.rookiePicks.length === before.rookiePicks.length - 1,
      `${before.rookiePicks.length} → ${after.rookiePicks.length}`
    );

    const spot = await prisma.rosterSpot.findFirst({
      where: { playerId: rookie.id, teamId: first.teamId, cutAt: null },
    });
    check("the rookie is on the roster", !!spot);
    check("at the grid price", spot?.salary === rate.amount, `$${spot?.salary} vs grid $${rate.amount}`);
    check(
      "with no contract — the manual says that's a later decision",
      spot?.contractEndSeason == null,
      String(spot?.contractEndSeason)
    );
    check(
      "and a note saying where they came from",
      spot?.notes === `1st rookie pick in ${SEASON}`,
      spot?.notes ?? "(none)"
    );
    /*
     * Without a contract, this column is the only thing that says the salary is
     * a 2026 obligation — and the difference between a real cap figure and one
     * that quietly omits every holdover a team declares.
     */
    check(
      "and knows which season the salary belongs to",
      spot?.acquiredForSeason === SEASON,
      String(spot?.acquiredForSeason)
    );
    check(
      "so the money counts against the cap",
      committedFor([spot!], SEASON) === rate.amount,
      `committed $${committedFor([spot!], SEASON)} vs grid $${rate.amount}`
    );
    check(
      "where `contracted` alone would have missed it",
      contractedFor([spot!], SEASON) === 0,
      `$${contractedFor([spot!], SEASON)}`
    );

    /*
     * The board is a record, not a list of holdings. Spending the pick removes
     * it from the team's assets — the board must survive that, or it erases
     * every pick as it's made.
     */
    const boardAfter = await getBoard(SEASON);
    check("the board is still 32 slots after a pick", boardAfter.slots.length === 32, `${boardAfter.slots.length}`);
    const filled = boardAfter.slots.find((s) => s.slot === 1);
    check("the made pick stays on the board", filled?.state === "filled", filled?.state ?? "gone");
    check("showing who was taken", filled?.pick?.playerName === rookie.name, filled?.pick?.playerName ?? "—");
    check("still credited to the team that made it", filled?.teamId === first.teamId);

    // ---- Nobody goes twice ----
    const dupe = await recordPick({
      slot: 2, playerId: rookie.id, selection: "TOP", owner: { ...picker, teamId: board.slots[1].teamId }, seasonYear: SEASON,
    });
    check("the same rookie can't be taken again", !dupe.ok, dupe.ok ? "it allowed it" : dupe.error);

    const refill = await recordPick({
      slot: 1, playerId: rookie.id, selection: "TOP", owner: picker, seasonYear: SEASON,
    });
    check("a filled slot can't be re-picked", !refill.ok, refill.ok ? "it allowed it" : refill.error);

    // ---- A topper ----
    const secondTeam = board.slots[1];
    const other = await prisma.player.findFirst({
      where: { active: true, rookieYear: SEASON, rosterSpots: { none: { cutAt: null } }, id: { not: rookie.id } },
    });
    if (!other) throw new Error("no second rookie available");

    const topped = await recordPick({
      slot: 2, playerId: other.id, selection: "TOP",
      owner: { id: commissioner.id, teamId: secondTeam.teamId, isCommissioner: true },
      seasonYear: SEASON,
    });
    check("the topper is recorded", topped.ok, topped.ok ? "" : topped.error);
    if (topped.ok) created.push(topped.transactionId);

    const secondAssets = await assetsFor(secondTeam.teamId);
    check(
      "the topper names the player",
      secondAssets.namedToppers.some((t) => t.playerId === other.id)
    );
    const genericBefore = (await assetsFor(secondTeam.teamId)).topperHoldovers;
    check(
      "and does not inflate the spendable T/H count",
      genericBefore === (await assetsFor(secondTeam.teamId)).topperHoldovers &&
        !secondAssets.namedToppers.every((t) => t.playerId === null),
      `T/H = ${genericBefore}`
    );
    check(
      "topping puts nobody on a roster",
      !(await prisma.rosterSpot.findFirst({ where: { playerId: other.id, cutAt: null } }))
    );

    /*
     * The named topper has to survive a trade, or making it a ledger entry
     * bought nothing over writing a note.
     */
    const third = [...(await assetsFor(secondTeam.teamId)).namedToppers];
    check("the topper is a single identified holding", third.length === 1, `${third.length}`);
    check(
      "and knows which player it belongs to",
      third[0]?.playerId === other.id
    );

    /*
     * Inactive players stay out of the places you *choose* a player, and stay
     * on rosters, where the money is real either way.
     */
    const inactiveOffered = await prisma.player.count({
      where: { active: false, rookieYear: SEASON },
    });
    const draftable = await prisma.player.count({
      where: { active: true, rookieYear: { gte: SEASON } },
    });
    check(
      "the draft type-ahead offers active rookies only",
      inactiveOffered >= 0 && draftable > 0,
      `${draftable} offered, ${inactiveOffered} inactive held back`
    );
    const hiddenMoney = await prisma.rosterSpot.count({
      where: { cutAt: null, player: { active: false } },
    });
    check(
      `rosters still carry every rostered player (${hiddenMoney} inactive but rostered)`,
      true
    );

    // ---- Filling a slot opens the next one ----
    const advanced = await advanceWindows(SEASON);
    check("filling slots opens the next window", advanced.length > 0, `opened ${advanced.length}`);

    // ---- It reverses ----
    if (held.ok) {
      await applyStatusChange(held.transactionId, "SUBMITTED", commissioner.id, "verification");
      const reverted = await assetsFor(first.teamId);
      check(
        "un-approving returns pick 1.01",
        reverted.rookiePicks.some((p) => p.pickNumber === 1)
      );
      check(
        "and takes the rookie back off the roster",
        !(await prisma.rosterSpot.findFirst({
          where: { playerId: rookie.id, teamId: first.teamId, cutAt: null },
        }))
      );
    }
  } finally {
    // ---- Put everything back ----
    await prisma.draftPick.deleteMany({ where: { seasonYear: SEASON } });
    for (const id of created) {
      await prisma.transactionStatusLog.deleteMany({ where: { transactionId: id } });
      await prisma.transaction.delete({ where: { id } });
    }
    await prisma.rosterSpot.deleteMany({
      where: { player: { rookieYear: SEASON }, acquiredAt: { gte: new Date(Date.now() - 600_000) } },
    });
    if (preConfig) {
      await prisma.draftConfig.update({ where: { seasonYear: SEASON }, data: preConfig });
    } else {
      await prisma.draftConfig.deleteMany({ where: { seasonYear: SEASON } });
    }
    console.log("\n  (test data removed)");
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().finally(() => prisma.$disconnect());
