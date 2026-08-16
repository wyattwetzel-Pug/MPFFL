import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { TransactionStatus } from "@prisma/client";
import { currentSeason } from "@/lib/constants";
import {
  COUNTED_STATUSES,
  SEED_SEASON,
  deriveAssets,
  type DerivableEntry,
  type TeamAssets,
} from "@/lib/ledger/derive";
import { hiddenDeclarationTxIds, hiddenTopPlayerIds } from "@/lib/auction/declare";

const ENTRY_SELECT = {
  seasonYear: true,
  isContingent: true,
  resolvedAt: true,
  assetType: true,
  fromTeamId: true,
  toTeamId: true,
  amount: true,
  round: true,
  pickNumber: true,
  originTeamId: true,
  playerId: true,
  label: true,
} as const;

/** Entries that currently count — i.e. belong to an approved or completed transaction. */
async function countedEntries(seasonYear?: number): Promise<DerivableEntry[]> {
  return prisma.ledgerEntry.findMany({
    where: {
      transaction: { status: { in: COUNTED_STATUSES } },
      // Imported history through the seeded season is superseded by the
      // opening balance; beyond it, those trades are live obligations.
      OR: [
        { transaction: { isHistorical: false } },
        { seasonYear: { gt: SEED_SEASON } },
      ],
      ...(seasonYear != null ? { seasonYear } : {}),
    },
    select: ENTRY_SELECT,
  });
}

/*
 * Put names on named toppers.
 *
 * Derivation works on entries, which carry player ids and nothing else. The
 * name is a join, so it belongs here in the read path rather than smuggled into
 * the fold — but "Topper: Jeanty" is the only form of it anyone can read.
 */
async function nameToppers(assets: Iterable<TeamAssets>): Promise<void> {
  // Materialised deliberately: callers pass `map.values()`, and an iterator is
  // spent by the first pass — which left every name unresolved while looking
  // like it had worked.
  const teams = [...assets];
  const ids = new Set<number>();
  for (const team of teams) for (const t of team.namedToppers) ids.add(t.playerId);
  if (ids.size === 0) return;

  /*
   * §16.9 secrecy: a topper minted by an unrevealed auction declaration must
   * not surface on any public asset display — it would tip the room. Every
   * named-topper read passes through here, which is what makes the boundary
   * hold. The declaring team reviews its own on /declarations; commissioners
   * on /admin/declarations. Validation is untouched — it derives separately.
   */
  const hidden = await hiddenTopPlayerIds();
  for (const team of teams)
    team.namedToppers = team.namedToppers.filter((t) => !hidden.has(t.playerId));

  const players = await prisma.player.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, name: true },
  });
  const names = new Map(players.map((p) => [p.id, p.name]));
  for (const team of teams)
    for (const t of team.namedToppers) t.playerName = names.get(t.playerId) ?? null;
}

/** Every team's holdings for a season. One query, folded in memory. */
export const getLeagueAssets = cache(
  async (seasonYear: number = currentSeason()): Promise<Map<number, TeamAssets>> => {
    const [entries, teams] = await Promise.all([
      countedEntries(seasonYear),
      prisma.team.findMany({ select: { id: true } }),
    ]);
    const derived = deriveAssets(entries, seasonYear, teams.map((t) => t.id));
    await nameToppers(derived.values());
    return derived;
  }
);

export const getTeamAssets = cache(
  async (teamId: number, seasonYear: number = currentSeason()): Promise<TeamAssets> => {
    const all = await getLeagueAssets(seasonYear);
    return (
      all.get(teamId) ?? {
        teamId,
        seasonYear,
        capDollars: 0,
        psSpots: 0,
        conditionalCuts: 0,
        unconditionalCuts: 0,
        topperHoldovers: 0,
        namedToppers: [],
        rookiePicks: [],
      }
    );
  }
);

/**
 * Holdings for every season a team has activity in — future seasons included,
 * which is the point: trading 2027 cap dollars needs no 2027 asset to exist.
 */
export const getTeamAssetsAllSeasons = cache(async (teamId: number) => {
  const entries = await countedEntries();
  const seasons = [...new Set(entries.map((e) => e.seasonYear))].sort((a, b) => a - b);
  const all = seasons.map((year) => deriveAssets(entries, year, [teamId]).get(teamId)!);
  await nameToppers(all);
  return all;
});

/**
 * Individual future-season holdings, each traceable to the transaction that
 * created it. Aggregate balances answer "how much"; these answer "from where",
 * which is what you want when a pick shows up in a season three years out.
 */
export const getFutureAssetEntries = cache(async (teamId: number, afterSeason: number) => {
  const entries = await prisma.ledgerEntry.findMany({
    where: {
      seasonYear: { gt: afterSeason },
      transaction: { status: { in: COUNTED_STATUSES } },
      OR: [{ toTeamId: teamId }, { fromTeamId: teamId }],
      assetType: { not: "PLAYER" },
    },
    orderBy: [{ seasonYear: "asc" }, { assetType: "asc" }],
    include: {
      transaction: { select: { id: true, type: true, createdAt: true } },
      fromTeam: { select: { name: true } },
      toTeam: { select: { name: true } },
    },
  });
  return entries.map((e) => ({ ...e, direction: e.toTeamId === teamId ? "in" : "out" as const }));
});

