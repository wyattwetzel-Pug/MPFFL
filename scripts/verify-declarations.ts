/**
 * §16.9 declaration mechanics against the real local ledger. Applies the
 * clear if absent, files real declarations through the real lifecycle,
 * asserts every derived effect, and puts the database back exactly as it
 * found it — local only.
 *
 *   npx tsx --env-file=.env scripts/verify-declarations.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  declarationEligibility, declarationsList, fileDeclaration, withdrawDeclaration,
  hiddenTopPlayerIds, hiddenDeclarationTxIds, holdoverPrice,
} from "../lib/auction/declare";
import { applyClear, clearStatus, revertClear } from "../lib/auction/clear";
import { COUNTED_STATUSES, SEED_SEASON, deriveAssets } from "../lib/ledger/derive";

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("verify-declarations writes real transactions — local database only.");
  process.exit(1);
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const SEASON = 2026;
let pass = 0, fail = 0;
const check = (label: string, ok: boolean, got?: unknown) => {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} — got ${JSON.stringify(got)}`); }
};

async function derivedFor(teamId: number) {
  const teams = await prisma.team.findMany({ select: { id: true } });
  const entries = await prisma.ledgerEntry.findMany({
    where: {
      transaction: { status: { in: COUNTED_STATUSES } },
      OR: [{ transaction: { isHistorical: false } }, { seasonYear: { gt: SEED_SEASON } }],
    },
    select: {
      seasonYear: true, isContingent: true, resolvedAt: true, assetType: true,
      fromTeamId: true, toTeamId: true, amount: true, round: true,
      pickNumber: true, originTeamId: true, playerId: true, label: true,
    },
  });
  return deriveAssets(entries as never, SEASON, teams.map((t) => t.id)).get(teamId)!;
}

async function main() {
  const commish = await prisma.owner.findFirst({ where: { isCommissioner: true }, select: { id: true } });
  if (!commish) throw new Error("no commissioner in local db");
  const recorder = { id: commish.id, teamId: null, isCommissioner: true };

  const preTxCount = await prisma.transaction.count();
  const clearWasApplied = (await clearStatus(SEASON)).length > 0;
  const createdTxIds: number[] = [];

  try {
    // --- The clear, if this database hasn't run it ---
    if (!clearWasApplied) {
      const res = await applyClear(commish.id, SEASON);
      if (!res.ok) throw new Error(res.error);
      check("clear applied for the exercise", res.transactions.length > 0, res);
    }

    // --- Eligibility ---
    const elig = await declarationEligibility(SEASON);
    check("eligibility answers for 16 teams", elig.size === 16, elig.size);
    const withExpiring = [...elig.values()].filter((t) => t.expiring.length > 0);
    check("expiring rights derived from the clear", withExpiring.length > 5, withExpiring.length);

    // Jones is uncontracted — a T/H target, not an expiring right (that's why
    // his hold needs the asset). The floor still prices him: max($60, $51).
    const jones = [...elig.values()].flatMap((t) => t.compTargets).find((p) => p.name === "Daniel Jones");
    check("Daniel Jones is a comp target priced at $60", jones?.holdPrice === 60, jones);
    const anyExpiring = [...elig.values()].flatMap((t) => t.expiring).filter((p) => !p.b2b);
    check(
      "every expiring price follows max(rate, salary+$25)",
      anyExpiring.length > 0 && anyExpiring.every((p) => p.holdPrice === holdoverPrice(p.position, p.salary)),
      anyExpiring.slice(0, 2)
    );
    const b2b = [...elig.values()].flatMap((t) => t.expiring).find((p) => p.b2b);
    check("a B2B player prices at null — never holdable", !b2b || b2b.holdPrice == null, b2b);
    // The manual's worked math: premiums vary by position (QB/RB +25,
    // WR/TE +20, K +10) and the K floor is $15 — the classic regression
    // (WR $18 → $40 floor, not $43) is the regression here.
    check(
      "the price rule matches the manual",
      holdoverPrice("QB", 26) === 60 &&
        holdoverPrice("WR", 18) === 40 &&
        holdoverPrice("WR", 26) === 46 &&
        holdoverPrice("TE", 15) === 35 &&
        holdoverPrice("K", 3) === 15
    );

    // --- An expiring holdover, end to end ---
    const team = withExpiring.find((t) => t.expiring.some((p) => !p.b2b && !p.declared))!;
    const subject = team.expiring.find((p) => !p.b2b && !p.declared)!;
    const committed0 = team.committed;

    const hold = await fileDeclaration(recorder, team.teamId, subject.playerId, "HOLD", SEASON);
    check(`holdover files and approves (${subject.name} at $${subject.holdPrice})`, hold.ok, hold);
    if (!hold.ok) throw new Error("cannot continue");
    createdTxIds.push(hold.transactionId);

    const spot = await prisma.rosterSpot.findFirst({
      where: { playerId: subject.playerId, cutAt: null },
      select: { teamId: true, salary: true, contractEndSeason: true, acquiredForSeason: true, notes: true },
    });
    check("player is back on the roster, uncontracted", spot?.teamId === team.teamId && spot.contractEndSeason == null, spot);
    check("spot carries the season (cap sees it instantly)", spot?.acquiredForSeason === SEASON, spot?.acquiredForSeason);
    check("spot says why", /held over/i.test(spot?.notes ?? ""), spot?.notes);

    const elig1 = (await declarationEligibility(SEASON)).get(team.teamId)!;
    check(`committed rose by exactly $${subject.holdPrice}`, elig1.committed === committed0 + subject.holdPrice!, `${committed0} → ${elig1.committed}`);
    check("the row now reads declared", elig1.expiring.find((p) => p.playerId === subject.playerId)?.declared?.kind === "HOLD");

    const dup = await fileDeclaration(recorder, team.teamId, subject.playerId, "HOLD", SEASON);
    check("double declaration refused", !dup.ok, dup);
    const autoTop = await fileDeclaration(recorder, team.teamId, team.expiring.find((p) => p.playerId !== subject.playerId && !p.declared)?.playerId ?? -1, "TOP", SEASON);
    check("auto-topper declaration refused — nothing to file", !autoTop.ok && /room/.test(autoTop.ok ? "" : autoTop.error), autoTop);

    // --- Withdraw restores everything ---
    const wd = await withdrawDeclaration(recorder, hold.transactionId);
    check("withdraw allowed before the auction", wd.ok, wd);
    const spotGone = await prisma.rosterSpot.findFirst({ where: { playerId: subject.playerId, cutAt: null } });
    check("withdraw removes the spot", spotGone == null);
    const elig2 = (await declarationEligibility(SEASON)).get(team.teamId)!;
    check("withdraw restores committed", elig2.committed === committed0, elig2.committed);

    // --- A compensatory secret top ---
    const compTeam = [...(await declarationEligibility(SEASON)).values()].find(
      (t) => t.thUnused > 0 && t.compTargets.some((p) => !p.declared)
    );
    if (compTeam) {
      const target = compTeam.compTargets.find((p) => !p.declared)!;
      const th0 = compTeam.thUnused;
      const top = await fileDeclaration(recorder, compTeam.teamId, target.playerId, "TOP", SEASON);
      check(`comp top files (${compTeam.teamName} on ${target.name})`, top.ok, top);
      if (top.ok) {
        createdTxIds.push(top.transactionId);
        const assets = await derivedFor(compTeam.teamId);
        check("T/H spent — one fewer right", assets.topperHoldovers === th0 - 1, assets.topperHoldovers);
        check("a named topper now exists on him", assets.namedToppers.some((t) => t.playerId === target.playerId));
        check("secret: hidden player set contains him", (await hiddenTopPlayerIds(SEASON)).has(target.playerId));
        const anon = await hiddenDeclarationTxIds(null, SEASON);
        check("secret: anonymous viewers can't see the transaction", anon.includes(top.transactionId));
        const own = await hiddenDeclarationTxIds({ teamId: compTeam.teamId, isCommissioner: false }, SEASON);
        check("the declaring team sees its own", !own.includes(top.transactionId));
        const comm = await hiddenDeclarationTxIds({ teamId: null, isCommissioner: true }, SEASON);
        check("commissioners see everything", comm.length === 0);
        const listed = (await declarationsList(SEASON)).find((d) => d.transactionId === top.transactionId);
        check("listed as TOP, unrevealed", listed?.kind === "TOP" && listed.revealed === false, listed);

        const wd2 = await withdrawDeclaration(recorder, top.transactionId);
        check("comp top withdraws (right returns)", wd2.ok, wd2);
        const assets2 = await derivedFor(compTeam.teamId);
        check("T/H restored", assets2.topperHoldovers === th0, assets2.topperHoldovers);
        check("withdrawn top stays hidden — a retracted secret is still a secret",
          (await hiddenDeclarationTxIds(null, SEASON)).includes(top.transactionId));
      }
    } else {
      console.log("  (no team with an unused T/H and comp targets — comp checks skipped)");
    }
  } finally {
    // Put the database back exactly as found: our declarations out first
    // (entries, logs, then rows), then the clear if we were the ones to run it.
    for (const id of createdTxIds) {
      const tx = await prisma.transaction.findUnique({ where: { id }, select: { status: true } });
      if (tx && (tx.status === "APPROVED" || tx.status === "COMPLETED")) {
        await withdrawDeclaration({ id: commish.id, teamId: null, isCommissioner: true }, id);
      }
      await prisma.ledgerEntry.deleteMany({ where: { transactionId: id } });
      await prisma.transactionStatusLog.deleteMany({ where: { transactionId: id } });
      await prisma.transaction.delete({ where: { id } }).catch(() => {});
    }
    if (!clearWasApplied) {
      for (const c of await clearStatus(SEASON)) {
        await revertClear(c.teamId, commish.id, SEASON);
        await prisma.ledgerEntry.deleteMany({ where: { transactionId: c.transactionId } });
        await prisma.transactionStatusLog.deleteMany({ where: { transactionId: c.transactionId } });
        await prisma.transaction.delete({ where: { id: c.transactionId } }).catch(() => {});
      }
    }
    const postTxCount = await prisma.transaction.count();
    check("database restored — transaction count identical", postTxCount === preTxCount, `${preTxCount} → ${postTxCount}`);
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  if (fail) process.exitCode = 1;
}

main()
  .catch((e) => { console.error("FAILED:", (e as Error).message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
