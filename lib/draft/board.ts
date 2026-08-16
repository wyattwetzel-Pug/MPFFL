import { prisma } from "@/lib/prisma";
import { currentSeason } from "@/lib/constants";
import { COUNTED_STATUSES, SEED_SEASON, deriveAssets } from "@/lib/ledger/derive";

/*
 * The draft board.
 *
 * Deliberately *not* marked `server-only`: the whole start → open → pick path
 * has to be drivable from a verification script, and `server-only` makes the
 * most consequential code reachable only through a browser session. Same
 * reasoning as lib/ledger/transition.ts.
 *
 * Order and ownership are derived, never stored: who holds slot 1.05 comes
 * from the ledger, so a trade — including one made while that window is open —
 * moves the board with nothing to reconcile. v1 stored the holder on each pick
 * row and had to keep the two in step.
 *
 * `DraftPick` rows exist only for slots whose window has opened, and record
 * only what derivation can't know: when it opened, who picked, and what they
 * chose.
 */

export type Slot = {
  slot: number;
  round: number;
  label: string;
  teamId: number;
  teamName: string;
  teamSlug: string;
  originTeamId: number | null;
  originTeamName: string | null;
  state: "waiting" | "open" | "filled";
  openedAt: Date | null;
  /** Null while open — the clock runs but nothing forces it shut. */
  expiresAt: Date | null;
  overdue: boolean;
  pick: {
    playerName: string;
    position: string;
    nflTeam: string;
    headshotUrl: string | null;
    selection: "HOLDOVER" | "TOP";
    holdoverAmount: number | null;
    pickedAt: Date;
    pickedBy: string | null;
    onBehalf: boolean;
  } | null;
};

export const slotLabel = (slot: number) =>
  slot <= 16 ? `1.${String(slot).padStart(2, "0")}` : `2.${String(slot - 16).padStart(2, "0")}`;

/**
 * Open any window whose turn has come.
 *
 * Done on read rather than on a schedule: a cron that fires at 3am is a thing
 * that fails silently on the one night it matters, and whoever loads the board
 * next would see a stalled draft with no explanation.
 *
 * Returns the slots newly opened, so the caller can notify.
 */
export async function advanceWindows(seasonYear = currentSeason()): Promise<number[]> {
  const config = await prisma.draftConfig.findUnique({ where: { seasonYear } });
  if (!config?.startedAt || config.completedAt) return [];

  const picks = await prisma.draftPick.findMany({
    where: { seasonYear },
    orderBy: { slot: "asc" },
    select: { slot: true, openedAt: true, pickedAt: true },
  });

  const windowMs = config.pickWindow * 60_000;
  const opened = new Map(picks.map((p) => [p.slot, p]));
  const newlyOpened: number[] = [];
  const now = Date.now();

  // Walk forward: a slot opens once its predecessor is filled or has run out
  // of clock. Several can be open at once, which is what keeps the draft
  // moving when someone is unreachable.
  for (let slot = 1; slot <= 32; slot++) {
    if (opened.has(slot)) continue;
    const prev = slot === 1 ? null : opened.get(slot - 1);
    const due =
      slot === 1
        ? config.startedAt.getTime() <= now
        : !!prev && (prev.pickedAt != null || prev.openedAt.getTime() + windowMs <= now);
    if (!due) break;

    await prisma.draftPick.create({ data: { seasonYear, slot } });
    opened.set(slot, { slot, openedAt: new Date(), pickedAt: null });
    newlyOpened.push(slot);
  }

  /*
   * A draft ends by running out of slots, not by someone remembering to close
   * it. Marking it here means the last pick finishes the draft, and nothing
   * else opens or texts afterwards.
   */
  const filled = await prisma.draftPick.count({
    where: { seasonYear, pickedAt: { not: null } },
  });
  if (filled >= 32) {
    await prisma.draftConfig.update({
      where: { seasonYear },
      data: { completedAt: new Date() },
    });
  }

  return newlyOpened;
}

export async function getBoard(seasonYear = currentSeason()) {
  const [config, teams, picks] = await Promise.all([
    prisma.draftConfig.findUnique({ where: { seasonYear } }),
    prisma.team.findMany({ select: { id: true, name: true, slug: true } }),
    prisma.draftPick.findMany({
      where: { seasonYear },
      include: {
        player: { select: { name: true, position: true, nflTeam: true, headshotUrl: true } },
        pickedBy: { select: { name: true } },
      },
    }),
  ]);

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

  const names = new Map(teams.map((t) => [t.id, t]));

  /*
   * Derive the order from holdings *before* picks were spent.
   *
   * Exercising a pick moves it out of the team, which is exactly right for
   * every other purpose — it stops showing in their assets and the trade form
   * stops offering it. But the board is a record of the draft, and a slot that
   * vanishes the moment it's used erases the pick it just recorded. So the
   * board ignores the spend and keeps every slot with the team that held it.
   *
   * Safe because a spent slot can never move again: only the outcome trades.
   */
  const forOrder = entries.filter(
    (e) => !(e.assetType === "ROOKIE_PICK" && e.pickNumber != null && e.toTeamId == null)
  );
  const derived = deriveAssets(forOrder, seasonYear, teams.map((t) => t.id));
  const byPick = new Map(picks.map((p) => [p.slot, p]));
  const windowMs = (config?.pickWindow ?? 720) * 60_000;

  const slots: Slot[] = [];
  for (const [teamId, assets] of derived) {
    for (const p of assets.rookiePicks) {
      if (p.pickNumber == null) continue;
      const team = names.get(teamId)!;
      const row = byPick.get(p.pickNumber);
      const origin =
        p.originTeamId && p.originTeamId !== teamId ? names.get(p.originTeamId)?.name ?? null : null;

      slots.push({
        slot: p.pickNumber,
        round: p.round,
        label: slotLabel(p.pickNumber),
        teamId,
        teamName: team.name,
        teamSlug: team.slug,
        originTeamId: p.originTeamId,
        originTeamName: origin,
        state: !row ? "waiting" : row.pickedAt ? "filled" : "open",
        openedAt: row?.openedAt ?? null,
        expiresAt: row && !row.pickedAt ? new Date(row.openedAt.getTime() + windowMs) : null,
        overdue: !!row && !row.pickedAt && row.openedAt.getTime() + windowMs < Date.now(),
        pick:
          row?.pickedAt && row.player
            ? {
                playerName: row.player.name,
                position: row.player.position,
                nflTeam: row.player.nflTeam,
                headshotUrl: row.player.headshotUrl,
                selection: row.selection as "HOLDOVER" | "TOP",
                holdoverAmount: row.holdoverAmount,
                pickedAt: row.pickedAt,
                pickedBy: row.pickedBy?.name ?? null,
                onBehalf: row.onBehalf,
              }
            : null,
      });
    }
  }

  slots.sort((a, b) => a.slot - b.slot);
  return { config, slots, taken: new Set(picks.filter((p) => p.playerId).map((p) => p.playerId!)) };
}