/*
 * Future holdings for every team at once, for the rosters page.
 *
 * Only what a team *owns* — an entry it received. Picks it traded away are
 * real obligations, but the rosters page is a scan of what each roster has to
 * work with, and listing debits under a heading called "Future Assets" reads
 * as the opposite of what it means. The team page still shows both sides.
 */
export const getLeagueFutureAssets = cache(async (afterSeason: number) => {
  const entries = await prisma.ledgerEntry.findMany({
    where: {
      seasonYear: { gt: afterSeason },
      transaction: { status: { in: COUNTED_STATUSES } },
      assetType: { not: "PLAYER" },
      toTeamId: { not: null },
      // A contingent entry is a promise until it settles, and settling against
      // the owner conveys nothing — an unmet condition is not a holding.
      OR: [
        { isContingent: false },
        {
          AND: [
            { isContingent: true },
            { resolvedAt: { not: null } },
            { amount: { gt: 0 } },
          ],
        },
      ],
    },
    orderBy: [{ seasonYear: "asc" }, { round: "asc" }],
    select: {
      seasonYear: true,
      assetType: true,
      amount: true,
      round: true,
      toTeamId: true,
      transactionId: true,
    },
  });
  const byTeam = new Map<number, typeof entries>();
  for (const e of entries) {
    byTeam.set(e.toTeamId!, [...(byTeam.get(e.toTeamId!) ?? []), e]);
  }
  return byTeam;
});

export type LedgerPage = Awaited<ReturnType<typeof getTeamLedger>>;
export type LedgerRow = LedgerPage["rows"][number];

/**
 * A team's transaction feed, newest first.
 *
 * Membership is decided by the entries alone. Filing a transaction doesn't make
 * it yours: the commissioner files on other teams' behalf, and including those
 * put 65 empty rows in one team's ledger — trades between two other teams, with
 * nothing to show because that team wasn't a party to them.
 */
export const getTeamLedger = cache(async (teamId: number, page = 1, pageSize = 25, viewer: { teamId: number | null; isCommissioner: boolean } | null = null) => {
  // §16.9: another team's unrevealed secret tops stay out of this feed too.
  const hidden = await hiddenDeclarationTxIds(viewer);
  const where = {
    // Cancelled and rejected transactions never happened. Listing them beside
    // real ones invites reading a trade that was called off as history.
    status: { notIn: ["WITHDRAWN", "REJECTED"] as TransactionStatus[] },
    ...(hidden.length ? { id: { notIn: hidden } } : {}),
    OR: [
      { entries: { some: { fromTeamId: teamId } } },
      { entries: { some: { toTeamId: teamId } } },
    ],
  };
  const total = await prisma.transaction.count({ where });
  const transactions = await prisma.transaction.findMany({
    where,
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: { createdAt: "desc" },
    include: {
      submittedBy: { select: { name: true } },
      entries: {
        include: {
          player: { select: { name: true, position: true } },
          fromTeam: { select: { name: true, abbreviation: true } },
          toTeam: { select: { name: true, abbreviation: true } },
        },
      },
    },
  });

  const rows = transactions.map((t) => {
    const incoming = t.entries.filter((e) => e.toTeamId === teamId);
    const outgoing = t.entries.filter((e) => e.fromTeamId === teamId);
    // Who this was with. The ledger renders from one team's point of view, so
    // without this a trade shows what moved but never says who with.
    const counterparties = [
      ...new Map(
        t.entries
          .flatMap((e) => [
            e.fromTeamId != null && e.fromTeamId !== teamId ? ([e.fromTeamId, e.fromTeam?.name] as const) : null,
            e.toTeamId != null && e.toTeamId !== teamId ? ([e.toTeamId, e.toTeam?.name] as const) : null,
          ])
          .filter((x): x is readonly [number, string | undefined] => x !== null)
          .filter((x): x is readonly [number, string] => typeof x[1] === "string")
      ).values(),
    ];

    return {
      id: t.id,
      type: t.type,
      status: t.status,
      note: t.note,
      createdAt: t.createdAt,
      submittedBy: t.submittedBy?.name ?? null,
      incoming,
      outgoing,
      counterparties,
      counts: COUNTED_STATUSES.includes(t.status),
    };
  });

  return { rows, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
});

/** The league-wide transaction feed. */
export const getLeagueTransactions = cache(
  async (filter?: {
    status?: string; type?: string; teamId?: number;
    viewer?: { teamId: number | null; isCommissioner: boolean } | null;
  }) => {
    // §16.9: unrevealed secret tops are invisible except to their team and
    // commissioners; they surface as each player's bidding ends.
    const hidden = await hiddenDeclarationTxIds(filter?.viewer ?? null);
    return prisma.transaction.findMany({
      where: {
        ...(hidden.length ? { id: { notIn: hidden } } : {}),
        ...(filter?.status ? { status: filter.status as never } : {}),
        ...(filter?.type ? { type: filter.type as never } : {}),
        ...(filter?.teamId
          ? {
              OR: [
                { entries: { some: { fromTeamId: filter.teamId } } },
                { entries: { some: { toTeamId: filter.teamId } } },
                // A record-only adjustment moves nothing, so no entry names the
                // team. Without this it would be invisible under a team filter —
                // which is precisely where someone would go looking for it.
                { submittedForTeamId: filter.teamId },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        submittedBy: { select: { name: true } },
        entries: {
          include: {
            player: { select: { name: true, position: true } },
            fromTeam: { select: { name: true, abbreviation: true } },
            toTeam: { select: { name: true, abbreviation: true } },
          },
        },
      },
    });
  }
);
