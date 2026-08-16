/**
 * The practice-squad decision table, walked branch by branch. Pure — no
 * database.
 *
 *   npx tsx scripts/verify-practice-squad.ts
 */
import { psTransition } from "../lib/practice-squad.ts";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok || !detail ? "" : ` — ${detail}`}`);
  if (ok) pass++;
  else fail++;
};

const S = 2026;
const t = psTransition;

console.log("\nGoing on PS:");
{
  const e = t({ designation: "ACTIVE", contractEndSeason: 2028, psSeason: null }, "PS", S, null, "Player A");
  check("a contracted deal stretches a year", e.contractDelta === 1, String(e.contractDelta));
  check("the PS year is stamped", e.psSeason === S);
  check("the note names the new end year", (e.note ?? "").includes("2029"), e.note);
  check("no warning when last year was clean", e.warning == null);
}
{
  const e = t({ designation: "ACTIVE", contractEndSeason: null, psSeason: null }, "PS", S, null, "Rookie B");
  check("an uncontracted rookie gets no delta", e.contractDelta === 0);
  check("but is stamped", e.psSeason === S);
  check("and the note says the contract will cover it", (e.note ?? "").includes("when one lands"), e.note);
}
{
  const e = t({ designation: "IR", contractEndSeason: 2027, psSeason: null }, "PS", S, S - 1, "Player C");
  check("two years running warns", (e.warning ?? "").includes("two years running"), e.warning);
  check("but still applies — warn, don't block", e.contractDelta === 1 && e.psSeason === S);
}

console.log("\nComing off PS:");
{
  const e = t({ designation: "PS", contractEndSeason: 2029, psSeason: S }, "ACTIVE", S, null, "Player D");
  check("in-season activation gives the year back", e.contractDelta === -1);
  check("and clears the stamp", e.psSeason === null);
  check("the note names the restored year", (e.note ?? "").includes("2028"), e.note);
}
{
  const e = t({ designation: "PS", contractEndSeason: 2029, psSeason: S - 1 }, "ACTIVE", S, null, "Player E");
  check("a completed PS year keeps the extension", e.contractDelta === 0, String(e.contractDelta));
  check("and clears the stamp", e.psSeason === null);
  check("the note says the year is done", (e.note ?? "").includes("done"), e.note);
}
{
  const e = t({ designation: "PS", contractEndSeason: 2029, psSeason: null }, "ACTIVE", S, null, "Player F");
  check("an unstamped v1-era row refuses to guess", e.contractDelta === 0);
  check("and says to check by hand", (e.note ?? "").includes("by hand"), e.note);
}
{
  const e = t({ designation: "PS", contractEndSeason: null, psSeason: S }, "IR", S, null, "Player G");
  check("uncontracted off PS: no delta, stamp cleared", e.contractDelta === 0 && e.psSeason === null);
}

console.log("\nNon-transitions:");
{
  const e = t({ designation: "ACTIVE", contractEndSeason: 2028, psSeason: null }, "IR", S, null, "Player H");
  check("ACTIVE→IR touches nothing", e.contractDelta === 0 && e.note == null && e.psSeason === null);
}
{
  const e = t({ designation: "PS", contractEndSeason: 2029, psSeason: S }, "PS", S, null, "Player I");
  check("PS→PS keeps the stamp", e.contractDelta === 0 && e.psSeason === S);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
