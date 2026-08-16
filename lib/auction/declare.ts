/*
 * Pre-auction declarations (§16.9).
 *
 * After the clear, two rights get exercised before bidding opens:
 *
 *   HOLDOVER — public, instant. The player rejoins the roster at
 *   max(first-pick rate, salary + $25); the spot itself is the cap
 *   commitment (§16.3), so the money moves the moment it's filed and the
 *   auction pool excludes him because the roster does. Filed against the
 *   team's own expiring-contract right (free), or by spending a
 *   compensatory T/H on an uncontracted cleared player.
 *
 *   COMPENSATORY TOP — secret until revealed. Spends a T/H and mints a
 *   *named* topper (the rookie draft's shape), which the auction room's
 *   rightsOn() then surfaces when bidding on that player stops. Hidden
 *   from every public surface until the player has an auction outcome or
 *   the auction is over (§16.6) — it's strategy, and the record exists to
 *   settle disputes, not to tip the room.
 *
 * Nothing is ever filed for an automatic topper (§16.2, reaffirmed
 * by rule): the right derives from the ledger and works in the room.
 * Cuts stay in the transaction form with commissioner review.
 *
 * Eligibility derives from the clear, not the live roster — a declaration
 * names a player the clear removed. Framework-free so verify-declarations
 * can drive the whole path.
 */
import { prisma } from "@/lib/prisma";
import { currentSeason } from "@/lib/constants";
import { COUNTED_STATUSES, SEED_SEASON, deriveAssets } from "@/lib/ledger/derive";
import { applyStatusChange } from "@/lib/ledger/transition";
import { countsFor } from "@/lib/ledger/commitment";

/*
 * The manual's veteran holdover pricing, floor AND premium both by position
 * (Post-Auction section — a flat premium was once applied to every
 * caught a flat +$25 being applied to a WR):
 *
 *   QB $60 / +$25 · RB $50 / +$25 · WR $40 / +$20 · TE $30 / +$20 · K $15 / +$10
 *
 * Distinct from the rookie HoldoverRate grid, which prices draft picks.
 */
export const HOLD_RATE: Record<string, number> = { QB: 60, RB: 50, WR: 40, TE: 30, K: 15 };
export const HOLD_PREMIUM: Record<string, number> = { QB: 25, RB: 25, WR: 20, TE: 20, K: 10 };

/** max(positional floor, last salary + positional premium). */
export const holdoverPrice = (position: string, salary: number) =>
  Math.max(HOLD_RATE[position] ?? 40, salary + (HOLD_PREMIUM[position] ?? 20));

export type Recorder = { id: number; teamId: number | null; isCommissioner: boolean };

export type EligiblePlayer = {
  playerId: number;
  name: string;
  position: string;
  /** What he was paid last season — the price input. */
  salary: number;
  /** "EXPIRING" = the team's own free right; "COMP" = needs a T/H spent. */
  right: "EXPIRING" | "COMP";
  b2b: boolean;
  /** null when a hold is impossible (B2B). */
  holdPrice: number | null;
  declared: { transactionId: number; kind: "HOLD" | "TOP"; price: number | null } | null;
};

export type TeamEligibility = {
  teamId: number;
  teamName: string;
  expiring: EligiblePlayer[];
  compTargets: EligiblePlayer[];
  /** Spendable T/H rights right now, ledger-derived (declarations already net). */
  thUnused: number;
  /** Cap picture for the block message and the form's arithmetic. */
  allocation: number;
  committed: number;
};

/**
 * Post-clear rights trades: a cleared player's PLAYER entry moving between
 * two teams in an approved trade filed after the clear carries his expiring
 * auto-topper/holdover rights with it — the league's "bring him inside the
 * reach of the right" tradition, executed on the ledger once rosters are
 * empty. Latest move wins, so a chain of resales resolves to its
 * end. Returns playerId → current rights-owning team.
 */
