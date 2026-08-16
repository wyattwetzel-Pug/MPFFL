/**
 * The pre-auction clear, driven end to end and put back.
 *
 * Local only: it clears real rosters and restores them. Asserts the things
 * that would ruin an auction eve — the rule matching an independent count,
 * live contracts and holdovers surviving, the clear applying through the real
 * lifecycle, one team restoring alone, and the league landing exactly where
 * it started.
 *
 *   npx tsx --env-file=.env scripts/verify-clear.ts
 */
import { prisma } from "../lib/prisma";
import { clearProposal, applyClear, revertClear, clearStatus } from "../lib/auction/clear";
import { committedFor } from "../lib/ledger/commitment";
import { currentSeason } from "../lib/constants";

if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Local database only — this clears and restores real rosters.");
}

const S = currentSeason();
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok || !detail ? "" : ` — ${detail}`}`);
  if (ok) pass++;
  else fail++;
};

const activeSpots = () =>
  prisma.rosterSpot.findMany({
    where: { cutAt: null },
    select: {
      id: true, teamId: true, playerId: true, salary: true,
      contractEndSeason: true, acquiredForSeason: true, notes: true,
    },
  });

async function main() {
  console.log(`\n=== the ${S} pre-auction clear ===\n`);

  const already = await prisma.transaction.count({ where: { type: "AUCTION_CLEAR" } });
  if (already > 0) {
    console.log(`${already} AUCTION_CLEAR transaction(s) already exist — refusing to touch a live clear.`);
    return;
  }

  const commish = await prisma.owner.findFirst({ where: { isCommissioner: true } });
  if (!commish) throw new Error("no commissioner");

  const before = await activeSpots();
  const beforeIds = new Set(before.map((s) => s.id));
  const txCountBefore = await prisma.transaction.count();

  console.log("The proposal:");
  const proposal = await clearProposal(S);
  const proposed = proposal.flatMap((t) => t.clears);
  const kept = proposal.flatMap((t) => t.keeps);
  check("every active spot is accounted for", proposed.length + kept.length === before.length,
    `${proposed.length} + ${kept.length} vs ${before.length}`);

  // An independent count, written differently on purpose.
  const independent = before.filter(
    (s) => !(s.contractEndSeason != null && s.contractEndSeason >= S) &&
           !(s.contractEndSeason == null && /rookie pick in \d{4}/.test(s.notes ?? ""))
  );
  // The proposal also keeps ledger-sourced holdovers the regex can't see, so
  // it may keep MORE than the regex count, never fewer.
  check("the rule clears no one the independent count keeps",
    proposed.every((c) => independent.some((i) => i.id === c.spotId)),
    "a proposed clear wasn't in the independent set");
  check("no live contract is cleared",
    proposed.every((c) => {
      const s = before.find((b) => b.id === c.spotId)!;
      return !(s.contractEndSeason != null && s.contractEndSeason >= S);
    }));
  check("reasons are written on every line",
    proposed.every((c) => c.reason.length > 0) && kept.every((k) => k.reason.length > 0));

  console.log("\nApplied:");
  const res = await applyClear(commish.id, S);
  if (!res.ok) throw new Error("apply failed");
  const teamsWithClears = proposal.filter((t) => t.clears.length > 0).length;
  check("one transaction per team with clears", res.transactions.length === teamsWithClears,
    `${res.transactions.length} vs ${teamsWithClears}`);
  check("every proposed player cleared", res.cleared === proposed.length,
    `${res.cleared} vs ${proposed.length}`);

  const after = await activeSpots();
  check("the roster shrank by exactly the cleared count",
    after.length === before.length - proposed.length,
    `${before.length} → ${after.length}`);
  check("every survivor was a keep",
    after.every((s) => kept.some((k) => k.spotId === s.id)));

  const t0 = proposal.find((t) => t.clears.length > 0)!;
  const t0After = after.filter((s) => s.teamId === t0.teamId);
  check(`${t0.teamName}'s committed now equals its keeps`,
    committedFor(t0After, S) === t0.keeps.reduce((n, k) => {
      const s = before.find((b) => b.id === k.spotId)!;
      return n + (s.contractEndSeason != null && s.contractEndSeason >= S ? k.salary :
                  s.acquiredForSeason === S ? k.salary : 0);
    }, 0),
    `$${committedFor(t0After, S)}`);

  console.log("\nIdempotence:");
  const again = await applyClear(commish.id, S);
  check("a second run clears nobody", again.ok && again.cleared === 0,
    again.ok ? String(again.cleared) : "failed");

  console.log("\nOne team restored alone:");
  const undo = await revertClear(t0.teamId, commish.id, S);
  check("the revert succeeds", undo.ok, undo.ok ? "" : undo.error);
  const mid = await activeSpots();
  check(`${t0.teamName} is whole again`,
    mid.filter((s) => s.teamId === t0.teamId).length ===
      before.filter((s) => s.teamId === t0.teamId).length);
  check("nobody else moved",
    mid.length === after.length + t0.clears.length, `${mid.length}`);

  console.log("\nEverything back:");
  const status = await clearStatus(S);
  for (const s of status.filter((x) => x.status === "APPROVED")) {
    await revertClear(s.teamId, commish.id, S);
  }
  const restored = await activeSpots();
  check("every roster is exactly as it was",
    restored.length === before.length && restored.every((s) => beforeIds.has(s.id)),
    `${restored.length} vs ${before.length}`);

  // Remove the rehearsal's transactions entirely.
  const txs = await prisma.transaction.findMany({
    where: { type: "AUCTION_CLEAR" }, select: { id: true },
  });
  await prisma.transactionStatusLog.deleteMany({ where: { transactionId: { in: txs.map((t) => t.id) } } });
  await prisma.ledgerEntry.deleteMany({ where: { transactionId: { in: txs.map((t) => t.id) } } });
  await prisma.transaction.deleteMany({ where: { id: { in: txs.map((t) => t.id) } } });
  check("transaction count is back where it started",
    (await prisma.transaction.count()) === txCountBefore);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
