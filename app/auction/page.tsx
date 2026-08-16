import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionOwner } from "@/lib/auth";
import { currentSeason } from "@/lib/constants";
import { COUNTED_STATUSES, SEED_SEASON, deriveAssets } from "@/lib/ledger/derive";
import { committedFor } from "@/lib/ledger/commitment";
import { PageHeader } from "@/components/ui/page-header";
import { LiveRefresh } from "@/components/league/live-refresh";
import { AuctionRoom } from "@/components/auction/auction-room";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Live Auction", description: "The MPFFL auction room — wins recorded live as the hammer falls." };

/*
 * The live auction, v1's layout on this site's ledger.
 *
 * One server pass computes everything — wins, money, rosters, rights — from
 * the same derivations every other page reads, and the client owns only what
 * is genuinely interactive. Money never comes from auction bookkeeping:
 * "To Spend" is allocation minus `committed`, so a win, a holdover and a
 * contract all move the same figure the moment they exist.
 */
export default async function AuctionPage() {
  const owner = await getSessionOwner();
  if (!owner) redirect("/sign-in");

  const season = currentSeason();

  const [teams, spots, poolPlayers, winTxs, entries, expiredStints] = await Promise.all([
    prisma.team.findMany({
      select: { id: true, name: true, abbreviation: true },
      orderBy: { name: "asc" },
    }),
    prisma.rosterSpot.findMany({
      where: { cutAt: null },
      select: {
        teamId: true, playerId: true, salary: true, contractEndSeason: true,
        acquiredForSeason: true, designation: true, isBackToBack: true,
        player: { select: { name: true, position: true, nflTeam: true } },
      },
    }),
    prisma.player.findMany({
      where: { active: true, rosterSpots: { none: { cutAt: null } } },
      select: { id: true, name: true, position: true, nflTeam: true },
      orderBy: { name: "asc" },
    }),
    prisma.transaction.findMany({
      where: { type: "AUCTION_WIN", status: "APPROVED" },
      orderBy: { id: "desc" },
      include: {
        entries: {
          include: { player: { select: { name: true, position: true, nflTeam: true } } },
        },
      },
    }),
    prisma.ledgerEntry.findMany({
      where: {
        transaction: { status: { in: COUNTED_STATUSES } },
        OR: [{ transaction: { isHistorical: false } }, { seasonYear: { gt: SEED_SEASON } }],
      },
      select: {
        seasonYear: true, isContingent: true, resolvedAt: true, assetType: true,
        fromTeamId: true, toTeamId: true, amount: true, round: true,
        pickNumber: true, originTeamId: true, playerId: true, label: true,
      },
    }),
    // Contracts that ran out last season leave the old team an automatic +$1
    // topper. Latest stint per player decides whose right it is.
    prisma.rosterSpot.findMany({
      where: { contractEndSeason: season - 1 },
      orderBy: { id: "asc" },
      select: { playerId: true, teamId: true, isBackToBack: true },
    }),
  ]);

  const derived = deriveAssets(entries, season, teams.map((t) => t.id));
  const teamName = new Map(teams.map((t) => [t.id, t.name]));

  const money = teams.map((t) => {
    const mine = spots.filter((s) => s.teamId === t.id);
    const allocation = derived.get(t.id)!.capDollars;
    const committed = committedFor(mine, season);
    return { teamId: t.id, allocation, committed, toSpend: allocation - committed };
  });

  const rosters = teams.map((t) => ({
    teamId: t.id,
    rows: spots
      .filter((s) => s.teamId === t.id)
      .map((s) => ({
        playerId: s.playerId,
        name: s.player.name,
        position: s.player.position,
        nflTeam: s.player.nflTeam,
        salary: s.salary,
        contractEndSeason: s.contractEndSeason,
        designation: s.designation,
        isBackToBack: s.isBackToBack,
      })),
  }));

  const wins = winTxs.flatMap((tx) => {
    const p = tx.entries.find((e) => e.assetType === "PLAYER" && e.playerId != null);
    if (!p || !p.toTeamId) return [];
    const detail = p.details as { salary?: number } | null;
    return [{
      transactionId: tx.id,
      playerId: p.playerId!,
      playerName: p.player?.name ?? `#${p.playerId}`,
      position: p.player?.position ?? "?",
      nflTeam: p.player?.nflTeam ?? "?",
      bid: detail?.salary ?? p.amount,
      teamId: p.toTeamId,
      topped: tx.entries.some((e) => e.assetType === "TOPPER_HOLDOVER"),
      at: tx.createdAt.toISOString(),
    }];
  });

  /*
   * Rights on players still in the pool, precomputed so the entry bar can warn
   * synchronously as the commissioner types. Named toppers from derivation;
   * automatic ones from expired stints.
   */
  const rostered = new Set(spots.map((s) => s.playerId));
  const rights: Record<number, { kind: "NAMED" | "AUTOMATIC"; teamId: number; teamName: string }[]> = {};
  for (const [teamId, assets] of derived) {
    for (const t of assets.namedToppers) {
      if (rostered.has(t.playerId)) continue;
      (rights[t.playerId] ??= []).push({
        kind: "NAMED", teamId, teamName: teamName.get(teamId) ?? `#${teamId}`,
      });
    }
  }
  const lastStint = new Map<number, { teamId: number }>();
  for (const s of expiredStints) lastStint.set(s.playerId, { teamId: s.teamId });
  for (const [playerId, stint] of lastStint) {
    if (rostered.has(playerId)) continue;
    const held = (rights[playerId] ??= []);
    if (!held.some((r) => r.teamId === stint.teamId)) {
      held.push({
        kind: "AUTOMATIC", teamId: stint.teamId,
        teamName: teamName.get(stint.teamId) ?? `#${stint.teamId}`,
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title={`${season} Auction`} />
        <LiveRefresh everyMs={30_000} />
      </div>

      <AuctionRoom
        teams={teams}
        money={money}
        rosters={rosters}
        wins={wins}
        pool={poolPlayers}
        rights={rights}
        viewerTeamId={owner.teamId}
        isCommissioner={owner.isCommissioner}
      />
    </div>
  );
}
