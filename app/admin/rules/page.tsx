import { requireCommissioner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentSeason } from "@/lib/constants";
import { slateIsLocked } from "@/lib/rules/lock";
import { RulesAdmin } from "@/components/admin/rules-admin";

export const dynamic = "force-dynamic";

/*
 * §22 — the commissioner's side: proposal CRUD with attribution, the
 * season's lock date-time, and post-lock outcome rulings.
 */
export default async function AdminRulesPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  await requireCommissioner();
  const { year } = await searchParams;
  const seasonYear = Number(year) || currentSeason();

  const [slate, proposals, teams, years] = await Promise.all([
    prisma.ruleSlate.findUnique({ where: { seasonYear } }),
    prisma.ruleProposal.findMany({
      where: { seasonYear },
      orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
      include: { _count: { select: { votes: true, comments: true } } },
    }),
    prisma.team.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.ruleSlate.findMany({ orderBy: { seasonYear: "desc" }, select: { seasonYear: true } }),
  ]);

  return (
    <RulesAdmin
      seasonYear={seasonYear}
      years={[...new Set([currentSeason(), ...years.map((y) => y.seasonYear)])].sort((a, b) => b - a)}
      locksAt={slate?.locksAt?.toISOString() ?? null}
      locked={slateIsLocked(slate?.locksAt)}
      teams={teams}
      proposals={proposals.map((p) => ({
        id: p.id,
        title: p.title,
        body: p.body,
        displayOrder: p.displayOrder,
        proposedByTeamId: p.proposedByTeamId,
        proposedByLabel: p.proposedByLabel,
        iconUrl: p.iconUrl,
        outcome: p.outcome,
        votes: p._count.votes,
        comments: p._count.comments,
      }))}
    />
  );
}
