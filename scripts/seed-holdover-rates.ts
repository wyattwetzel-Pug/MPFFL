/*
 * Seeds the rookie holdover rate grid (pick number x position). Same grid
 * as the parent league; edit any cell later at /admin/holdover-rates.
 *
 *   npx tsx --env-file=.env scripts/seed-holdover-rates.ts
 */
import { readFileSync } from "fs";
import { prisma } from "../lib/prisma";

async function main() {
  const rates: { pickNumber: number; position: string; amount: number }[] =
    JSON.parse(readFileSync("prisma/seed-data/holdover-rates.json", "utf-8"));
  let wrote = 0;
  for (const r of rates) {
    await prisma.holdoverRate.upsert({
      where: { pickNumber_position: { pickNumber: r.pickNumber, position: r.position } },
      create: r,
      update: {},
    });
    wrote++;
  }
  console.log(`holdover grid seeded: ${wrote} cells`);
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
