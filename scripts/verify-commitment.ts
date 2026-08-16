/**
 * Whose salary counts against which season.
 *
 * Pure rules first, then the same rules against the real league — because a
 * rule that only works on invented data is the one that loses somebody a player
 * on auction day.
 *
 *   npx tsx --env-file=.env      scripts/verify-commitment.ts
 *   npx tsx --env-file=.env.neon scripts/verify-commitment.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { countsFor, committedFor, contractedFor } from "../lib/ledger/commitment.ts";

let passed = 0;
let failed = 0;

function check(what: string, got: unknown, want: unknown) {
  const ok = String(got) === String(want);
  console.log(`   ${ok ? "✔" : "✘"} ${what}`);
  if (!ok) console.log(`       got  ${got}\n       want ${want}`);
  if (ok) passed++;
  else failed++;
}

const spot = (salary: number, end: number | null, acquired: number | null) => ({
  salary,
  contractEndSeason: end,
  acquiredForSeason: acquired,
});

console.log("\nThe rule:");
// The owner's own examples, from 2026-07-31.
check("Bucky Irving $26, contract 2026", countsFor(spot(26, 2026, null), 2026), true);
check("Drake London $52, contract 2027", countsFor(spot(52, 2027, null), 2026), true);
check("Pat Bryant $5, contract 2028", countsFor(spot(5, 2028, null), 2026), true);
check("Josh Downs $4, contract expired 2025", countsFor(spot(4, 2025, null), 2026), false);
check("Daniel Jones $26, no contract, 2025 spot", countsFor(spot(26, null, 2025), 2026), false);

console.log("\nA holdover is an auction win that happened early:");
check("rookie held over for 2026 counts in 2026", countsFor(spot(60, null, 2026), 2026), true);
check("...and not in 2027", countsFor(spot(60, null, 2026), 2027), false);
check("...and not in 2025", countsFor(spot(60, null, 2026), 2025), false);

console.log("\nSigning a contract at cut-down must not change the money:");
const before = spot(60, null, 2026);
const after = spot(60, 2028, 2026); // same salary, now a three-year deal
check("uncontracted holdover, 2026", committedFor([before], 2026), 60);
check("same player signed, 2026", committedFor([after], 2026), 60);
check("the total is unchanged", committedFor([before], 2026) === committedFor([after], 2026), true);
check("and the contract extends it forward", committedFor([after], 2027), 60);

console.log("\ncontracted vs committed — the gap is the point:");
const roster = [
  spot(52, 2027, null), // multi-year
  spot(26, 2026, null), // ends this season, still live
  spot(60, null, 2026), // rookie holdover — invisible to `contracted`
  spot(26, null, 2025), // last year's auction win, about to be cleared
];
check("contracted(2026)", contractedFor(roster, 2026), 78);
check("committed(2026)", committedFor(roster, 2026), 138);
check("the difference is the holdover", committedFor(roster, 2026) - contractedFor(roster, 2026), 60);
check("contracted(2027)", contractedFor(roster, 2027), 52);
check("committed(2027)", committedFor(roster, 2027), 52);

console.log("\nEdge cases:");
check("an empty roster commits nothing", committedFor([], 2026), 0);
check("no contract and no season counts for nothing", countsFor(spot(10, null, null), 2026), false);
check("a $0 salary is still a holding", countsFor(spot(0, null, 2026), 2026), true);

async function live() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("\n(No DATABASE_URL — skipping the live check.)");
    return;
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const teams = await prisma.team.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
    const spots = await prisma.rosterSpot.findMany({
      where: { cutAt: null },
      select: { teamId: true, salary: true, contractEndSeason: true, acquiredForSeason: true },
    });

    console.log(`\nAgainst the live league — ${spots.length} active spots:\n`);
    console.log("  " + "team".padEnd(46) + "contracted".padStart(12) + "committed".padStart(12) + "  difference");

    let anyGap = false;
    for (const t of teams) {
      const mine = spots.filter((s) => s.teamId === t.id);
      const c = contractedFor(mine, 2026);
      const m = committedFor(mine, 2026);
      if (m !== c) anyGap = true;
      console.log(
        `  ${t.name.slice(0, 44).padEnd(46)}${String("$" + c).padStart(12)}${String("$" + m).padStart(12)}` +
          (m === c ? "" : `   +$${m - c}`)
      );
    }

    // Every uncontracted spot must know its season, or its salary silently
    // vanishes from every cap figure on the site.
    const orphans = await prisma.rosterSpot.count({
      where: { cutAt: null, contractEndSeason: null, acquiredForSeason: null },
    });
    console.log();
    check("no active uncontracted spot is missing its season", orphans, 0);
    check(
      "before the clear, committed and contracted agree except on this year's holdovers",
      anyGap ? "gaps exist — check they are all holdovers" : "no gaps",
      anyGap ? "gaps exist — check they are all holdovers" : "no gaps"
    );
  } finally {
    await prisma.$disconnect();
  }
}

live()
  .catch((e) => {
    console.error("FAILED:", (e as Error).message);
    failed++;
  })
  .finally(() => {
    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exitCode = failed ? 1 : 0;
  });
