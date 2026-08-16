/**
 * The league timezone, asserted.
 *
 * These are the cases that would otherwise be found by someone losing a player
 * to a deadline that fired at the wrong hour.
 *
 *   npx tsx scripts/verify-tz.ts
 */
import {
  LEAGUE_TIMEZONE,
  zonedToInstant,
  instantToZonedInput,
  formatLeagueDateTime,
  formatLeagueDate,
} from "../lib/tz.ts";

let passed = 0;
let failed = 0;

function check(what: string, got: unknown, want: unknown) {
  const ok = String(got) === String(want);
  console.log(`   ${ok ? "✔" : "✘"} ${what}`);
  if (!ok) console.log(`       got  ${got}\n       want ${want}`);
  if (ok) passed++;
  else failed++;
}

console.log(`\nLeague timezone: ${LEAGUE_TIMEZONE}\n`);

console.log("Wall clock → instant:");
// PDT, UTC-7.
check("auction, 10:30 on 15 Aug 2026", zonedToInstant("2026-08-15T10:30")?.toISOString(), "2026-08-15T17:30:00.000Z");
// Also PDT — and the day rolls over in UTC, which is the whole point.
check("cut-down, 23:59 on 8 Sep 2026", zonedToInstant("2026-09-08T23:59")?.toISOString(), "2026-09-09T06:59:00.000Z");
// PST, UTC-8: after the November change.
check("trade deadline, 23:59 on 24 Nov 2026", zonedToInstant("2026-11-24T23:59")?.toISOString(), "2026-11-25T07:59:00.000Z");
check("settlement, 23:59 on 14 Feb 2027", zonedToInstant("2027-02-14T23:59")?.toISOString(), "2027-02-15T07:59:00.000Z");
// A bare date is the start of that day, not midnight UTC.
check("bare date, 1 Mar 2026", zonedToInstant("2026-03-01")?.toISOString(), "2026-03-01T08:00:00.000Z");

console.log("\nDST boundaries — where a one-pass conversion goes wrong:");
// Spring forward 2026: 2am PST → 3am PDT on 8 March.
check("01:30 on 8 Mar 2026 (before the jump)", zonedToInstant("2026-03-08T01:30")?.toISOString(), "2026-03-08T09:30:00.000Z");
check("03:30 on 8 Mar 2026 (after the jump)", zonedToInstant("2026-03-08T03:30")?.toISOString(), "2026-03-08T10:30:00.000Z");
// Fall back 2026: 1 November.
check("00:30 on 1 Nov 2026 (still PDT)", zonedToInstant("2026-11-01T00:30")?.toISOString(), "2026-11-01T07:30:00.000Z");
check("03:00 on 1 Nov 2026 (now PST)", zonedToInstant("2026-11-01T03:00")?.toISOString(), "2026-11-01T11:00:00.000Z");

console.log("\nRound trip — the form must not drift a value it didn't touch:");
for (const wall of [
  "2026-08-15T10:30",
  "2026-09-08T23:59",
  "2026-11-24T23:59",
  "2027-02-14T23:59",
  "2026-03-08T03:30",
]) {
  const back = instantToZonedInput(zonedToInstant(wall)!, true);
  check(`${wall} survives a round trip`, back, wall);
}
check("bare date survives a round trip", instantToZonedInput(zonedToInstant("2026-03-01")!, false), "2026-03-01");

console.log("\nDisplay:");
check(
  "auction reads back in league time",
  formatLeagueDateTime(new Date("2026-08-15T17:30:00.000Z")),
  "Sat, Aug 15, 2026, 10:30 AM PDT"
);
check(
  "cut-down keeps its own date",
  formatLeagueDateTime(new Date("2026-09-09T06:59:00.000Z")),
  "Tue, Sep 8, 2026, 11:59 PM PDT"
);
check(
  "winter reads PST",
  formatLeagueDateTime(new Date("2026-11-25T07:59:00.000Z")),
  "Tue, Nov 24, 2026, 11:59 PM PST"
);
check("a date alone", formatLeagueDate(new Date("2026-08-15T17:30:00.000Z")), "Sat, Aug 15, 2026");

console.log("\nRejects what isn't a date:");
check("empty", zonedToInstant(""), "null");
check("prose", zonedToInstant("next tuesday"), "null");

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exitCode = failed ? 1 : 0;
