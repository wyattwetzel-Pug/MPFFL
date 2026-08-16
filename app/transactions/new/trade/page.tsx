import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { currentSeason } from "@/lib/constants";
import { leagueSnapshot } from "@/lib/ledger/snapshot";
import { PageHeader } from "@/components/ui/page-header";
import { TradeForm, type TradeTeam } from "@/components/league/trade-form";

export const dynamic = "force-dynamic";

export default async function NewTradePage() {
  // requireOwner, not a hand-rolled check: it carries where they were headed
  // into the sign-in link, so filing a trade survives signing in.
  const owner = await requireOwner();

  const season = currentSeason();
  const [teams, snapshot] = await Promise.all([
    prisma.team.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        rosterSpots: {
          where: { cutAt: null },
          select: {
            playerId: true, salary: true, contractEndSeason: true,
            acquiredForSeason: true,
            player: { select: { name: true, position: true } },
          },
        },
      },
    }),
    leagueSnapshot(),
  ]);

  /*
   * Holdings and picks both come from the snapshot rather than separate
   * queries, so the picker cannot offer something the ledger doesn't recognise
   * — and the browser can run the very same validator over the very same
   * numbers the server will.
   */
  const data: TradeTeam[] = teams.map((t) => {
    const held = snapshot.get(t.id);
    return {
      id: t.id,
      name: t.name,
      players: t.rosterSpots
        .map((s) => ({
          playerId: s.playerId,
          name: s.player.name,
          position: s.player.position,
          salary: s.salary,
          contractEndSeason: s.contractEndSeason,
          acquiredForSeason: s.acquiredForSeason,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      seasons: [...(held?.assets.values() ?? [])].sort((a, b) => a.seasonYear - b.seasonYear),
      contracted: [...(held?.contracted.entries() ?? [])],
      committed: [...(held?.committed.entries() ?? [])],
    };
  });

  // Owners file trades their own team is part of; commissioners, any trade.
  const selectable = owner.isCommissioner ? data : data.filter((t) => t.id === owner.teamId);
  if (selectable.length === 0) {
    return (
      <div>
        <PageHeader title="File a trade" />
        <p className="mt-4 text-sm text-muted-foreground">
          You aren&apos;t assigned to a team, so there&apos;s no trade to file.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="File a trade" />
      <TradeForm
        teams={data}
        // Their own team leads, commissioner or not — that is whose trade it usually is.
        defaultTeamId={owner.teamId ?? data[0].id}
        isCommissioner={owner.isCommissioner}
        season={season}
      />
    </div>
  );
}
