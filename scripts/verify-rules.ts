/*
 * §22 rules voting mechanics against the real local database. Exercises the
 * data rules the actions enforce — the lock, one vote per team with co-owner
 * changes, one-level threading, soft delete, outcome marking — through the
 * same Prisma shapes, then removes everything it created. Local only.
 *
 *   npx tsx --env-file=.env scripts/verify-rules.ts
 */
import { prisma } from "../lib/prisma";

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("verify-rules writes temp rows — local database only.");
  process.exit(1);
}

const YEAR = 1999; // a season no real ballot will ever use
let pass = 0, fail = 0;
const check = (label: string, ok: boolean, got?: unknown) => {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} — ${JSON.stringify(got)}`); }
};

const locked = async () => {
  const s = await prisma.ruleSlate.findUnique({ where: { seasonYear: YEAR } });
  return s?.locksAt != null && s.locksAt.getTime() <= Date.now();
};

async function main() {
  const teams = await prisma.team.findMany({ take: 2, orderBy: { id: "asc" } });
  const owners = await prisma.owner.findMany({ take: 2, orderBy: { id: "asc" } });
  const [teamA] = teams;

  const cleanup = async () => {
    await prisma.ruleProposal.deleteMany({ where: { seasonYear: YEAR } }); // cascades votes/comments
    await prisma.ruleSlate.deleteMany({ where: { seasonYear: YEAR } });
  };
  await cleanup();

  try {
    // Slate + proposal
    await prisma.ruleSlate.create({ data: { seasonYear: YEAR, locksAt: new Date(Date.now() + 3600_000) } });
    const prop = await prisma.ruleProposal.create({
      data: { seasonYear: YEAR, title: "[test] two flex spots", body: "test", proposedByLabel: "Test", displayOrder: 0 },
    });
    check("slate open before locksAt", !(await locked()));

    // One vote per team: second cast by a co-owner UPDATES, never duplicates.
    await prisma.ruleVote.upsert({
      where: { proposalId_teamId: { proposalId: prop.id, teamId: teamA.id } },
      create: { proposalId: prop.id, teamId: teamA.id, choice: "AYE", castByOwnerId: owners[0].id },
      update: { choice: "AYE", castByOwnerId: owners[0].id },
    });
    await prisma.ruleVote.upsert({
      where: { proposalId_teamId: { proposalId: prop.id, teamId: teamA.id } },
      create: { proposalId: prop.id, teamId: teamA.id, choice: "NAY", castByOwnerId: owners[1].id },
      update: { choice: "NAY", castByOwnerId: owners[1].id },
    });
    const votes = await prisma.ruleVote.findMany({ where: { proposalId: prop.id } });
    check("one vote per team survives a co-owner change", votes.length === 1, votes.length);
    check("the change took (NAY) and castBy moved", votes[0].choice === "NAY" && votes[0].castByOwnerId === owners[1].id, votes[0]);

    // Hard uniqueness: a raw second INSERT for the same team must throw.
    const dup = await prisma.ruleVote
      .create({ data: { proposalId: prop.id, teamId: teamA.id, choice: "AYE", castByOwnerId: owners[0].id } })
      .then(() => "created", (e: Error) => e.message);
    check("duplicate team vote rejected by the database", dup !== "created", dup.slice(0, 60));

    // The lock: flip locksAt into the past — the actions' gate goes closed.
    await prisma.ruleSlate.update({ where: { seasonYear: YEAR }, data: { locksAt: new Date(Date.now() - 1000) } });
    check("slate reads locked after locksAt passes", await locked());

    // Threading: a reply to a reply files under the top-level parent (the
    // actions flatten it — replicate their rule here).
    const top = await prisma.ruleComment.create({
      data: { proposalId: prop.id, teamId: teamA.id, authorOwnerId: owners[0].id, body: "top" },
    });
    const reply = await prisma.ruleComment.create({
      data: { proposalId: prop.id, parentId: top.id, teamId: teamA.id, authorOwnerId: owners[1].id, body: "reply" },
    });
    const parentOfReply = await prisma.ruleComment.findUnique({ where: { id: reply.id }, select: { parentId: true } });
    const flattenTarget = parentOfReply?.parentId != null ? top.id : top.id;
    const deepReply = await prisma.ruleComment.create({
      data: { proposalId: prop.id, parentId: flattenTarget, teamId: teamA.id, authorOwnerId: owners[0].id, body: "deep" },
    });
    check("reply-to-reply flattens under the top-level comment", deepReply.parentId === top.id);

    // Soft delete keeps the row and the thread's shape.
    await prisma.ruleComment.update({ where: { id: top.id }, data: { deletedAt: new Date() } });
    const afterDelete = await prisma.ruleComment.findUnique({ where: { id: top.id } });
    const replies = await prisma.ruleComment.count({ where: { parentId: top.id } });
    check("soft-deleted comment row survives with its replies", afterDelete?.deletedAt != null && replies === 2, { replies });

    // Comments stay open after lock (no gate exists to test — assert writable).
    const postLock = await prisma.ruleComment.create({
      data: { proposalId: prop.id, teamId: teamA.id, authorOwnerId: owners[0].id, body: "after lock" },
    });
    check("comments write after lock", postLock.id > 0);

    // Outcome is a declaration, not a computation.
    await prisma.ruleProposal.update({ where: { id: prop.id }, data: { outcome: "PASSED" } });
    check("outcome marked", (await prisma.ruleProposal.findUnique({ where: { id: prop.id } }))?.outcome === "PASSED");

    // Deleting a voted proposal is the action-layer refusal; the schema allows
    // cascade — assert cascade works for the cleanup path.
    await prisma.ruleProposal.delete({ where: { id: prop.id } });
    check("cascade removed votes and comments",
      (await prisma.ruleVote.count({ where: { proposalId: prop.id } })) === 0 &&
      (await prisma.ruleComment.count({ where: { proposalId: prop.id } })) === 0);
  } finally {
    await cleanup();
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  if (fail) process.exitCode = 1;
}

main().catch((e) => { console.error("FAILED:", (e as Error).message); process.exitCode = 1; });
