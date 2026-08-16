/**
 * Put a time on the 2026 auction.
 *
 * It was stored as a bare date, which is midnight — and midnight on the 15th is
 * the evening of the 14th once a timezone is applied. Anything that eventually
 * enforces against the auction (declarations closing, the pool locking) would
 * have fired a day early.
 *
 * The site is uniformly naive about timezones: the form parses a
 * `datetime-local` string on the server and the page formats it back without a
 * zone, so what an owner types is what everybody reads. This writes 10:30 in
 * that same frame, which is the only way the calendar page shows "10:30 AM".
 * The real question — which zone the league means — is recorded in PLAN.md
 * §16.6 and has to be settled before any deadline enforces.
 *
 * Idempotent. Dry run by default.
 *
 *   npx tsx --env-file=.env      scripts/set-auction-time.ts
 *   npx tsx --env-file=.env.neon scripts/set-auction-time.ts --apply
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const apply = process.argv.includes("--apply");
const SEASON = 2026;
const WANTED = new Date("2026-08-15T10:30:00.000Z");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const show = (d: Date) =>
  `${d.toISOString()}  →  displays as ${d.toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: "UTC",
  })}`;

async function main() {
  const host = (process.env.DATABASE_URL ?? "").split("@")[1]?.split("/")[0];
  console.log(`\n${SEASON} auction time — against ${host}\n`);

  const row = await prisma.leagueMilestone.findUnique({
    where: { seasonYear_key: { seasonYear: SEASON, key: "AUCTION" } },
  });
  if (!row) throw new Error("No AUCTION milestone for 2026 — set it in /admin/calendar first.");

  console.log(`  was:  ${show(row.occursAt)}`);
  console.log(`  now:  ${show(WANTED)}`);
  console.log(`  note: ${row.note ?? "(none)"}\n`);

  if (row.occursAt.getTime() === WANTED.getTime()) {
    console.log("  Already set — nothing to do.\n");
    return;
  }
  if (!apply) {
    console.log("  Dry run. Re-run with --apply to write it.\n");
    return;
  }

  const after = await prisma.leagueMilestone.update({
    where: { id: row.id },
    data: { occursAt: WANTED, setAt: new Date() },
  });
  console.log(`  Written. ${show(after.occursAt)}\n`);
}

main()
  .catch((e) => {
    console.error("FAILED:", (e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
