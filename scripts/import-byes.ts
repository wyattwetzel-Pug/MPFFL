/**
 * Import NFL bye weeks for a season.
 *
 * Accepts either shape:
 *   Bye Week,Teams            →  5,"Carolina, Kansas City"
 *   Team,Bye                  →  CAR,5
 *
 * Byes are stored per NFL team per season; a player's bye is derived through
 * their nflTeam, so trades never leave a stale value behind.
 *
 *   node --env-file=.env scripts/import-byes.ts <file.csv> [--season 2026] [--apply]
 */
import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { NFL_TEAMS, resolveNflTeam, currentSeason } from "../lib/constants.ts";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--") && a.endsWith(".csv"));
const apply = args.includes("--apply");
const seasonArg = args[args.indexOf("--season") + 1];
const season =
  args.includes("--season") && seasonArg ? Number(seasonArg) : currentSeason();

if (!file) {
  console.error("Usage: import-byes.ts <file.csv> [--season YYYY] [--apply]");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

type Bye = { nflTeam: string; week: number };

function parseByeCsv(text: string): { byes: Bye[]; errors: string[] } {
  const records = parse(text, {
    columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  const errors: string[] = [];
  const byes: Bye[] = [];
  const seen = new Map<string, number>();

  const add = (rawTeam: string, week: number, line: number) => {
    const abbr = resolveNflTeam(rawTeam);
    if (!abbr) {
      errors.push(`Row ${line}: unrecognized NFL team "${rawTeam}" — skipped`);
      return;
    }
    if (abbr === "F/A") {
      errors.push(`Row ${line}: "${rawTeam}" is not a real NFL team — skipped`);
      return;
    }
    if (seen.has(abbr)) {
      errors.push(
        `Row ${line}: ${abbr} already has bye week ${seen.get(abbr)} — ignoring week ${week}`
      );
      return;
    }
    seen.set(abbr, week);
    byes.push({ nflTeam: abbr, week });
  };

  records.forEach((rec, i) => {
    const line = i + 2;
    const weekRaw = rec["bye week"] ?? rec.bye ?? rec.week;
    const teamsRaw = rec.teams ?? rec.team ?? rec["nfl team"];
    if (!weekRaw && !teamsRaw) return; // blank row

    const week = Number(String(weekRaw).trim());
    if (!Number.isInteger(week) || week < 1 || week > 18) {
      errors.push(`Row ${line}: invalid bye week "${weekRaw}" — skipped`);
      return;
    }
    if (!teamsRaw) {
      errors.push(`Row ${line}: no teams listed for week ${week} — skipped`);
      return;
    }
    // One row may list several teams: "Carolina, Kansas City"
    for (const t of String(teamsRaw).split(",")) {
      if (t.trim()) add(t, week, line);
    }
  });

  return { byes, errors };
}

async function main() {
  const { byes, errors } = parseByeCsv(readFileSync(file!, "utf8"));

  console.log(`\n=== ${apply ? "IMPORT" : "DRY RUN"}: bye weeks for ${season} ===`);
  errors.forEach((e) => console.log("   ⚠", e));

  const covered = new Set(byes.map((b) => b.nflTeam));
  const missing = NFL_TEAMS.filter((t) => t.abbr !== "F/A" && !covered.has(t.abbr));

  const byWeek = new Map<number, string[]>();
  for (const b of byes) byWeek.set(b.week, [...(byWeek.get(b.week) ?? []), b.nflTeam]);
  [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .forEach(([w, teams]) =>
      console.log(`   Week ${String(w).padStart(2)}: ${teams.sort().join(" ")} (${teams.length})`)
    );

  console.log(`\nteams with a bye: ${covered.size}/32`);
  if (missing.length > 0) {
    console.log(`⚠ MISSING (${missing.length}): ${missing.map((t) => t.abbr).join(" ")}`);
  }

  if (!apply) {
    console.log("\nDry run — nothing written. Re-run with --apply to commit.");
    return;
  }

  await prisma.season.upsert({
    where: { year: season },
    create: { year: season },
    update: {},
  });

  // Replace the season's byes wholesale so a re-import can't leave stale rows.
  await prisma.nflTeamBye.deleteMany({ where: { season } });
  await prisma.nflTeamBye.createMany({
    data: byes.map((b) => ({ season, nflTeam: b.nflTeam, week: b.week })),
  });

  const stored = await prisma.nflTeamBye.count({ where: { season } });
  console.log(`\nAPPLIED — ${stored} team bye weeks stored for ${season}.`);

  // Sanity check: how many rostered players now resolve to a bye week?
  const spots = await prisma.rosterSpot.findMany({
    where: { cutAt: null },
    include: { player: { select: { nflTeam: true } } },
  });
  const byeByTeam = new Map(
    (await prisma.nflTeamBye.findMany({ where: { season } })).map((b) => [b.nflTeam, b.week])
  );
  const withBye = spots.filter((s) => byeByTeam.has(s.player.nflTeam)).length;
  console.log(
    `Rostered players with a resolved bye: ${withBye}/${spots.length}` +
      ` (the rest are free agents with no NFL team)`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
