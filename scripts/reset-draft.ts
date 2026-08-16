/**
 * Undo a rookie draft, so it can be rehearsed on the live site before the real
 * one starts.
 *
 * Removes, for one season: the slot rows, the draft config, every
 * ROOKIE_PICK_SELECTION transaction, and the roster spots those created.
 * Rosters are unwound through `applyStatusChange` — the same path the
 * commissioner uses — rather than by deleting spots directly, so a rehearsal
 * exercises the real reversal instead of a shortcut written for this script.
 *
 * Refuses rather than half-finishes:
 *   - a completed draft is the real one; `--force` is required to touch it
 *   - trades made *during* the rehearsal reference drafted players, so it stops
 *     and lists them unless `--cascade` says to take those too
 *
 * Dry run by default.
 *
 *   npx tsx --env-file=.env      scripts/reset-draft.ts            # local, preview
 *   npx tsx --env-file=.env.neon scripts/reset-draft.ts --apply    # production
 *
 * Flags: --apply  --season=2026  --cascade  --keep-texts  --force
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { applyStatusChange } from "../lib/ledger/transition.ts";

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const apply = has("--apply");
const cascade = has("--cascade");
const keepTexts = has("--keep-texts");
const force = has("--force");
const season = Number(args.find((a) => a.startsWith("--season="))?.split("=")[1] ?? 2026);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

async function main() {
  const where = process.env.DATABASE_URL?.includes("localhost") ? "LOCAL" : "PRODUCTION";
  console.log(`\n=== ${apply ? "RESET" : "DRY RUN"}: ${season} rookie draft (${where}) ===\n`);

  const config = await prisma.draftConfig.findUnique({ where: { seasonYear: season } });
  const picks = await prisma.draftPick.findMany({
    where: { seasonYear: season },
    orderBy: { slot: "asc" },
    include: { player: { select: { id: true, name: true } } },
  });

  if (!config && picks.length === 0) {
    console.log("Nothing to do — this season has no draft.");
    return;
  }

  if (config?.completedAt && !force) {
    console.log(
      `The ${season} draft is marked COMPLETE (${config.completedAt.toISOString().slice(0, 10)}).\n` +
        `That is what a finished, real draft looks like. Re-run with --force if you\n` +
        `genuinely mean to erase it.`
    );
    process.exitCode = 1;
    return;
  }

  const made = picks.filter((p) => p.pickedAt);
  const txIds = picks.map((p) => p.transactionId).filter((id): id is number => id != null);
  const playerIds = new Set(made.map((p) => p.playerId).filter((id): id is number => id != null));

  console.log(`Draft config:   ${config ? `started ${config.startedAt?.toISOString().slice(0, 16) ?? "no"}, window ${config.pickWindow}m` : "none"}`);
  console.log(`Slot rows:      ${picks.length} (${made.length} picked)`);
  for (const p of made) {
    console.log(
      `   ${String(p.slot).padStart(2)}  ${p.player?.name ?? "?"} — ${p.selection}` +
        `${p.holdoverAmount != null ? ` $${p.holdoverAmount}` : ""}`
    );
  }

  /*
   * Anything else that touched a drafted player only exists because of the
   * rehearsal — a topper traded on, a held-over rookie moved. Leaving those
   * behind would strand entries pointing at picks that no longer happened.
   */
  const collateral = playerIds.size
    ? await prisma.transaction.findMany({
        where: {
          id: { notIn: txIds.length ? txIds : [-1] },
          type: { not: "ROOKIE_PICK_SELECTION" },
          entries: { some: { playerId: { in: [...playerIds] } } },
        },
        select: { id: true, type: true, status: true, note: true },
      })
    : [];

  if (collateral.length > 0) {
    console.log(`\nOther transactions referencing drafted players: ${collateral.length}`);
    for (const t of collateral) {
      console.log(`   #${t.id} ${t.type} ${t.status} — ${t.note ?? "(no note)"}`);
    }
    if (!cascade) {
      console.log(
        `\nStopping. Removing the picks without these would leave entries pointing at\n` +
          `picks that never happened. Re-run with --cascade to remove them too, or\n` +
          `withdraw them by hand first.`
      );
      process.exitCode = 1;
      return;
    }
  }

  const texts = keepTexts
    ? 0
    : await prisma.smsMessage.count({
        where: {
          OR: [
            { triggerType: { startsWith: "draft_" } },
            { triggerType: "rookie_pick_announcement" },
          ],
        },
      });

  const doomed = [...collateral.map((t) => t.id), ...txIds];
  console.log(`\nWould remove:`);
  console.log(`   ${plural(picks.length, "slot row")}`);
  console.log(`   ${plural(doomed.length, "transaction")} (entries and status logs cascade)`);
  console.log(`   the ${season} draft config`);
  if (!keepTexts) console.log(`   ${plural(texts, "draft text")} from the message log`);

  if (!apply) {
    console.log(`\nDry run — nothing written. Re-run with --apply to commit.`);
    return;
  }

  const owner = await prisma.owner.findFirst({ where: { isCommissioner: true } });
  if (!owner) throw new Error("no commissioner to attribute the reversal to");

  /*
   * Slot rows first: DraftPick points at its transaction, so the transaction
   * can't go while the row still references it.
   */
  await prisma.draftPick.deleteMany({ where: { seasonYear: season } });
  console.log(`\n   removed ${plural(picks.length, "slot row")}`);

  for (const id of doomed) {
    const tx = await prisma.transaction.findUnique({ where: { id }, select: { status: true } });
    if (!tx) continue;

    // Walk it back through the real lifecycle so rosters unwind the way they
    // would if a commissioner reversed it. COMPLETED can't jump to SUBMITTED.
    if (tx.status === "COMPLETED") {
      await applyStatusChange(id, "APPROVED", owner.id, "Draft rehearsal reset");
    }
    const now = await prisma.transaction.findUnique({ where: { id }, select: { status: true } });
    if (now?.status === "APPROVED") {
      const res = await applyStatusChange(id, "SUBMITTED", owner.id, "Draft rehearsal reset");
      if ("notes" in res && res.notes?.length) {
        for (const n of res.notes) console.log(`      #${id} ${n}`);
      }
    }

    await prisma.transaction.delete({ where: { id } });
    console.log(`   removed transaction #${id}`);
  }

  if (!keepTexts) {
    const { count } = await prisma.smsMessage.deleteMany({
      where: {
        OR: [
          { triggerType: { startsWith: "draft_" } },
          { triggerType: "rookie_pick_announcement" },
        ],
      },
    });
    console.log(`   removed ${plural(count, "draft text")}`);
  }

  await prisma.draftConfig.deleteMany({ where: { seasonYear: season } });
  console.log(`   removed the ${season} draft config`);

  // ---- Prove it ----
  const leftPicks = await prisma.draftPick.count({ where: { seasonYear: season } });
  const leftTx = await prisma.transaction.count({
    where: { type: "ROOKIE_PICK_SELECTION", isHistorical: false },
  });
  const strandedSpots = playerIds.size
    ? await prisma.rosterSpot.count({
        where: { playerId: { in: [...playerIds] }, cutAt: null },
      })
    : 0;

  console.log(`\nAfter:`);
  console.log(`   slot rows:            ${leftPicks}`);
  console.log(`   selection transactions: ${leftTx}`);
  console.log(`   drafted players still rostered: ${strandedSpots}`);
  console.log(
    leftPicks === 0 && strandedSpots === 0
      ? `\nClean — the season is back to never having drafted.`
      : `\n⚠ Something is left over. Investigate before starting the real draft.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
