/**
 * Replay the 2025 auction — all 185 real wins — through the new path, locally.
 *
 * The dress rehearsal the owner asked for: v1's `live_auction_entries` are the
 * script, `recordWin` is the stage. Before the replay the rosters get the same
 * clear the real auction day will get (every spot whose salary doesn't belong
 * to the season is cut), because an auction runs on an emptied pool. `--reset`
 * puts every cut spot back and withdraws every replayed win.
 *
 * Local only, and refuses to run against anything else — this cuts and
 * restores hundreds of rows.
 *
 *   npx tsx --env-file=.env scripts/rehearse-auction.ts             # plan only
 *   npx tsx --env-file=.env scripts/rehearse-auction.ts --replay
 *   npx tsx --env-file=.env scripts/rehearse-auction.ts --reset
 *
 * The old database is read with plain SELECTs via OLD_DATABASE_URL (pass
 * ../mpffl-9o/.env.production.local values by hand or a combined env file).
 * Player and team ids are shared between v1 and v2 — preserved at migration —
 * which is what makes a one-to-one replay possible at all.
 */
import { Client } from "pg";
import { prisma } from "../lib/prisma";
import { recordWin, revertWin } from "../lib/auction/win";
import { countsFor } from "../lib/ledger/commitment";
import { currentSeason } from "../lib/constants";

const MODE = process.argv.includes("--replay")
  ? "replay"
  : process.argv.includes("--reset")
    ? "reset"
    : "plan";
const SEASON = currentSeason();
const CLEAR_NOTE = "[rehearsal] cleared for auction replay";

if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Local database only.");
}

async function oldWins(): Promise<{ playerId: number; teamId: number; bid: number }[]> {
  const url = process.env.OLD_DATABASE_URL;
  if (!url) throw new Error("OLD_DATABASE_URL is required to read v1's auction.");
  const source = new Client({ connectionString: url });
  await source.connect();
  try {
    const { rows } = await source.query(
      `SELECT "playerId", "teamId", "winningBid" FROM live_auction_entries
        WHERE "leagueYear" = 2025 ORDER BY "submittedAt"`
    );
    return rows.map((r) => ({ playerId: r.playerId, teamId: r.teamId, bid: r.winningBid }));
  } finally {
    await source.end();
  }
}

async function replay() {
  const commish = await prisma.owner.findFirst({ where: { isCommissioner: true } });
  if (!commish) throw new Error("no commissioner");
  const me = { id: commish.id, teamId: null, isCommissioner: true };

  const already = await prisma.transaction.count({ where: { type: "AUCTION_WIN" } });
  if (already > 0) throw new Error(`${already} win(s) already recorded — reset first.`);

  // The clear, simulated: cut every active spot whose salary isn't the
  // season's business. Same predicate the real clear will use.
  const active = await prisma.rosterSpot.findMany({
    where: { cutAt: null },
    select: { id: true, salary: true, contractEndSeason: true, acquiredForSeason: true },
  });
  const toCut = active.filter((s) => !countsFor(s, SEASON));
  console.log(`  clearing ${toCut.length} of ${active.length} active spots (marked, reversible)`);
  await prisma.rosterSpot.updateMany({
    where: { id: { in: toCut.map((s) => s.id) } },
    data: { cutAt: new Date(), notes: CLEAR_NOTE },
  });

  const wins = await oldWins();
  console.log(`  replaying ${wins.length} wins from the 2025 auction…`);
  let ok = 0;
  const skipped: string[] = [];
  for (const w of wins) {
    const res = await recordWin({ ...w, owner: me, note: "[rehearsal]" });
    if (res.ok) ok++;
    else skipped.push(`player ${w.playerId} → team ${w.teamId} $${w.bid}: ${res.error}`);
  }
  console.log(`  recorded ${ok}, skipped ${skipped.length}`);
  for (const s of skipped.slice(0, 10)) console.log(`    · ${s}`);
  if (skipped.length > 10) console.log(`    · … and ${skipped.length - 10} more`);
}

async function reset() {
  const commish = await prisma.owner.findFirst({ where: { isCommissioner: true } });
  const me = { id: commish!.id, teamId: null, isCommissioner: true };

  const winTxs = await prisma.transaction.findMany({
    where: { type: "AUCTION_WIN", status: "APPROVED" },
    select: { id: true },
  });
  console.log(`  withdrawing ${winTxs.length} replayed wins…`);
  for (const t of winTxs) await revertWin(t.id, me);

  // Delete the rehearsal transactions outright — they were never real.
  const all = await prisma.transaction.findMany({
    where: { type: "AUCTION_WIN" }, select: { id: true },
  });
  for (const t of all) {
    await prisma.transactionStatusLog.deleteMany({ where: { transactionId: t.id } });
    await prisma.ledgerEntry.deleteMany({ where: { transactionId: t.id } });
    await prisma.transaction.delete({ where: { id: t.id } });
  }

  const restored = await prisma.rosterSpot.updateMany({
    where: { notes: CLEAR_NOTE },
    data: { cutAt: null, notes: null },
  });
  console.log(`  restored ${restored.count} cleared spots; removed ${all.length} rehearsal transactions`);

  const leftover = await prisma.rosterSpot.count({ where: { notes: CLEAR_NOTE } });
  const leftoverTx = await prisma.transaction.count({ where: { type: "AUCTION_WIN" } });
  console.log(`  leftovers: ${leftover} spots, ${leftoverTx} transactions ${leftover + leftoverTx === 0 ? "✓" : "⚠"}`);
}

async function main() {
  console.log(`\n=== 2025 auction rehearsal — ${MODE} ===\n`);
  if (MODE === "replay") await replay();
  else if (MODE === "reset") await reset();
  else {
    const wins = await oldWins();
    const active = await prisma.rosterSpot.findMany({
      where: { cutAt: null },
      select: { salary: true, contractEndSeason: true, acquiredForSeason: true },
    });
    const toCut = active.filter((s) => !countsFor(s, SEASON)).length;
    console.log(`  would clear ${toCut} spots, then replay ${wins.length} wins.`);
    console.log(`  total 2025 auction money: $${wins.reduce((s, w) => s + w.bid, 0)}`);
    console.log(`  run with --replay, look at /auction, then --reset.\n`);
  }
}

main().finally(() => prisma.$disconnect());
