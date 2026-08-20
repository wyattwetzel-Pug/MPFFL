import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getSessionOwner } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { LegacyStandingsTable } from "@/components/legacy/legacy-standings-table";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Legacy",
  description: "All-time MPFFL standings carried over from the parent league.",
};

export default async function LegacyPage() {
  const [owner, standings, teams] = await Promise.all([
    getSessionOwner(),
    prisma.legacyStanding.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.team.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, slug: true } }),
  ]);

  const editable = owner?.isCommissioner ?? false;

  return (
    <div className="space-y-6">
      <PageHeader title="Legacy" />
      <p className="text-sm text-muted-foreground">
        All-time standings from the parent league, frozen at the fork.
        {editable && " Cells save as you leave them."}
      </p>

      <Card>
        <CardContent className="p-0">
          <LegacyStandingsTable
            rows={standings.map((s) => ({
              id: s.id,
              teamId: s.teamId,
              slug: teams.find((t) => t.id === s.teamId)?.slug ?? "",
              label: s.label,
              wins: s.wins,
              losses: s.losses,
              winPct: s.winPct,
              pointsScored: s.pointsScored,
              pointsAgainst: s.pointsAgainst,
              highestScorerSeasons: s.highestScorerSeasons,
              playoffAppearances: s.playoffAppearances,
              playoffRecord: s.playoffRecord,
              oneSeedAppearances: s.oneSeedAppearances,
              titleAppearances: s.titleAppearances,
              titleWins: s.titleWins,
              bpotya: s.bpotya,
              coty: s.coty,
            }))}
            teams={teams}
            editable={editable}
          />
        </CardContent>
      </Card>
    </div>
  );
}
