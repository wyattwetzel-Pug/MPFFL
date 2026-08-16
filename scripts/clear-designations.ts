/*
 * Season-rollover designation clear: every
 * surviving roster spot still marked IR or PS from last season returns to
 * ACTIVE. Contracts are untouched on purpose — each change routes through
 * the psTransition decision table, which keeps a completed PS year's earned
 * extension (and would give an in-season year back, which can't apply on
 * auction day). Designations aren't ledger assets, so this is a roster
 * edit, same as the editor makes.
 *
 * Idempotent; dry-run by default.
 *
 *   npx tsx --env-file=.env.neon scripts/clear-designations.ts --apply
 */
import { prisma } from "../lib/prisma";
import { currentSeason } from "../lib/constants";
import { psTransition } from "../lib/practice-squad";

const apply = process.argv.includes("--apply");

async function main() {
  const host = (process.env.DATABASE_URL ?? "").split("@")[1]?.split("/")[0];
  const season = currentSeason();
  console.log(`\nClear IR/PS designations for ${season} — ${host}${apply ? " [APPLY]" : " [dry run]"}\n`);

  const spots = await prisma.rosterSpot.findMany({
    where: { cutAt: null, designation: { not: "ACTIVE" } },
    select: {
      id: true, designation: true, psSeason: true, contractEndSeason: true, playerId: true,
      team: { select: { name: true } }, player: { select: { name: true } },
    },
    orderBy: { id: "asc" },
  });
  if (spots.length === 0) {
    console.log("no IR or PS designations on any active roster — nothing to do\n");
    return;
  }

  for (const s of spots) {
    const effect = psTransition(s, "ACTIVE", season, null, s.player.name);
    const contractEndSeason =
      effect.contractDelta !== 0 && s.contractEndSeason != null
        ? s.contractEndSeason + effect.contractDelta
        : s.contractEndSeason;
    console.log(
      `${s.designation} → ACTIVE  ${s.player.name} — ${s.team.name}` +
        (contractEndSeason !== s.contractEndSeason
          ? `  (contract ${s.contractEndSeason} → ${contractEndSeason})`
          : "  (contract untouched)")
    );
    if (effect.note) console.log(`    ${effect.note}`);
    if (apply) {
      await prisma.rosterSpot.update({
        where: { id: s.id },
        data: { designation: "ACTIVE", psSeason: effect.psSeason, contractEndSeason },
      });
    }
  }
  console.log(`\n${apply ? "cleared" : "would clear"}: ${spots.length} designation${spots.length === 1 ? "" : "s"}\n`);
}

main().catch((e) => { console.error("FAILED:", (e as Error).message); process.exitCode = 1; });