export async function postClearRightsMoves(season = currentSeason()): Promise<Map<number, number>> {
  const clears = await prisma.transaction.findMany({
    where: {
      type: "AUCTION_CLEAR",
      status: { in: ["APPROVED", "COMPLETED"] },
      note: { startsWith: `${season} pre-auction clear` },
    },
    select: { createdAt: true, entries: { where: { assetType: "PLAYER" }, select: { playerId: true } } },
  });
  if (clears.length === 0) return new Map();
  const clearedIds = clears.flatMap((c) => c.entries.map((e) => e.playerId!).filter(Boolean));
  const clearTime = clears.reduce((min, c) => (c.createdAt < min ? c.createdAt : min), clears[0].createdAt);
  const moves = await prisma.ledgerEntry.findMany({
    where: {
      assetType: "PLAYER",
      playerId: { in: clearedIds },
      fromTeamId: { not: null },
      toTeamId: { not: null },
      transaction: { type: "TRADE", status: { in: ["APPROVED", "COMPLETED"] }, createdAt: { gte: clearTime } },
    },
    orderBy: { id: "asc" },
    select: { playerId: true, toTeamId: true },
  });
  const map = new Map<number, number>();
  for (const m of moves) map.set(m.playerId!, m.toTeamId!);
  return map;
}

/**
 * Every player a team may declare on, derived from its APPROVED clear.
 * Empty until the clear runs — the form says so rather than guessing from
 * the live roster.
 */
export async function declarationEligibility(season = currentSeason()): Promise<Map<number, TeamEligibility>> {
  const teams = await prisma.team.findMany({ select: { id: true, name: true } });

  const clears = await prisma.transaction.findMany({
    where: {
      type: "AUCTION_CLEAR",
      status: { in: ["APPROVED", "COMPLETED"] },
      note: { startsWith: `${season} pre-auction clear` },
    },
    select: {
      submittedForTeamId: true,
      entries: { where: { assetType: "PLAYER" }, select: { playerId: true } },
    },
  });

  const clearedIds = clears.flatMap((c) => c.entries.map((e) => e.playerId!).filter(Boolean));
  // The cleared spot carries what the entry can't: contract shape and the B2B flag.
  const spots = await prisma.rosterSpot.findMany({
    where: { playerId: { in: clearedIds }, cutAt: { not: null } },
    orderBy: { id: "asc" }, // later rows win the map below
    select: {
      teamId: true, playerId: true, salary: true, contractEndSeason: true, isBackToBack: true,
      player: { select: { name: true, position: true } },
    },
  });
  const spotBy = new Map(spots.map((s) => [`${s.teamId}:${s.playerId}`, s]));

  // Rights follow post-clear trades: who may declare on a player is the
  // rights owner, not necessarily the team he was cleared from.
  const moves = await postClearRightsMoves(season);
  const clearedFrom = new Map<number, number>();
  for (const c of clears)
    for (const e of c.entries) if (e.playerId != null) clearedFrom.set(e.playerId, c.submittedForTeamId!);
  const rightsOwner = (playerId: number) => moves.get(playerId) ?? clearedFrom.get(playerId)!;

  const declarations = await declarationsList(season);
  const declaredBy = new Map(
    declarations
      .filter((d) => d.status !== "WITHDRAWN" && d.status !== "REJECTED")
      .map((d) => [d.playerId, d])
  );

  // Money and rights, one derivation for all sixteen teams.
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
  const derived = deriveAssets(entries as never, season, teams.map((t) => t.id));
  const activeSpots = await prisma.rosterSpot.findMany({
    where: { cutAt: null },
    select: { teamId: true, salary: true, contractEndSeason: true, acquiredForSeason: true },
  });

  const out = new Map<number, TeamEligibility>();
  for (const t of teams) {
    const expiring: EligiblePlayer[] = [];
    const compTargets: EligiblePlayer[] = [];
    const minePids = [...clearedFrom.keys()].filter((pid) => rightsOwner(pid) === t.id);
    for (const pid of minePids) {
      const e = { playerId: pid };
      const s = spotBy.get(`${clearedFrom.get(pid)}:${pid}`);
      if (!s) continue;
      const isExpiring = s.contractEndSeason === season - 1;
      const d = declaredBy.get(e.playerId);
      const row: EligiblePlayer = {
        playerId: e.playerId,
        name: s.player.name,
        position: s.player.position,
        salary: s.salary,
        right: isExpiring ? "EXPIRING" : "COMP",
        b2b: s.isBackToBack,
        holdPrice: s.isBackToBack ? null : holdoverPrice(s.player.position, s.salary),
        declared:
          d && d.teamId === t.id
            ? { transactionId: d.transactionId, kind: d.kind, price: d.price }
            : null,
      };
      (isExpiring ? expiring : compTargets).push(row);
    }
    expiring.sort((a, z) => z.salary - a.salary);
    compTargets.sort((a, z) => z.salary - a.salary);
    out.set(t.id, {
      teamId: t.id,
      teamName: t.name,
      expiring,
      compTargets,
      thUnused: derived.get(t.id)!.topperHoldovers,
      allocation: derived.get(t.id)!.capDollars,
      committed: activeSpots
        .filter((s) => s.teamId === t.id && countsFor(s, season))
        .reduce((n, s) => n + s.salary, 0),
    });
  }
  return out;
}

