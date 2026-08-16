/**
 * Import a player CSV from the command line. Uses the same matching logic as
 * the commissioner UI (lib/player-import.ts), so the results are identical.
 *
 *   node --env-file=.env scripts/import-players.ts <file.csv>              # dry run
 *   node --env-file=.env scripts/import-players.ts <file.csv> --apply      # write
 *   …--apply --rookie-year 2026                                           # default: current year
 */
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  buildIndex,
  classifyRow,
  parsePlayerCsv,
  planImport,
} from "../lib/player-import.ts";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const apply = args.includes("--apply");
const rookieYearArg = args[args.indexOf("--rookie-year") + 1];
const rookieYear =
  args.includes("--rookie-year") && rookieYearArg
    ? Number(rookieYearArg)
    : new Date().getFullYear();

if (!file) {
  console.error("Usage: import-players.ts <file.csv> [--apply] [--rookie-year YYYY]");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

function list(label: string, items: string[], limit = 15) {
  if (items.length === 0) return;
  console.log(`\n${label} (${items.length}):`);
  items.slice(0, limit).forEach((i) => console.log("   " + i));
  if (items.length > limit) console.log(`   …and ${items.length - limit} more`);
}

async function main() {
  const { rows, errors } = parsePlayerCsv(readFileSync(file!, "utf8"));
  const existing = await prisma.player.findMany({
    select: { id: true, name: true, position: true, nflTeam: true, active: true },
  });
  const plan = planImport(rows, existing);

  console.log(`\n=== ${apply ? "IMPORT" : "DRY RUN"}: ${file} ===`);
  console.log(`valid rows: ${rows.length}   skipped: ${errors.length}`);
  list("Skipped rows", errors);
  console.log(
    `\nto update: ${plan.updates.length}   position changes: ${plan.positionChanges.length}   ` +
      `to add: ${plan.adds.length}   unchanged: ${plan.unchanged}   left as-is: ${plan.notInCsv}`
  );
  list(
    "Position changes",
    plan.positionChanges.map(
      (p) => `${p.name}: ${p.from} → ${p.to}${p.teamChange ? ` (${p.teamChange})` : ""}`
    ),
    50
  );
  list(
    "Updates",
    plan.updates.map((u) => `${u.name} (${u.position}): ${u.changes.join(", ")}`)
  );
  list(
    "New players",
    plan.adds.map((a) => `${a.name} (${a.position}, ${a.nflTeam})`)
  );

  // Anything rostered that this CSV doesn't mention is worth seeing explicitly.
  const rosteredIds = new Set(
    (
      await prisma.rosterSpot.findMany({ where: { cutAt: null }, select: { playerId: true } })
    ).map((r) => r.playerId)
  );
  const idx = buildIndex(rows, existing);
  const touched = new Set<number>();
  for (const row of rows) {
    const r = classifyRow(row, idx);
    if (r.kind !== "add") touched.add(r.player.id);
  }
  const strandedRostered = existing.filter((p) => !touched.has(p.id) && rosteredIds.has(p.id));
  list(
    "⚠ Rostered players absent from this CSV (left alone)",
    strandedRostered.map((p) => `${p.name} (${p.position}/${p.nflTeam})`),
    50
  );

  if (!apply) {
    console.log("\nDry run — nothing written. Re-run with --apply to commit.");
    return;
  }

  let updated = 0;
  let added = 0;
  let repositioned = 0;
  for (const row of rows) {
    const result = classifyRow(row, idx);
    if (result.kind === "update") {
      const data: { nflTeam?: string; active?: boolean } = {};
      if (result.player.nflTeam !== row.nflTeam) data.nflTeam = row.nflTeam;
      if (row.active !== null && result.player.active !== row.active) data.active = row.active;
      if (Object.keys(data).length > 0) {
        await prisma.player.update({ where: { id: result.player.id }, data });
        updated++;
      }
    } else if (result.kind === "positionChange") {
      await prisma.player.update({
        where: { id: result.player.id },
        data: {
          position: row.position,
          nflTeam: row.nflTeam,
          ...(row.active !== null ? { active: row.active } : {}),
        },
      });
      repositioned++;
    } else {
      await prisma.player.create({
        data: {
          name: row.name,
          position: row.position,
          nflTeam: row.nflTeam,
          active: row.active ?? true,
          rookieYear,
        },
      });
      added++;
    }
  }

  console.log(
    `\nAPPLIED — updated: ${updated}, position changes: ${repositioned}, ` +
      `added: ${added} (rookie year ${rookieYear})`
  );
  console.log(
    `Players now: ${await prisma.player.count()} | active roster spots: ` +
      `${await prisma.rosterSpot.count({ where: { cutAt: null } })}`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
