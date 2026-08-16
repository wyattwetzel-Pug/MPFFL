import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { currentSeason } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { TransactionForm, type FormTeam } from "@/components/league/transaction-form";
import { defaultRosterSort } from "@/lib/roster-display";

export const dynamic = "force-dynamic";

export default async function NewTransactionPage() {
  // requireOwner, not a hand-rolled check: it carries where they were headed
  // into the sign-in link, so filing a trade survives signing in.
  const owner = await requireOwner();

  // Owners file for their own team only; commissioners choose.
  const teams = await prisma.team.findMany({
    where: owner.isCommissioner ? {} : { id: owner.teamId ?? -1 },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      rosterSpots: {
        where: { cutAt: null },
        select: {
          playerId: true, salary: true, contractEndSeason: true,
          player: { select: { name: true, position: true, nflTeam: true } },
        },
      },
    },
  });

  const data: FormTeam[] = teams.map((t) => ({
    id: t.id,
    name: t.name,
    players: t.rosterSpots
      .map((s) => ({
        playerId: s.playerId,
        name: s.player.name,
        position: s.player.position,
        salary: s.salary,
        contractEndSeason: s.contractEndSeason,
      }))
      .sort((a, b) =>
        defaultRosterSort(
          { ...a, playerName: a.name, nflTeam: "", byeWeek: null, isBackToBack: false,
            designation: "ACTIVE", notes: null, id: a.playerId },
          { ...b, playerName: b.name, nflTeam: "", byeWeek: null, isBackToBack: false,
            designation: "ACTIVE", notes: null, id: b.playerId }
        )
      ),
  }));

  if (data.length === 0) {
    return (
      <div>
        <PageHeader title="File a transaction" />
        <p className="mt-4 text-sm text-muted-foreground">
          You aren&apos;t assigned to a team, so there&apos;s nothing to file against.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="File a transaction" />
      <TransactionForm
        teams={data}
        defaultTeamId={owner.teamId ?? null}
        isCommissioner={owner.isCommissioner}
        season={currentSeason()}
      />
    </div>
  );
}
