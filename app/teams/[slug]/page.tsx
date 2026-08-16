import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getFutureAssetEntries, getTeamAssets, getTeamLedger } from "@/lib/ledger/queries";
import { getByeWeeks } from "@/lib/byes";
import { getSessionOwner } from "@/lib/auth";
import { TeamSettings } from "@/components/league/team-settings";
import { currentSeason } from "@/lib/constants";
import { defaultRosterSort } from "@/lib/roster-display";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { AssetSummary } from "@/components/league/asset-summary";
import { FutureAssets } from "@/components/league/future-assets";
import { RosterTable } from "@/components/league/roster-table";
import { RosterLegend, rosterSummary } from "@/components/league/roster-legend";
import { TeamLedger } from "@/components/league/team-ledger";

export const dynamic = "force-dynamic";

/*
 * Teams are addressed by a slug derived from the team name. The slug is stored,
 * so renaming a team — which happens periodically — doesn't break its URL.
 *
 * Owner names are still accepted so links shared before this change resolve;
 * they make poor identifiers, since co-owned teams produce "Drew%20%26%20Erik"
 * and a team's URL would otherwise change hands with its owner.
 */
async function findTeam(slug: string) {
  const key = decodeURIComponent(slug);
  return prisma.team.findFirst({
    where: {
      OR: [
        { slug: { equals: key, mode: "insensitive" } },
        { abbreviation: { equals: key, mode: "insensitive" } },
      ],
    },
    include: {
      owners: {
        include: {
          owner: {
            select: {
              id: true, name: true, email: true, phone: true,
              privacyConsentAt: true, touConsentAt: true, smsConsentAt: true,
            },
          },
        },
      },
    },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const team = await findTeam(slug);
  return { title: team ? team.name : "Team", description: team ? `${team.name} — roster, contracts and cap position in MPFFL.` : undefined };
}

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const team = await findTeam(slug);
  if (!team) notFound();

  const season = currentSeason();
  const owner = await getSessionOwner();
  const [assets, futureEntries, ledger, byes, spots, allTeams] = await Promise.all([
    getTeamAssets(team.id, season),
    getFutureAssetEntries(team.id, season),
    getTeamLedger(
      team.id,
      Math.max(1, Number(pageParam) || 1),
      25,
      owner ? { teamId: owner.teamId, isCommissioner: owner.isCommissioner } : null
    ),
    getByeWeeks(),
    prisma.rosterSpot.findMany({
      where: { teamId: team.id, cutAt: null },
      include: { player: { select: { name: true, position: true, nflTeam: true } } },
    }),
    prisma.team.findMany({ select: { id: true, name: true } }),
  ]);

  const teamNames = new Map(allTeams.map((t) => [t.id, t.name]));
  const rows = spots
    .map((s) => ({
      id: s.id,
      position: s.player.position,
      playerName: s.player.name,
      nflTeam: s.player.nflTeam,
      byeWeek: byes.get(s.player.nflTeam) ?? null,
      salary: s.salary,
      contractEndSeason: s.contractEndSeason,
      acquiredForSeason: s.acquiredForSeason,
      isBackToBack: s.isBackToBack,
      designation: s.designation,
      notes: s.notes,
    }))
    .sort(defaultRosterSort);

  const summary = rosterSummary(rows);

  return (
    <div className="space-y-8">
      <PageHeader
        title={
          <span>
            {team.name}{" "}
            <span className="font-normal text-muted-foreground">({team.abbreviation})</span>
          </span>
        }
        actions={
          owner?.isCommissioner ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/admin/rosters/${team.id}`}>Edit roster</Link>
            </Button>
          ) : undefined
        }
      />
      {team.owners.length > 0 && (
        <p className="-mt-6 text-sm text-muted-foreground">
          {team.owners.map((o) => o.owner.name).join(" & ")}
        </p>
      )}

      {/* Settings appear for whoever is looking: your own consent is a live
          checkbox, a co-owner's is state you can read but not change. */}
      {owner && (team.owners.some((to) => to.owner.id === owner.id) || owner.isCommissioner) && (
        <section className="space-y-3 border-b pb-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Team settings
          </h2>
          <TeamSettings
            teamId={team.id}
            teamName={team.name}
            canRename={owner.teamId === team.id || owner.isCommissioner}
            isCommissioner={owner.isCommissioner}
            owners={team.owners.map((to) => ({
              id: to.owner.id,
              name: to.owner.name,
              email: to.owner.email,
              phone: to.owner.phone,
              isSelf: to.owner.id === owner.id,
              privacy: to.owner.privacyConsentAt != null,
              tou: to.owner.touConsentAt != null,
              sms: to.owner.smsConsentAt != null,
            }))}
          />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{season} assets</h2>
        <AssetSummary
          assets={assets}
          teamNames={teamNames}
          future={
            futureEntries.length > 0 ? (
              <FutureAssets entries={futureEntries} teamNames={teamNames} teamId={team.id} />
            ) : undefined
          }
        />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Roster</h2>
          <p className="text-sm text-muted-foreground">
            {summary.players} players (${summary.spend}) · {summary.contracts} contracted (${summary.contracted})
          </p>
        </div>
        {rows.length === 0 ? (
          <EmptyState title="Empty roster" />
        ) : (
          <>
            <Card className="overflow-hidden">
              <RosterTable rows={rows} />
            </Card>
            <RosterLegend />
          </>
        )}
      </section>

      <section id="ledger" className="scroll-mt-20 space-y-3">
        <h2 className="text-lg font-semibold">Ledger</h2>
        <TeamLedger page={ledger} />
        {ledger.pageCount > 1 && (
          <Pagination
            page={ledger.page}
            pageCount={ledger.pageCount}
            total={ledger.total}
            pageSize={ledger.pageSize}
            pathname={`/teams/${team.slug}`}
            hash="ledger"
            itemLabel="transactions"
          />
        )}
      </section>

    </div>
  );
}
