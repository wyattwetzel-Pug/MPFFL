/**
 * The back-to-back chain, asserted.
 *
 * Builds a player's stint history row by row on the local database and asks
 * `chainVerdict` the question at each signing moment. Every fabricated row is
 * removed at the end; refuses to run anywhere but localhost.
 *
 *   npx tsx --env-file=.env scripts/verify-contract-chain.ts
 */
import { prisma } from "../lib/prisma";
import { chainVerdict } from "../lib/contract-chain";
import { currentSeason } from "../lib/constants";

if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Local database only — this writes and deletes stint rows.");
}

const S = currentSeason(); // 2026
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok || !detail ? "" : ` — ${detail}`}`);
  if (ok) pass++;
  else fail++;
};

async function main() {
  console.log(`\n=== the back-to-back chain, ${S} ===\n`);

  const team = await prisma.team.findFirst({ orderBy: { id: "asc" } });
  const teamB = await prisma.team.findFirst({ orderBy: { id: "desc" } });
  const player = await prisma.player.findFirst({
    where: { active: true, rosterSpots: { none: {} } },
    orderBy: { id: "desc" },
  });
  if (!team || !teamB || !player) throw new Error("need a team and a never-rostered player");

  const made: number[] = [];
  const stint = async (data: Record<string, unknown>) => {
    const s = await prisma.rosterSpot.create({
      data: { teamId: team!.id, playerId: player!.id, salary: 10, ...data },
      select: { id: true },
    });
    made.push(s.id);
    return s.id;
  };

  try {
    console.log("Contract #1 — no history:");
    const first = await stint({ acquiredForSeason: S - 4, notes: "Held Over" });
    const v1 = await chainVerdict(first);
    check("a first contract is never back-to-back", !v1.backToBack, v1.reason);

    console.log("\nHoldover → contract #2:");
    // Contract #1 ran S-4..S-3 and expired; retained for S-2; signing now.
    await prisma.rosterSpot.update({
      where: { id: first },
      data: { contractEndSeason: S - 3, cutAt: new Date() },
    });
    const second = await stint({ acquiredForSeason: S - 2, notes: "Held Over" });
    const v2 = await chainVerdict(second);
    check("the second consecutive contract is back-to-back", v2.backToBack, v2.reason);
    check("but not a third", !v2.thirdConsecutive);

    console.log("\nThird consecutive:");
    await prisma.rosterSpot.update({
      where: { id: second },
      data: { contractEndSeason: S - 1, isBackToBack: true, cutAt: new Date() },
    });
    const third = await stint({ acquiredForSeason: S, notes: "Held Over" });
    const v3 = await chainVerdict(third);
    check("still computes as back-to-back", v3.backToBack);
    check("and warns that it's a third", v3.thirdConsecutive, v3.reason);
    check("the warning names the player", v3.reason.includes(player.name), v3.reason);

    console.log("\nThe auction resets the chain:");
    await prisma.rosterSpot.update({
      where: { id: third },
      data: { notes: `Auction ${S}` },
    });
    const v4 = await chainVerdict(third);
    check("an auction-won stint starts fresh", !v4.backToBack, v4.reason);

    console.log("\nA gap year breaks it:");
    await prisma.rosterSpot.update({
      where: { id: third },
      data: { acquiredForSeason: S, notes: "Held Over" },
    });
    // Rewrite the previous contract to have ended two seasons back.
    await prisma.rosterSpot.update({
      where: { id: second },
      data: { contractEndSeason: S - 2 },
    });
    const v5 = await chainVerdict(third);
    check("a season out of contract breaks the chain", !v5.backToBack, v5.reason);

    console.log("\nA live cut breaks it:");
    await prisma.rosterSpot.update({
      where: { id: second },
      data: { contractEndSeason: S + 1 }, // cut while the deal still ran
    });
    const v6 = await chainVerdict(third);
    check("cut mid-contract, chain broken", !v6.backToBack, v6.reason);

    console.log("\nA PS-stretched contract is the same contract:");
    // Restore: previous deal ran long (PS year) and expired exactly last season.
    await prisma.rosterSpot.update({
      where: { id: second },
      data: { contractEndSeason: S - 1 },
    });
    const v7 = await chainVerdict(third);
    check("four years via PS still chains into back-to-back", v7.backToBack, v7.reason);

    console.log("\nUnknowable rows stay manual:");
    await prisma.rosterSpot.update({ where: { id: third }, data: { acquiredForSeason: null } });
    const v8 = await chainVerdict(third);
    check("no acquiredForSeason → no automation", !v8.backToBack && v8.reason.includes("manual"), v8.reason);

    console.log("\nTrades don't break the chain:");
    await prisma.rosterSpot.update({
      where: { id: third },
      // Same player, retained — but the stint sits with a different team now.
      data: { acquiredForSeason: S, teamId: teamB.id },
    });
    const v9 = await chainVerdict(third);
    check("the chain follows the player across teams", v9.backToBack, v9.reason);
  } finally {
    await prisma.rosterSpot.deleteMany({ where: { id: { in: made } } });
    console.log("\n  (test data removed)");
  }

  const leftovers = await prisma.rosterSpot.count({ where: { playerId: player.id } });
  check("no stints left behind", leftovers === 0, String(leftovers));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
