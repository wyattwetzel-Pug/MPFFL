import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { RosterEditor } from "@/components/admin/roster-editor";

export const dynamic = "force-dynamic";

export default async function AdminTeamRosterPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId: teamIdRaw } = await params;
  const teamId = Number(teamIdRaw);
  if (!Number.isInteger(teamId)) notFound();

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      rosterSpots: {
        include: { player: { select: { name: true, position: true, nflTeam: true } } },
        orderBy: [{ cutAt: { sort: "asc", nulls: "first" } }, { id: "asc" }],
      },
    },
  });
  if (!team) notFound();

  const freeAgents = await prisma.player.findMany({
    where: { active: true, rosterSpots: { none: { cutAt: null } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, position: true, nflTeam: true },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">
        {team.name} <span className="text-gray-400 font-normal">({team.abbreviation})</span>
      </h1>
      <RosterEditor
        teamId={team.id}
        spots={team.rosterSpots.map((s) => ({
          id: s.id,
          playerName: s.player.name,
          position: s.player.position,
          nflTeam: s.player.nflTeam,
          salary: s.salary,
          contractEndSeason: s.contractEndSeason,
          designation: s.designation,
          isBackToBack: s.isBackToBack,
          notes: s.notes,
          cutAt: s.cutAt ? s.cutAt.toISOString().slice(0, 10) : null,
        }))}
        freeAgents={freeAgents}
      />
    </div>
  );
}
