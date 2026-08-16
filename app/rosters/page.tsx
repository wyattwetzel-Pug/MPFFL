import { prisma } from "@/lib/prisma";
import { getByeWeeks } from "@/lib/byes";
import { getSessionOwner } from "@/lib/auth";
import { getLeagueAssets, getLeagueFutureAssets } from "@/lib/ledger/queries";
import { currentSeason } from "@/lib/constants";
import { RostersView } from "@/components/rosters-view";
import { defaultRosterSort, type TeamRosterData } from "@/lib/roster-display";

export const metadata = {
  title: "Rosters",
  description: "All sixteen MPFFL rosters — players, salaries, contracts and cap space, live from the ledger.",
};

export const dynamic = "force-dynamic";

export default async function RostersPage() {
  const [byeWeeks, owner, leagueAssets, futureByTeam] = await Promise.all([
    getByeWeeks(),
    getSessionOwner(),
    getLeagueAssets(),
    getLeagueFutureAssets(currentSeason()),
  ]);
  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
    include: {
      owners: { include: { owner: { select: { name: true } } } },
      rosterSpots: {
        where: { cutAt: null },
        include: {
          player: { select: { name: true, position: true, nflTeam: true, active: true } },
        },
      },
    },
  });

  const data: TeamRosterData[] = teams.map((team) => ({
    teamId: team.id,
    teamName: team.name,
    abbreviation: team.abbreviation,
    slug: team.slug,
    isOwnTeam: owner?.teamId === team.id,
    ownerNames: team.owners.map((to) => to.owner.name),
    rows: team.rosterSpots
      .map((spot) => ({
        id: spot.id,
        position: spot.player.position,
        playerName: spot.player.name,
        nflTeam: spot.player.nflTeam,
        byeWeek: byeWeeks.get(spot.player.nflTeam) ?? null,
        salary: spot.salary,
        contractEndSeason: spot.contractEndSeason,
        acquiredForSeason: spot.acquiredForSeason,
        isBackToBack: spot.isBackToBack,
        playerInactive: !spot.player.active,
        designation: spot.designation,
        notes: spot.notes,
      }))
      .sort(defaultRosterSort),
  }));

  // The signed-in owner's team leads; everyone else stays alphabetical.
  data.sort((a, b) => Number(b.isOwnTeam) - Number(a.isOwnTeam));

  return <RostersView teams={data} assets={Object.fromEntries(leagueAssets)}
      future={Object.fromEntries(futureByTeam)}
    />;
}