export type DeclarationRow = {
  transactionId: number;
  teamId: number;
  teamName: string;
  playerId: number;
  playerName: string;
  position: string;
  kind: "HOLD" | "TOP";
  price: number | null;
  status: string;
  filedAt: Date;
  /** TOPs only: has the secrecy lifted for the public? */
  revealed: boolean;
};

const noteFor = (season: number, teamName: string, kind: "HOLD" | "TOP", playerName: string, price?: number) =>
  kind === "HOLD"
    ? `${season} auction declaration — ${teamName} holds over ${playerName} at $${price}`
    : `${season} auction declaration — ${teamName} tops ${playerName}`;

/** Won players — the per-player half of the §16.6 reveal predicate. */
async function wonPlayerIds(): Promise<Set<number>> {
  const wins = await prisma.ledgerEntry.findMany({
    where: {
      assetType: "PLAYER",
      playerId: { not: null },
      transaction: { type: "AUCTION_WIN", status: { in: ["APPROVED", "COMPLETED"] } },
    },
    select: { playerId: true },
  });
  return new Set(wins.map((w) => w.playerId!));
}

/**
 * The auction-over half of the reveal predicate. No completion marker
 * exists, so "over" = 24 hours past the auction milestone — safely after a
 * one-day event, and nothing to remember to flip.
 */
export async function auctionOver(season = currentSeason(), now = new Date()): Promise<boolean> {
  const m = await prisma.leagueMilestone.findUnique({
    where: { seasonYear_key: { seasonYear: season, key: "AUCTION" } },
    select: { occursAt: true },
  });
  if (!m) return false;
  return now.getTime() > m.occursAt.getTime() + 24 * 60 * 60 * 1000;
}

