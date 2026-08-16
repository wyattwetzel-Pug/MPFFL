/*
 * Seeds MPFFL manual v1 from the parent league's constitution. Run once on
 * a fresh database, then EDIT IT on /manual/edit — it references the parent
 * league's names and history until you make it yours.
 *
 *   npx tsx --env-file=.env scripts/seed-manual.ts
 */
import { readFileSync } from "fs";
import { prisma } from "../lib/prisma";
import { renderDocToHtml } from "../lib/manual/render";

async function main() {
  const existing = await prisma.manualVersion.count();
  if (existing > 0) {
    console.log(`manual already has ${existing} version(s) — nothing to do`);
    return;
  }
  const commissioner = await prisma.owner.findFirst({ where: { isCommissioner: true } });
  if (!commissioner) throw new Error("Create your first commissioner (scripts/add-owner.ts) before seeding the manual.");
  const seed = JSON.parse(readFileSync("prisma/seed-data/manual-v1.json", "utf-8"));
  await prisma.manualVersion.create({
    data: {
      version: 1,
      title: seed.title,
      doc: seed.doc,
      html: renderDocToHtml(seed.doc),
      summary: "Seeded from the parent league's manual — adapt it to MPFFL's rules.",
      authorId: commissioner.id,
    },
  });
  console.log("manual v1 seeded — now go edit it at /manual/edit");
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
