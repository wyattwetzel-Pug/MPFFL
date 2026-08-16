import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionOwner } from "@/lib/auth";
import { currentSeason } from "@/lib/constants";
import { slateIsLocked } from "@/lib/rules/lock";
import { ManualTabs } from "@/components/manual-tabs";
import { RulesView, type ProposalView } from "@/components/rules/rules-view";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const { year } = await params;
  const seasonYear = Number(year);
  if (!Number.isInteger(seasonYear)) return {};
  const [count, slate] = await Promise.all([
    prisma.ruleProposal.count({ where: { seasonYear } }),
    prisma.ruleSlate.findUnique({ where: { seasonYear } }),
  ]);
  const lock = slate?.locksAt
    ? `${slateIsLocked(slate.locksAt) ? "Voting locked" : "Voting locks"} ${slate.locksAt.toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", year: "numeric" })}.`
    : "";
  return {
    title: `${seasonYear} Rule Votes`,
    description: `${count} proposal${count === 1 ? "" : "s"} on the ${seasonYear} MPFFL ballot. One vote per team. ${lock}`.trim(),
  };
}

/*
 * §22 — the ballot. Fully public by league ruling: any visitor sees the
 * proposals, every team's vote, the tallies and the conversations. Voting
 * and commenting need a signed-in owner; the actions re-check everything.
 */
export default async function RulesYearPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const { year } = await params;
  const seasonYear = Number(year);
  if (!Number.isInteger(seasonYear)) return null;

  const [owner, slate, proposals, teams, years] = await Promise.all([
    getSessionOwner(),
    prisma.ruleSlate.findUnique({ where: { seasonYear } }),
    prisma.ruleProposal.findMany({
      where: { seasonYear },
      orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
      include: {
        votes: {
          include: {
            team: { select: { name: true } },
            castBy: { select: { name: true } },
          },
        },
        comments: {
          orderBy: { createdAt: "asc" },
          include: {
            team: { select: { name: true } },
            author: { select: { name: true } },
          },
        },
      },
    }),
    prisma.team.count(),
    prisma.ruleProposal.findMany({
      distinct: ["seasonYear"],
      orderBy: { seasonYear: "desc" },
      select: { seasonYear: true },
    }),
  ]);

  const locked = slateIsLocked(slate?.locksAt);
  const rows: ProposalView[] = proposals.map((p) => ({
    id: p.id,
    title: p.title,
    body: p.body,
    proposedByLabel: p.proposedByLabel,
    iconUrl: p.iconUrl,
    proposedAt: p.proposedAt.toISOString(),
    outcome: p.outcome,
    votes: p.votes.map((v) => ({
      teamId: v.teamId,
      teamName: v.team.name,
      choice: v.choice,
      castByName: v.castBy.name,
    })),
    comments: p.comments.map((c) => ({
      id: c.id,
      parentId: c.parentId,
      teamName: c.team.name,
      authorName: c.author.name,
      authorOwnerId: c.authorOwnerId,
      body: c.deletedAt ? null : c.body,
      at: c.createdAt.toISOString(),
    })),
  }));

  const yearList = [...new Set([...years.map((y) => y.seasonYear), seasonYear, currentSeason()])].sort(
    (a, b) => b - a
  );

  return (
    <div className="mx-auto max-w-3xl">
      <ManualTabs active="rules" />
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-2xl font-bold">{seasonYear} Rule Votes</h1>
        <span className="flex gap-2 text-sm">
          {yearList.map((y) =>
            y === seasonYear ? (
              <b key={y}>{y}</b>
            ) : (
              <Link key={y} href={`/manual/rules/${y}`} className="text-muted-foreground underline-offset-2 hover:underline">
                {y}
              </Link>
            )
          )}
        </span>
      </div>

      <RulesView
        seasonYear={seasonYear}
        proposals={rows}
        teamsTotal={teams}
        locksAt={slate?.locksAt?.toISOString() ?? null}
        locked={locked}
        viewer={
          owner
            ? { ownerId: owner.id, ownerName: owner.name, teamId: owner.teamId, isCommissioner: owner.isCommissioner }
            : null
        }
      />
    </div>
  );
}
