/**
 * Trade shape rules, asserted. Pure — no database.
 *
 * The fixture deal is the real one from the group chat, 2026-08-02: the trade
 * that revealed the form couldn't file it.
 *
 *   npx tsx scripts/verify-trade-shape.ts
 */
import { checkTradeShape, type TradeLegShape } from "../lib/trade-shape.ts";

let passed = 0;
let failed = 0;

function check(what: string, got: unknown, want: unknown) {
  const ok = String(got) === String(want);
  console.log(`   ${ok ? "✔" : "✘"} ${what}`);
  if (!ok) console.log(`       got  ${got}\n       want ${want}`);
  if (ok) passed++;
  else failed++;
}

const NAMES: Record<number, string> = {
  1: "Team Alpha",
  2: "Team Bravo",
  3: "Team Charlie",
  4: "Team Delta",
};
const name = (id: number) => NAMES[id] ?? `Team #${id}`;
const run = (teams: number[], legs: TradeLegShape[]) => checkTradeShape(teams, legs, name);

console.log("\nThe deal that started this — a hub, four legs, three teams:");
const pickens: TradeLegShape[] = [
  { fromTeamId: 1, toTeamId: 2 },                  // $3 cap
  { fromTeamId: 2, toTeamId: 3 },                  // $17 cap
  { fromTeamId: 3, toTeamId: 2 },                  // 1 UCut
  { fromTeamId: 2, toTeamId: 1, playerId: 900 },   // George Pickens
];
check("is well-formed", run([1, 2, 3], pickens).length, 0);

console.log("\nA cycle — the topology that cannot be split into bilaterals:");
check(
  "A→B→C→A is well-formed",
  run([1, 2, 3], [
    { fromTeamId: 1, toTeamId: 2, playerId: 10 },
    { fromTeamId: 2, toTeamId: 3, playerId: 11 },
    { fromTeamId: 3, toTeamId: 1, playerId: 12 },
  ]).length,
  0
);

console.log("\nTwo teams — the dominant case, unchanged:");
check("a plain bilateral passes", run([1, 2], [{ fromTeamId: 1, toTeamId: 2, playerId: 10 }]).length, 0);
check(
  "one-sided giving is still a trade",
  run([1, 2], [{ fromTeamId: 1, toTeamId: 2 }]).length,
  0
);

console.log("\nRejected shapes:");
check("one team is not a trade", run([1], [])[0], "A trade needs at least two teams.");
check(
  "a team listed twice",
  run([1, 1, 2], [{ fromTeamId: 1, toTeamId: 2 }]).includes("The same team is listed twice."),
  true
);
check("no legs at all", run([1, 2], []).includes("Nothing would move."), true);
check(
  "a self-leg",
  run([1, 2], [{ fromTeamId: 1, toTeamId: 1 }]).some((e) => e.includes("to itself")),
  true
);
check(
  "a leg naming an outsider",
  run([1, 2], [
    { fromTeamId: 1, toTeamId: 2 },
    { fromTeamId: 1, toTeamId: 4 },
  ]).some((e) => e.includes("isn't part of this trade")),
  true
);
check(
  "an idle team is named",
  run([1, 2, 3], [{ fromTeamId: 1, toTeamId: 2, playerId: 10 }]).some((e) =>
    e.includes("Cakes on the Low is in this trade but sends and receives nothing")
  ),
  true
);
check(
  "the idle-team message names the right team",
  run([1, 2, 3], [{ fromTeamId: 1, toTeamId: 2 }]).filter((e) => e.includes("sends and receives nothing")).length,
  1
);

console.log("\nRelays:");
const relay = run([1, 2, 3], [
  { fromTeamId: 2, toTeamId: 1, playerId: 900 },
  { fromTeamId: 1, toTeamId: 3, playerId: 900 },
]);
check("a player on two legs is blocked", relay.some((e) => e.includes("same player is on two legs")), true);
check("and the message suggests the direct leg", relay.some((e) => e.includes("straight to his destination")), true);
check(
  "two different players on two legs is fine",
  run([1, 2], [
    { fromTeamId: 1, toTeamId: 2, playerId: 10 },
    { fromTeamId: 2, toTeamId: 1, playerId: 11 },
  ]).length,
  0
);

console.log("\nAccumulation — several problems reported at once:");
const messy = run([1, 1], [{ fromTeamId: 1, toTeamId: 1 }]);
check("duplicate team AND self-leg both surface", messy.length >= 2, true);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exitCode = failed ? 1 : 0;