/** Every declaration this season, with kind and reveal state resolved. */
export async function declarationsList(season = currentSeason()): Promise<DeclarationRow[]> {
  const [txs, won, over] = await Promise.all([
    prisma.transaction.findMany({
      where: { type: "AUCTION_DECLARATION", note: { startsWith: `${season} auction declaration` } },
      orderBy: { id: "asc" },
      select: {
        id: true, status: true, submittedForTeamId: true, createdAt: true,
        entries: {
          select: {
            assetType: true, playerId: true, fromTeamId: true, toTeamId: true, details: true,
            player: { select: { name: true, position: true } },
          },
        },
      },
    }),
    wonPlayerIds(),
    auctionOver(season),
  ]);
  const teams = await prisma.team.findMany({ select: { id: true, name: true } });
  const teamName = new Map(teams.map((t) => [t.id, t.name]));

  const rows: DeclarationRow[] = [];
  for (const tx of txs) {
    const playerEntry = tx.entries.find((e) => e.assetType === "PLAYER" && e.playerId != null);
    const named = tx.entries.find(
      (e) => e.assetType === "TOPPER_HOLDOVER" && e.playerId != null && e.toTeamId != null
    );
    const anchor = playerEntry ?? named;
    if (!anchor?.playerId || !anchor.player) continue;
    const kind: "HOLD" | "TOP" = playerEntry ? "HOLD" : "TOP";
    rows.push({
      transactionId: tx.id,
      teamId: tx.submittedForTeamId!,
      teamName: teamName.get(tx.submittedForTeamId!) ?? "?",
      playerId: anchor.playerId,
      playerName: anchor.player.name,
      position: anchor.player.position,
      kind,
      price: kind === "HOLD" ? ((playerEntry!.details as { salary?: number } | null)?.salary ?? null) : null,
      status: tx.status,
      filedAt: tx.createdAt,
      revealed: kind === "HOLD" || over || won.has(anchor.playerId),
    });
  }
  return rows;
}

export type FileResult =
  | { ok: true; transactionId: number; price: number | null }
  | { ok: false; error: string };

/**
 * File one declaration and approve it in the same breath — a declaration is
 * a right being exercised, not a proposal, so there is nothing to review.
 * Holdovers move money and rosters instantly through the ordinary lifecycle.
 */
export async function fileDeclaration(
  recorder: Recorder,
  teamId: number,
  playerId: number,
  kind: "HOLD" | "TOP",
  season = currentSeason()
): Promise<FileResult> {
  if (!recorder.isCommissioner && recorder.teamId !== teamId)
    return { ok: false, error: "You can declare only for your own team." };

  const eligibility = await declarationEligibility(season);
  const team = eligibility.get(teamId);
  if (!team) return { ok: false, error: "Unknown team." };
  if (team.expiring.length === 0 && team.compTargets.length === 0)
    return { ok: false, error: "Nothing to declare — this team's clear hasn't run." };

  const row = [...team.expiring, ...team.compTargets].find((p) => p.playerId === playerId);
  if (!row) return { ok: false, error: "That player isn't in this team's clear." };
  if (row.declared) return { ok: false, error: `Already declared (#${row.declared.transactionId}) — withdraw it first.` };

  // Someone else's declaration or an auction outcome may have taken him.
  const taken = await prisma.rosterSpot.findFirst({
    where: { playerId, cutAt: null },
    select: { teamId: true },
  });
  if (taken) return { ok: false, error: "He's already back on a roster." };

  const spendsRight = row.right === "COMP";
  if (row.right === "EXPIRING" && kind === "TOP")
    return { ok: false, error: "The automatic topper needs no declaration — it works in the room." };
  if (spendsRight && team.thUnused < 1)
    return { ok: false, error: `${team.teamName} has no unused T/H right to spend.` };

  let price: number | null = null;
  if (kind === "HOLD") {
    if (row.holdPrice == null)
      return { ok: false, error: "B2B — he can be topped in the room, never held again." };
    price = row.holdPrice;
    if (team.committed + price > team.allocation)
      return {
        ok: false,
        error: `Holding at $${price} would put ${team.teamName} at $${team.committed + price} of a $${team.allocation} allocation.`,
      };
  }

  const entries = [];
  if (kind === "HOLD") {
    entries.push({
      assetType: "PLAYER" as const,
      seasonYear: season,
      amount: price!,
      playerId,
      fromTeamId: null,
      toTeamId: teamId,
      label: `Held over at $${price}`,
      details: {
        salary: price!,
        source: spendsRight ? "COMP_HOLDOVER" : "EXPIRING_HOLDOVER",
        notes: `Held over for ${season}`,
      },
    });
  } else {
    entries.push({
      assetType: "TOPPER_HOLDOVER" as const,
      seasonYear: season,
      amount: 1,
      playerId,
      fromTeamId: null,
      toTeamId: teamId,
      label: `Topper on ${row.name} — auction declaration`,
      details: { source: "DECLARATION_TOPPER" },
    });
  }
  if (spendsRight) {
    entries.push({
      assetType: "TOPPER_HOLDOVER" as const,
      seasonYear: season,
      amount: 1,
      playerId: null,
      fromTeamId: teamId,
      toTeamId: null,
      label: `T/H spent on ${row.name}`,
    });
  }

  const tx = await prisma.transaction.create({
    data: {
      type: "AUCTION_DECLARATION",
      status: "SUBMITTED",
      note: noteFor(season, team.teamName, kind, row.name, price ?? undefined),
      submittedByOwnerId: recorder.id,
      submittedForTeamId: teamId,
      entries: { create: entries },
      statusLogs: { create: { newStatus: "SUBMITTED", changedByOwnerId: recorder.id } },
    },
    select: { id: true },
  });
  const res = await applyStatusChange(tx.id, "APPROVED", recorder.id);
  if ("error" in res && res.error) return { ok: false, error: res.error };

  return { ok: true, transactionId: tx.id, price };
}

