/*
 * The pre-auction roster clear.
 *
 * Days before the auction, every player whose salary belongs to a season
 * already gone returns to the pool: no contract, or a contract that expired
 * before this season. Two exceptions stay — contracts running this season or
 * beyond, and this year's slow-draft holdovers, who are identified by the
 * ledger entry that created them (`source: ROOKIE_HOLDOVER`), not by a
 * heuristic. Rookies *topped* in the draft need no exception: a TOP never
 * created a roster spot, so there is nothing to clear. IR and PS clear on the
 * same test as everyone (owner's disposition, §16.2).
 *
 * v1 did this with three archive tables, an audit log, and a deleteMany — an
 * apparatus for surviving a destructive delete. Here the clear *is* sixteen
 * transactions, one per team, each a set of PLAYER entries team → null,
 * approved through the same lifecycle everything else uses. The backup is the
 * ledger: reverting a team's transaction restores that team's roster, alone,
 * with nothing to reconcile.
 *
 * The revert refuses while a declaration references the team. Un-clearing
 * after somebody has declared a holdover would put the same player on a
 * roster twice at two salaries — the guard names the declarations to withdraw
 * first.
 *
 * Framework-free so `verify-clear.ts` can drive the whole path.
 */
import { prisma } from "@/lib/prisma";
import { currentSeason } from "@/lib/constants";
import { applyStatusChange } from "@/lib/ledger/transition";
import { countsFor } from "@/lib/ledger/commitment";

export type ClearLine = {
  spotId: number;
  playerId: number;
  playerName: string;
  position: string;
  salary: number;
  designation: string;
  /** Why this line falls the way it does, in words the commissioner reads. */
  reason: string;
};

export type TeamProposal = {
  teamId: number;
  teamName: string;
  clears: ClearLine[];
  keeps: ClearLine[];
  clearedSalary: number;
};

/** Marks the season's clear transactions so a second run finds them. */
const noteFor = (season: number, teamName: string) =>
  `${season} pre-auction clear — ${teamName}`;

/**
 * Who leaves and who stays, per team. Read-only: the rule proposes, a person
 * confirms. A wrong rule should cost a second look, not a restore.
 */
export async function clearProposal(season = currentSeason()): Promise<TeamProposal[]> {
  const teams = await prisma.team.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const spots = await prisma.rosterSpot.findMany({
    where: { cutAt: null },
    select: {
      id: true, teamId: true, playerId: true, salary: true, designation: true,
      contractEndSeason: true, acquiredForSeason: true, notes: true,
      player: { select: { name: true, position: true } },
    },
  });

  /*
   * This season's holdovers, from the record rather than a guess: the ledger
   * entries that put them on rosters. Notes are the fallback for any row a
   * hand edit created.
   */
  const holdoverEntries = await prisma.ledgerEntry.findMany({
    where: {
      assetType: "PLAYER",
      fromTeamId: null,
      seasonYear: season,
      playerId: { not: null },
      transaction: { status: { in: ["APPROVED", "COMPLETED"] } },
    },
    select: { playerId: true, details: true },
  });
  const heldOver = new Set(
    holdoverEntries
      .filter((e) => {
        const src = (e.details as { source?: string } | null)?.source;
        return src != null && src !== "AUCTION";
      })
      .map((e) => e.playerId!)
  );

  const line = (s: (typeof spots)[number], reason: string): ClearLine => ({
    spotId: s.id, playerId: s.playerId, playerName: s.player.name,
    position: s.player.position, salary: s.salary, designation: s.designation, reason,
  });

  return teams.map((t) => {
    const mine = spots.filter((s) => s.teamId === t.id);
    const clears: ClearLine[] = [];
    const keeps: ClearLine[] = [];

    for (const s of mine) {
      if (s.contractEndSeason != null && s.contractEndSeason >= season) {
        keeps.push(line(s, `contract through ${s.contractEndSeason}`));
      } else if (
        s.contractEndSeason == null &&
        (heldOver.has(s.playerId) || /rookie pick in \d{4}/.test(s.notes ?? ""))
      ) {
        keeps.push(line(s, `${season} holdover`));
      } else if (s.contractEndSeason != null) {
        clears.push(line(s, `contract expired ${s.contractEndSeason}`));
      } else if (countsFor(s, season)) {
        // Uncontracted, acquired for this season, but not a holdover — a
        // hand-added pickup. It clears under the rule as stated; named so the
        // commissioner sees it rather than wonders later.
        clears.push(line(s, `no contract (added for ${season} outside the draft)`));
      } else {
        clears.push(line(s, "no contract"));
      }
    }

    return {
      teamId: t.id,
      teamName: t.name,
      clears,
      keeps,
      clearedSalary: clears.reduce((sum, c) => sum + c.salary, 0),
    };
  });
}

