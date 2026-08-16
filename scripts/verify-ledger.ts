/**
 * Proof that the derivation behaves as the design claims.
 *
 * Runs against the real database inside a transaction that is always rolled
 * back, so it exercises live schema and constraints without leaving residue.
 *
 *   node --env-file=.env scripts/verify-ledger.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { deriveAssets, COUNTED_STATUSES } from "../lib/ledger/derive.ts";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

let passed = 0;
let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`   ${ok ? "✔" : "✗"} ${name}${ok ? "" : ` — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`);
  ok ? passed++ : failed++;
}

const entry = (o: Partial<Parameters<typeof deriveAssets>[0][number]>) => ({
  seasonYear: 2026, assetType: "CAP_DOLLARS" as const, fromTeamId: null, toTeamId: null,
  amount: 1, round: null, pickNumber: null, originTeamId: null, playerId: null, label: null,
  ...o,
});

async function main() {
  const before = await prisma.transaction.count();
  const teams = await prisma.team.findMany({ take: 2, orderBy: { id: "asc" }, select: { id: true, name: true } });
  const [A, B] = teams;
  console.log(`\nDeriving against teams: ${A.name} (#${A.id}) and ${B.name} (#${B.id})\n`);

  console.log("Allocation and trading:");
  let assets = deriveAssets(
    [
      entry({ toTeamId: A.id, amount: 500 }),            // league grants A $500
      entry({ toTeamId: B.id, amount: 500 }),            // league grants B $500
      entry({ fromTeamId: A.id, toTeamId: B.id, amount: 75 }), // A trades $75 to B
    ],
    2026,
    [A.id, B.id]
  );
  check("A's cap after sending $75", assets.get(A.id)!.capDollars, 425);
  check("B's cap after receiving $75", assets.get(B.id)!.capDollars, 575);

  console.log("\nFuture seasons need no pre-existing asset:");
  assets = deriveAssets(
    [entry({ seasonYear: 2028, fromTeamId: A.id, toTeamId: B.id, amount: 40 })],
    2028,
    [A.id, B.id]
  );
  // Unallocated seasons start from the $500 base (the same
  // rule future picks always had), so the transfer nets against it.
  check("B holds 2028 base plus the transfer", assets.get(B.id)!.capDollars, 540);
  check("A's 2028 base is down the transfer", assets.get(A.id)!.capDollars, 460);

  console.log("\nRookie picks keep their identity through a trade:");
  assets = deriveAssets(
    [
      entry({ assetType: "ROOKIE_PICK", toTeamId: A.id, round: 1, originTeamId: A.id }),
      entry({ assetType: "ROOKIE_PICK", toTeamId: B.id, round: 1, originTeamId: B.id }),
      // A sends its own 1st to B
      entry({ assetType: "ROOKIE_PICK", fromTeamId: A.id, toTeamId: B.id, round: 1, originTeamId: A.id }),
    ],
    2026,
    [A.id, B.id]
  );
  check("A holds no first-rounder", assets.get(A.id)!.rookiePicks.length, 0);
  check("B holds two distinct firsts", assets.get(B.id)!.rookiePicks.length, 2);
  check(
    "and they are traceable to their origins",
    assets.get(B.id)!.rookiePicks.map((p) => p.originTeamId).sort(),
    [A.id, B.id].sort()
  );

  console.log("\nSpending an asset returns it to the league:");
  assets = deriveAssets(
    [
      entry({ assetType: "UNCONDITIONAL_CUT", toTeamId: A.id, amount: 1 }),
      entry({ assetType: "UNCONDITIONAL_CUT", fromTeamId: A.id, toTeamId: null, amount: 1 }),
    ],
    2026,
    [A.id]
  );
  check("cut is used up", assets.get(A.id)!.unconditionalCuts, 0);

  // The behaviour the whole architecture exists for: reversal without unwind.
  console.log("\nLifecycle reversal (round trip against the real database):");
  await prisma.$transaction(async (tx) => {
    const t = await tx.transaction.create({
      data: {
        type: "TRADE",
        status: "APPROVED",
        entries: { create: [{ seasonYear: 2026, assetType: "CAP_DOLLARS", fromTeamId: A.id, toTeamId: B.id, amount: 30 }] },
      },
    });

    const load = async () =>
      tx.ledgerEntry.findMany({
        where: { transactionId: t.id, transaction: { status: { in: COUNTED_STATUSES } } },
        select: {
          seasonYear: true, assetType: true, fromTeamId: true, toTeamId: true, amount: true,
          round: true, pickNumber: true, originTeamId: true, playerId: true, label: true,
        },
      });

    // This block loads only the temp transaction's own entries, so 2026 looks
    // unallocated to the derivation and the $500 base applies — the lifecycle
    // is what's under test, so assert the delta on top of it.
    const approved = deriveAssets(await load(), 2026, [A.id, B.id]);
    check("while approved, B is up $30", approved.get(B.id)!.capDollars, 530);

    await tx.transaction.update({ where: { id: t.id }, data: { status: "SUBMITTED" } });
    const demoted = deriveAssets(await load(), 2026, [A.id, B.id]);
    check("demoted to submitted, the $30 stops counting", demoted.get(B.id)!.capDollars, 500);

    await tx.transaction.update({ where: { id: t.id }, data: { status: "COMPLETED" } });
    const completed = deriveAssets(await load(), 2026, [A.id, B.id]);
    check("promoted to completed, it counts again", completed.get(B.id)!.capDollars, 530);

    const entriesLeft = await tx.ledgerEntry.count({ where: { transactionId: t.id } });
    check("and no entry was ever mutated or deleted", entriesLeft, 1);

    throw new Error("ROLLBACK");
  }).catch((e) => {
    if (e.message !== "ROLLBACK") throw e;
  });

  console.log("\nContingent terms:");
  const contingent = (extra: Partial<{ isContingent: boolean; resolvedAt: Date | null }>) =>
    ({ ...entry({ toTeamId: B.id, assetType: "PS_SPOT", amount: 1 }), ...extra });

  let c = deriveAssets([contingent({ isContingent: true, resolvedAt: null })], 2026, [B.id]);
  check("an unresolved term is a promise, not a holding", c.get(B.id)!.psSpots, 0);

  c = deriveAssets([contingent({ isContingent: true, resolvedAt: new Date() })], 2026, [B.id]);
  check("once settled, it counts", c.get(B.id)!.psSpots, 1);

  c = deriveAssets([contingent({})], 2026, [B.id]);
  check("an ordinary term counts immediately", c.get(B.id)!.psSpots, 1);

  console.log("\nFuture cap dollars (the rule, not entries):");
  const AB = [A.id, B.id];
  let f = deriveAssets([], 2027, AB);
  check("an unallocated season starts from the $500 base", f.get(A.id)!.capDollars, 500);
  f = deriveAssets(
    [entry({ seasonYear: 2027, fromTeamId: A.id, toTeamId: B.id, amount: 22 })],
    2027, AB
  );
  check("a future trade nets against the base — sender", f.get(A.id)!.capDollars, 478);
  check("…and the receiver", f.get(B.id)!.capDollars, 522);
  f = deriveAssets(
    [entry({ seasonYear: 2027, fromTeamId: null, toTeamId: A.id, amount: 1 })],
    2027, AB
  );
  check("a one-off league grant adds to the seed", f.get(A.id)!.capDollars, 501);
  f = deriveAssets(
    AB.map((id) => entry({ seasonYear: 2027, fromTeamId: null, toTeamId: id, amount: 500 })),
    2027, AB
  );
  check("a league-wide allocation replaces the rule", f.get(A.id)!.capDollars, 500);
  check("beyond the horizon there is no seed", deriveAssets([], 2033, AB).get(A.id)!.capDollars, 0);

  const after = await prisma.transaction.count();
  check("\nrolled back cleanly — transaction count unchanged", after, before);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().then(() => prisma.$disconnect()).catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
