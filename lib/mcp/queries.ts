/*
 * §21 — the league MCP server's ONLY data source.
 *
 * Every tool reads through this module, and this module is the privacy
 * boundary: everything the connector can answer is deliberately public
 * league data. Nothing here may touch commissioner-private surfaces or
 * secrets (sessions, tokens, consent records
 * chats, team assessments, rival priors, nominations). verify-mcp.ts scans
 * this file and fails the suite if a forbidden accessor appears.
 *
 * Framework-free so the verify script can drive it directly.
 */
import { prisma } from "@/lib/prisma";
import { currentSeason } from "@/lib/constants";
import { COUNTED_STATUSES, SEED_SEASON, deriveAssets } from "@/lib/ledger/derive";
import { hiddenDeclarationTxIds } from "@/lib/auction/declare";

const season = () => currentSeason();

async function derivedAll() {
  const teams = await prisma.team.findMany({ select: { id: true, name: true } });
  const entries = await prisma.ledgerEntry.findMany({
    where: {
      transaction: { status: { in: COUNTED_STATUSES } },
      OR: [{ transaction: { isHistorical: false } }, { seasonYear: { gt: SEED_SEASON } }],
    },
    select: {
      seasonYear: true, isContingent: true, resolvedAt: true, assetType: true,
      fromTeamId: true, toTeamId: true, amount: true, round: true,
      pickNumber: true, originTeamId: true, playerId: true, label: true,
    },
  });
  return { teams, derived: deriveAssets(entries as never, season(), teams.map((t) => t.id)) };
}

/** 1 + 1.5 — every team's holdings and cap position, the whole league at once. */
export async function leagueSnapshotTable() {
  const { teams, derived } = await derivedAll();
  const spots = await prisma.rosterSpot.findMany({
    where: { cutAt: null },
    select: { teamId: true, salary: true, contractEndSeason: true, notes: true },
  });
  const yr = season();
  return teams.map((t) => {
    const mine = spots.filter((s) => s.teamId === t.id);
    const contracted = mine.filter(
      (s) =>
        (s.contractEndSeason != null && s.contractEndSeason >= yr) ||
        (s.contractEndSeason == null && /rookie pick in \d{4}/.test(s.notes ?? ""))
    );
    const d = derived.get(t.id)!;
    return {
      team: t.name,
      capAllocation: d.capDollars,
      contractedDollars: contracted.reduce((n, s) => n + s.salary, 0),
      availableAtAuction: d.capDollars - contracted.reduce((n, s) => n + s.salary, 0),
      rosterSize: mine.length,
      contractedPlayers: contracted.length,
      conditionalCuts: d.conditionalCuts,
      unconditionalCuts: d.unconditionalCuts,
      topperHoldoverRights: d.topperHoldovers,
      rookiePicks: d.rookiePicks.map((p) => `${p.seasonYear} R${p.round} #${p.pickNumber}`),
    };
  });
}

/** 1 — one team's full roster with contracts. */
export async function teamRoster(teamName: string) {
  const team = await prisma.team.findFirst({
    where: { name: { contains: teamName, mode: "insensitive" } },
    select: { id: true, name: true, abbreviation: true },
  });
  if (!team) return { error: `No team matching "${teamName}". Try the exact name from league_snapshot.` };
  const spots = await prisma.rosterSpot.findMany({
    where: { cutAt: null, teamId: team.id },
    orderBy: { salary: "desc" },
    select: {
      salary: true, contractEndSeason: true, isBackToBack: true, designation: true, notes: true,
      player: { select: { name: true, position: true, nflTeam: true } },
    },
  });
  return {
    team: team.name, owners: team.abbreviation,
    players: spots.map((s) => ({
      name: s.player.name, position: s.player.position, nflTeam: s.player.nflTeam,
      salary: s.salary,
      contractThrough: s.contractEndSeason,
      backToBack: s.isBackToBack || undefined,
      designation: s.designation !== "ACTIVE" ? s.designation : undefined,
      notes: s.notes ?? undefined,
    })),
  };
}

/** 3 — player lookup: who is he, who owns him, contract state, league history. */
export async function playerLookup(name: string) {
  const players = await prisma.player.findMany({
    where: { name: { contains: name, mode: "insensitive" } },
    take: 5,
    select: { id: true, name: true, position: true, nflTeam: true },
  });
  if (players.length === 0) return { error: `No player matching "${name}".` };
  const out = [];
  for (const p of players) {
    const spot = await prisma.rosterSpot.findFirst({
      where: { cutAt: null, playerId: p.id },
      select: { salary: true, contractEndSeason: true, isBackToBack: true, team: { select: { name: true } } },
    });
    const stints = await prisma.rosterSpot.findMany({
      where: { playerId: p.id },
      orderBy: { acquiredAt: "asc" },
      select: { salary: true, acquiredAt: true, cutAt: true, contractEndSeason: true, team: { select: { name: true } } },
    });
    out.push({
      ...p, id: undefined,
      currentTeam: spot
        ? { team: spot.team.name, salary: spot.salary, contractThrough: spot.contractEndSeason, backToBack: spot.isBackToBack || undefined }
        : "free agent / auction pool",
      leagueHistory: stints.map((s) => ({
        team: s.team.name, salary: s.salary, contractThrough: s.contractEndSeason,
        from: s.acquiredAt.toISOString().slice(0, 10),
        until: s.cutAt?.toISOString().slice(0, 10) ?? "present",
      })),
    });
  }
  return out;
}

