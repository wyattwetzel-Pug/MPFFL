/**
 * Local-only: put the 2026 draft on the clock and hand back a session cookie,
 * so the picking page can be looked at without waiting for a magic link.
 *
 * Refuses to run against anything but a localhost database.
 *
 *   npx tsx --env-file=.env scripts/dev-draft-sandbox.ts start
 *   npx tsx --env-file=.env scripts/dev-draft-sandbox.ts stop
 */
import { randomBytes, createHash } from "crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error("Local database only.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const SEASON = 2026;
const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const mode = args.find((a) => !/^\d+$/.test(a)) ?? "start";
/** How many slots to fill with sample picks, so the summary has content. */
const demo = Number(args.find((a) => /^\d+$/.test(a)) ?? 0);

async function main() {
  if (mode === "stop") {
    const picks = await prisma.draftPick.findMany({
      where: { seasonYear: SEASON },
      select: { transactionId: true },
    });
    const txIds = picks.map((p) => p.transactionId).filter((id): id is number => id != null);
    await prisma.draftPick.deleteMany({ where: { seasonYear: SEASON } });
    for (const id of txIds) {
      const entries = await prisma.ledgerEntry.findMany({
        where: { transactionId: id, assetType: "PLAYER" },
        select: { playerId: true, toTeamId: true },
      });
      for (const e of entries) {
        if (e.playerId && e.toTeamId)
          await prisma.rosterSpot.deleteMany({
            where: { playerId: e.playerId, teamId: e.toTeamId, cutAt: null },
          });
      }
      await prisma.transactionStatusLog.deleteMany({ where: { transactionId: id } });
      await prisma.transaction.delete({ where: { id } });
    }
    await prisma.draftConfig.deleteMany({ where: { seasonYear: SEASON } });
    console.log(`Sandbox cleared — ${txIds.length} transaction(s) removed.`);
    return;
  }

  const now = new Date();
  await prisma.draftConfig.upsert({
    where: { seasonYear: SEASON },
    create: { seasonYear: SEASON, startsAt: now, startedAt: now },
    update: { startedAt: now, completedAt: null },
  });

  const owner = await prisma.owner.findFirst({ where: { isCommissioner: true } });
  if (!owner) throw new Error("no commissioner");
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: { ownerId: owner.id, tokenHash: createHash("sha256").update(token).digest("hex") },
  });

  console.log(`Draft started for ${SEASON}. Signed in as ${owner.name}.`);
  console.log(`document.cookie = "mpffl_session=${token}; path=/"`);

  // Optionally fill the first few slots so the summary has something to show.
  if (demo > 0) {
    const { advanceWindows, getBoard } = await import("../lib/draft/board.ts");
    const { recordPick } = await import("../lib/draft/pick.ts");
    for (let i = 0; i < demo; i++) {
      await advanceWindows(SEASON);
      const { slots } = await getBoard(SEASON);
      const next = slots.find((s) => s.state === "open");
      if (!next) break;
      const free = {
        active: true,
        rookieYear: SEASON,
        rosterSpots: { none: { cutAt: null } },
        draftPicks: { none: { seasonYear: SEASON } },
      } as const;
      // Prefer someone with a portrait so the summary shows both states, but
      // don't stop the demo when the local database has none.
      const rookie =
        (await prisma.player.findFirst({
          where: { ...free, headshotUrl: { not: null } },
          orderBy: { id: "asc" },
        })) ?? (await prisma.player.findFirst({ where: free, orderBy: { id: "asc" } }));
      if (!rookie) {
        console.log("  no rookies left to pick");
        break;
      }
      const res = await recordPick({
        slot: next.slot,
        playerId: rookie.id,
        selection: i % 3 === 2 ? "TOP" : "HOLDOVER",
        owner: { id: owner.id, teamId: next.teamId, isCommissioner: true },
        seasonYear: SEASON,
      });
      console.log(`  ${next.label} ${rookie.name} — ${res.ok ? "ok" : res.error}`);
    }
  }
}

main().finally(() => prisma.$disconnect());
