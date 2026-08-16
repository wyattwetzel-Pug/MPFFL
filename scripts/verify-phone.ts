/**
 * Phone normalisation, asserted.
 *
 * The failure this guards against is silent: a number Twilio won't accept is
 * stored happily, and the owner simply never hears from the draft.
 *
 *   npx tsx scripts/verify-phone.ts
 */
import { normalisePhone, formatPhone } from "../lib/phone.ts";

let passed = 0;
let failed = 0;

function check(what: string, got: unknown, want: unknown) {
  const ok = String(got) === String(want);
  console.log(`   ${ok ? "✔" : "✘"} ${what}`);
  if (!ok) console.log(`       got  ${got}\n       want ${want}`);
  if (ok) passed++;
  else failed++;
}

const p = (s: string) => {
  const r = normalisePhone(s);
  return r.ok ? String(r.phone) : `ERROR: ${r.error}`;
};

console.log("\nWhat owners here actually type:");
check("(206) 650-8064", p("(206) 650-8064"), "+12066508064");
check("206-650-8064", p("206-650-8064"), "+12066508064");
check("2066508064", p("2066508064"), "+12066508064");
check("1 (206) 650-8064", p("1 (206) 650-8064"), "+12066508064");
check("+1 206 650 8064", p("+1 206 650 8064"), "+12066508064");

console.log("\nOwners abroad — the case the old rule refused outright:");
check("+352 621 798 646 (Luxembourg)", p("+352 621 798 646"), "+352621798646");
check("+352621798646", p("+352621798646"), "+352621798646");
check("00352 621 798 646 (dialled from abroad)", p("00352 621 798 646"), "+352621798646");
check("+44 7700 900123 (UK)", p("+44 7700 900123"), "+447700900123");
check("+61 412 345 678 (Australia)", p("+61 412 345 678"), "+61412345678");

console.log("\nEmpty clears the number rather than failing:");
check("empty string", p(""), "null");
check("whitespace", p("   "), "null");

console.log("\nRejected:");
check("too few digits", p("12345").startsWith("ERROR"), true);
check("letters only", p("call me").startsWith("ERROR"), true);
check("nine digits, no country code", p("206650806").startsWith("ERROR"), true);
check("more than E.164 allows", p("+1234567890123456").startsWith("ERROR"), true);
check("the message says how to enter an international number", p("206650806").includes("country code"), true);

console.log("\nDisplay:");
check("US numbers read the way the league writes them", formatPhone("+12066508064"), "(206) 650-8064");
check("international is left alone rather than mis-grouped", formatPhone("+352621798646"), "+352621798646");
check("no number", formatPhone(null), "");

console.log("\nRound trip — editing a stored number must not corrupt it:");
for (const stored of ["+12066508064", "+352621798646", "+447700900123"]) {
  check(`${stored} survives display → re-entry`, p(formatPhone(stored)), stored);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exitCode = failed ? 1 : 0;