/**
 * Withdraw before the auction starts: APPROVED → SUBMITTED un-applies the
 * roster spot, WITHDRAWN closes it. The two-step is the ordinary lifecycle,
 * not a special path.
 */
export async function withdrawDeclaration(
  recorder: Recorder,
  transactionId: number,
  now = new Date()
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: { type: true, status: true, submittedForTeamId: true, note: true },
  });
  if (!tx || tx.type !== "AUCTION_DECLARATION") return { ok: false, error: "Not a declaration." };
  if (!recorder.isCommissioner && recorder.teamId !== tx.submittedForTeamId)
    return { ok: false, error: "Not your team's declaration." };
  if (tx.status !== "APPROVED" && tx.status !== "SUBMITTED")
    return { ok: false, error: `Can't withdraw a ${tx.status.toLowerCase()} declaration.` };

  const season = Number(tx.note?.slice(0, 4)) || currentSeason();
  const m = await prisma.leagueMilestone.findUnique({
    where: { seasonYear_key: { seasonYear: season, key: "AUCTION" } },
    select: { occursAt: true },
  });
  if (!recorder.isCommissioner && m && now >= m.occursAt)
    return { ok: false, error: "The auction has started — ask a commissioner." };

  if (tx.status === "APPROVED") {
    const back = await applyStatusChange(transactionId, "SUBMITTED", recorder.id, "withdrawn before the auction");
    if ("error" in back && back.error) return { ok: false, error: back.error };
  }
  const done = await applyStatusChange(transactionId, "WITHDRAWN", recorder.id);
  if ("error" in done && done.error) return { ok: false, error: done.error };
  return { ok: true };
}

/**
 * Player ids whose comp-top declarations are still secret — the set every
 * public surface must subtract from named-topper displays and feeds.
 */
export async function hiddenTopPlayerIds(season = currentSeason()): Promise<Set<number>> {
  const rows = await declarationsList(season);
  return new Set(
    rows
      .filter((r) => r.kind === "TOP" && !r.revealed && (r.status === "APPROVED" || r.status === "COMPLETED"))
      .map((r) => r.playerId)
  );
}

/**
 * Declaration transaction ids a viewer must not see — unrevealed comp tops
 * belonging to somebody else. Commissioners see everything; a team always
 * sees its own. Withdrawn tops stay hidden too: a retracted secret is still
 * a secret until the auction is over.
 */
export async function hiddenDeclarationTxIds(
  viewer: { teamId: number | null; isCommissioner: boolean } | null,
  season = currentSeason()
): Promise<number[]> {
  if (viewer?.isCommissioner) return [];
  const rows = await declarationsList(season);
  return rows
    .filter((r) => r.kind === "TOP" && !r.revealed && r.teamId !== viewer?.teamId)
    .map((r) => r.transactionId);
}