/** 2 — the event-sourced history, filterable. Read-only by league ruling. */
export async function transactionHistory(opts: { team?: string; player?: string; type?: string; limit?: number }) {
  const limit = Math.min(opts.limit ?? 25, 100);
  const player = opts.player
    ? await prisma.player.findFirst({ where: { name: { contains: opts.player, mode: "insensitive" } }, select: { id: true } })
    : null;
  const team = opts.team
    ? await prisma.team.findFirst({ where: { name: { contains: opts.team, mode: "insensitive" } }, select: { id: true } })
    : null;
  // §16.9: MCP callers are anonymous league members — unrevealed secret top
  // declarations stay invisible here exactly as on the public feed.
  const hiddenDecls = await hiddenDeclarationTxIds(null);
  const txs = await prisma.transaction.findMany({
    where: {
      status: { in: ["APPROVED", "COMPLETED"] },
      ...(hiddenDecls.length ? { id: { notIn: hiddenDecls } } : {}),
      ...(opts.type ? { type: opts.type as never } : {}),
      ...(player ? { entries: { some: { playerId: player.id } } } : {}),
      ...(team ? { entries: { some: { OR: [{ fromTeamId: team.id }, { toTeamId: team.id }] } } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      type: true, note: true, createdAt: true,
      entries: {
        select: {
          assetType: true, amount: true, seasonYear: true, label: true,
          player: { select: { name: true } },
          fromTeam: { select: { name: true } }, toTeam: { select: { name: true } },
        },
      },
    },
  });
  return txs.map((t) => ({
    type: t.type, date: t.createdAt.toISOString().slice(0, 10), note: t.note ?? undefined,
    moves: t.entries.map((e) =>
      [
        e.player?.name ?? e.label ?? e.assetType,
        e.assetType === "CAP_DOLLARS" || e.player ? `$${e.amount}` : `×${e.amount}`,
        `${e.fromTeam?.name ?? "league"} → ${e.toTeam?.name ?? "league"}`,
        `(${e.seasonYear})`,
      ].join(" ")
    ),
  }));
}

/** 4 — the manual, latest version, as plain text; plus the holdover-rates table. */
export async function manual() {
  const v = await prisma.manualVersion.findFirst({ orderBy: { version: "desc" }, select: { version: true, html: true } });
  const rates = await prisma.holdoverRate.findMany({ orderBy: [{ pickNumber: "asc" }, { position: "asc" }] });
  const text = (v?.html ?? "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
  return {
    version: v?.version,
    holdoverRates: rates.map((r) => ({ pick: r.pickNumber, position: r.position, amount: r.amount })),
    manualText: text,
  };
}

/** 5 — the rookie draft: order at season start, picks as they land. */
export async function rookieDraft(seasonYear?: number) {
  const yr = seasonYear ?? season();
  const picks = await prisma.draftPick.findMany({
    where: { seasonYear: yr },
    orderBy: { slot: "asc" },
    select: {
      slot: true, selection: true, holdoverAmount: true, pickedAt: true,
      player: { select: { name: true, position: true, nflTeam: true } },
    },
  });
  if (picks.length === 0) return { seasonYear: yr, status: "no draft rows for this season" };
  return {
    seasonYear: yr,
    picks: picks.map((p) => ({
      slot: p.slot, round: Math.ceil(p.slot / 16),
      player: p.player ? `${p.player.name} (${p.player.position}, ${p.player.nflTeam})` : "on the clock / upcoming",
      selection: p.selection ?? undefined,
      holdoverAmount: p.holdoverAmount ?? undefined,
      pickedAt: p.pickedAt?.toISOString().slice(0, 10),
    })),
  };
}

/** 6 — auction results, live as players are won. */
export async function auctionResults(seasonYear?: number) {
  const yr = seasonYear ?? season();
  const wins = await prisma.transaction.findMany({
    where: { type: "AUCTION_WIN", status: { in: ["APPROVED", "COMPLETED"] } },
    orderBy: { createdAt: "asc" },
    select: {
      createdAt: true,
      entries: {
        where: { assetType: "PLAYER", seasonYear: yr },
        select: { amount: true, player: { select: { name: true, position: true } }, toTeam: { select: { name: true } } },
      },
    },
  });
  const rows = wins.flatMap((w) =>
    w.entries.filter((e) => e.player).map((e, i) => ({
      player: `${e.player!.name} (${e.player!.position})`,
      price: e.amount,
      wonBy: e.toTeam?.name ?? "?",
      at: w.createdAt.toISOString(),
    }))
  );
  return { seasonYear: yr, picksMade: rows.length, results: rows };
}

/** 7 — dates that matter. */
export async function leagueCalendar() {
  const yr = season();
  const [milestones, seasonRow] = await Promise.all([
    prisma.leagueMilestone.findMany({
      where: { seasonYear: { gte: yr } },
      orderBy: { occursAt: "asc" },
      select: { seasonYear: true, key: true, occursAt: true, note: true },
    }),
    prisma.season.findUnique({ where: { year: yr }, select: { auctionDate: true, cutdownDate: true } }),
  ]);
  return {
    season: yr,
    auctionDate: seasonRow?.auctionDate?.toISOString() ?? null,
    cutdownDate: seasonRow?.cutdownDate?.toISOString() ?? null,
    milestones: milestones.map((m) => ({
      season: m.seasonYear, event: m.key, when: m.occursAt.toISOString(), note: m.note ?? undefined,
    })),
  };
}