export type ApplyResult =
  | { ok: true; transactions: { teamId: number; transactionId: number }[]; cleared: number }
  | { ok: false; error: string };

/**
 * File and approve the clear — one transaction per team, so one team can be
 * restored without disturbing fifteen others. Idempotent: a team whose clear
 * already exists for the season is skipped, not doubled.
 */
export async function applyClear(ownerId: number, season = currentSeason()): Promise<ApplyResult> {
  const proposal = await clearProposal(season);
  const existing = await prisma.transaction.findMany({
    where: { type: "AUCTION_CLEAR", note: { startsWith: `${season} pre-auction clear` } },
    select: { submittedForTeamId: true },
  });
  const done = new Set(existing.map((e) => e.submittedForTeamId));

  const results: { teamId: number; transactionId: number }[] = [];
  let cleared = 0;

  for (const team of proposal) {
    if (done.has(team.teamId)) continue;
    if (team.clears.length === 0) continue;

    const tx = await prisma.transaction.create({
      data: {
        type: "AUCTION_CLEAR",
        status: "SUBMITTED",
        note: noteFor(season, team.teamName),
        submittedByOwnerId: ownerId,
        submittedForTeamId: team.teamId,
        entries: {
          create: team.clears.map((c) => ({
            assetType: "PLAYER" as const,
            seasonYear: season,
            amount: c.salary,
            playerId: c.playerId,
            fromTeamId: team.teamId,
            toTeamId: null,
            label: c.reason,
          })),
        },
        statusLogs: { create: { newStatus: "SUBMITTED", changedByOwnerId: ownerId } },
      },
      select: { id: true },
    });
    // The real lifecycle, not a shortcut: APPROVED is what moves rosters.
    await applyStatusChange(tx.id, "APPROVED", ownerId);
    results.push({ teamId: team.teamId, transactionId: tx.id });
    cleared += team.clears.length;
  }

  return { ok: true, transactions: results, cleared };
}

export type ClearStatus = {
  teamId: number;
  teamName: string;
  transactionId: number;
  status: string;
  players: number;
}[];

/** The season's clear transactions, team by team, for the screen. */
export async function clearStatus(season = currentSeason()): Promise<ClearStatus> {
  const txs = await prisma.transaction.findMany({
    where: { type: "AUCTION_CLEAR", note: { startsWith: `${season} pre-auction clear` } },
    select: {
      id: true, status: true, submittedForTeamId: true,
      _count: { select: { entries: true } },
    },
    orderBy: { id: "asc" },
  });
  const teams = await prisma.team.findMany({ select: { id: true, name: true } });
  const name = new Map(teams.map((t) => [t.id, t.name]));
  return txs.map((t) => ({
    teamId: t.submittedForTeamId!,
    teamName: name.get(t.submittedForTeamId!) ?? `Team #${t.submittedForTeamId}`,
    transactionId: t.id,
    status: t.status,
    players: t._count.entries,
  }));
}

/**
 * Restore one team's roster by reverting its clear. Refuses while any
 * declaration names a player from that team's clear — restoring underneath a
 * declaration would roster the same player twice at two salaries.
 */
export async function revertClear(
  teamId: number,
  ownerId: number,
  season = currentSeason()
): Promise<{ ok: true; restored: number } | { ok: false; error: string }> {
  const tx = await prisma.transaction.findFirst({
    where: {
      type: "AUCTION_CLEAR",
      status: "APPROVED",
      submittedForTeamId: teamId,
      note: { startsWith: `${season} pre-auction clear` },
    },
    include: { entries: { select: { playerId: true } } },
  });
  if (!tx) return { ok: false, error: "No applied clear to revert for this team." };

  const clearedPlayers = tx.entries.map((e) => e.playerId).filter((p): p is number => p != null);
  const declarations = await prisma.transaction.findMany({
    where: {
      type: "AUCTION_DECLARATION",
      status: { in: ["SUBMITTED", "APPROVED", "COMPLETED"] },
      entries: { some: { playerId: { in: clearedPlayers } } },
    },
    select: { id: true },
  });
  if (declarations.length > 0) {
    return {
      ok: false,
      error:
        `${declarations.length} declaration(s) name players from this clear — withdraw ` +
        `${declarations.map((d) => `#${d.id}`).join(", ")} first, or the same player ends up rostered twice.`,
    };
  }

  await applyStatusChange(tx.id, "SUBMITTED", ownerId, `${season} clear reverted for re-check`);
  return { ok: true, restored: clearedPlayers.length };
}
