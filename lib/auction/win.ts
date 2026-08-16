/*
 * Recording an auction win.
 *
 * A win is not a proposal. The room watched the bidding stop; the commissioner
 * is recording what already happened, so it enters the ledger approved and the
 * roster moves at once — through `movePlayers`, the same path as every other
 * approved transaction. v1 wrote wins to a table the ledger never saw, which
 * is why all 185 of 2025's had to be backfilled a year later.
 *
 * No cap debit, deliberately. The roster spot *is* the commitment — the same
 * ruling as rookie holdovers (PLAN §16.3): `committedFor` counts every active
 * spot whose salary belongs to the season, so a win moves "To Spend @Auction"
 * without a second bookkeeping entry that could drift from the first.
 *
 * And no cap *block*, also deliberately, which for once departs from the
 * trades rule. A trade is a proposal that can be refused; a win is a fact.
 * Refusing to record it wouldn't un-happen it — it would just make the site
 * wrong about the room. Overspending carries real league penalties, and the
 * red "To Spend" figure is how the room finds out; the record's job is to be
 * the evidence.
 *
 * Toppers: when bidding stops on a player somebody holds a right on, the
 * holder may take him for one dollar more than the final bid. A *named* topper
 * (from the rookie draft, or an auction declaration) is a scarce asset and is
 * consumed in the same transaction; the *automatic* topper on a player coming
 * off an expiring contract consumes nothing — every team simply has it on
 * players they lost to expiry. v1 handled all of this on paper, at the one
 * moment in the year when memory is busiest.
 *
 * Framework-free, with the caller's identity already established, so the whole
 * path can be exercised outside a browser session.
 */
import { prisma } from "@/lib/prisma";
import { currentSeason } from "@/lib/constants";
import { COUNTED_STATUSES, SEED_SEASON, deriveAssets } from "@/lib/ledger/derive";
import { applyStatusChange, movePlayers } from "@/lib/ledger/transition";

/** Who is recording — resolved by the action wrapper. */
export type Recorder = { id: number; teamId: number | null; isCommissioner: boolean };

export type WinResult =
  | { ok: true; transactionId: number }
  | { ok: false; error: string };

/** A right somebody holds on a player entering the pool. */
export type PlayerRight = {
  kind: "NAMED" | "AUTOMATIC";
  teamId: number;
  teamName: string;
  /** What the warning should say the right came from. */
  origin: string;
};

/**
 * Every right held on one player, for the entry bar's warning chip.
 *
 * Named toppers come from derivation — they were bought, traded, or earned,
 * and the ledger knows who holds them now. Automatic toppers come from the
 * player's last stint: a contract that ended last season (back-to-back
 * included) leaves the old team a free +$1 right, no asset involved.
 */
export async function rightsOn(playerId: number, seasonYear = currentSeason()): Promise<PlayerRight[]> {
  const teams = await prisma.team.findMany({ select: { id: true, name: true } });
  const names = new Map(teams.map((t) => [t.id, t.name]));

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
  const derived = deriveAssets(entries, seasonYear, teams.map((t) => t.id));

  const rights: PlayerRight[] = [];
  for (const [teamId, assets] of derived) {
    for (const t of assets.namedToppers) {
      if (t.playerId === playerId) {
        rights.push({
          kind: "NAMED",
          teamId,
          teamName: names.get(teamId) ?? `Team #${teamId}`,
          origin: t.label ?? "a named topper",
        });
      }
    }
  }

  /*
   * The automatic right. Only a *contract* that ran out grants it — an
   * uncontracted stint (last year's auction win) expires with nothing, which
   * is the whole reason the compensatory T/H rights are worth trading for.
   */
  const lastStint = await prisma.rosterSpot.findFirst({
    where: { playerId, contractEndSeason: seasonYear - 1 },
    orderBy: { id: "desc" },
    select: { teamId: true, isBackToBack: true },
  });
  if (lastStint) {
    // The right may have been traded after the clear (§16.9) — it belongs to
    // wherever the ledger last moved it.
    const { postClearRightsMoves } = await import("@/lib/auction/declare");
    const holder = (await postClearRightsMoves(seasonYear)).get(playerId) ?? lastStint.teamId;
    if (!rights.some((r) => r.teamId === holder)) {
      rights.push({
        kind: "AUTOMATIC",
        teamId: holder,
        teamName: names.get(holder) ?? `Team #${holder}`,
        origin:
          (lastStint.isBackToBack
            ? "coming off back-to-back contracts"
            : "coming off an expiring contract") +
          (holder !== lastStint.teamId ? " (rights acquired by trade)" : ""),
      });
    }
  }

  return rights;
}

export async function recordWin({
  playerId,
  teamId,
  bid,
  owner,
  seasonYear,
  note,
  topped,
}: {
  playerId: number;
  /** The team the hammer fell to — or, when topped, the team being topped. */
  teamId: number;
  bid: number;
  owner: Recorder;
  seasonYear?: number;
  note?: string;
  /**
   * The one-click top: the holder takes the player for bid + 1 instead of
   * `teamId`. A named right is consumed in the same transaction.
   */
  topped?: { byTeamId: number };
}): Promise<WinResult> {
  const season = seasonYear ?? currentSeason();

  if (!owner.isCommissioner) return { ok: false, error: "Only a commissioner can record wins." };
  if (!Number.isInteger(bid) || bid < 1) return { ok: false, error: "A bid is a whole dollar, at least $1." };

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { id: true, name: true, position: true, active: true },
  });
  if (!player) return { ok: false, error: "That player isn't in the league database." };
  if (!player.active) return { ok: false, error: `${player.name} is marked inactive.` };

  const onRoster = await prisma.rosterSpot.findFirst({
    where: { playerId, cutAt: null },
    select: { team: { select: { name: true } } },
  });
  if (onRoster)
    return { ok: false, error: `${player.name} is already on ${onRoster.team.name}'s roster.` };

  const winnerId = topped ? topped.byTeamId : teamId;
  const winner = await prisma.team.findUnique({ where: { id: winnerId }, select: { id: true, name: true } });
  if (!winner) return { ok: false, error: "Unknown team." };

  /*
   * A topped win must rest on a real right, checked at the moment of filing
   * rather than trusted from the button that was rendered a minute ago — the
   * right may have been spent on someone else since.
   */
  let consumesNamedRight = false;
  let salary = bid;
  if (topped) {
    const rights = await rightsOn(playerId, season);
    const held = rights.find((r) => r.teamId === topped.byTeamId);
    if (!held)
      return { ok: false, error: `${winner.name} holds no topper on ${player.name}.` };
    consumesNamedRight = held.kind === "NAMED";
    salary = bid + 1;
  }

  const summary = topped
    ? `${winner.name} top the $${bid} bid on ${player.name} — his for $${salary}`
    : `${winner.name} win ${player.name} at auction for $${salary}`;

  try {
    const transactionId = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          type: "AUCTION_WIN",
          status: "APPROVED",
          submittedByOwnerId: owner.id,
          submittedForTeamId: winner.id,
          note: note?.trim() ? `${summary}\n\n${note.trim()}` : summary,
          entries: {
            create: [
              {
                seasonYear: season,
                assetType: "PLAYER" as const,
                fromTeamId: null,
                toTeamId: winner.id,
                playerId: player.id,
                // amount carries the price too — the feed, the board and the
                // audit all read it, and its silent @default(1) put a $1 on
                // every win recorded until this line existed.
                amount: salary,
                label: topped ? `Topped for $${salary}` : `Won for $${salary}`,
                // No contract — an auction win signs the player for the year,
                // and a multi-year deal is a separate decision at cut-down.
                // Same shape as a rookie holdover, on purpose.
                details: { salary, source: "AUCTION", notes: `Auction ${season}` },
              },
              ...(consumesNamedRight
                ? [
                    {
                      seasonYear: season,
                      assetType: "TOPPER_HOLDOVER" as const,
                      fromTeamId: winner.id,
                      toTeamId: null,
                      playerId: player.id,
                      label: `Topper on ${player.name} exercised`,
                    },
                  ]
                : []),
            ],
          },
        },
      });

      /*
       * The race: two entries for the same player, keyed in by a hurrying
       * commissioner on two devices. movePlayers refuses nothing — it reports
       * — so re-check inside the transaction where the unique read is safe.
       */
      const nowRostered = await tx.rosterSpot.findFirst({ where: { playerId, cutAt: null } });
      if (nowRostered) throw new Error("ALREADY_WON");

      await movePlayers(tx, transaction.id, "apply");

      await tx.transactionStatusLog.create({
        data: {
          transactionId: transaction.id,
          oldStatus: null,
          newStatus: "APPROVED",
          changedByOwnerId: owner.id,
          comment: "Recorded live from the auction",
        },
      });

      return transaction.id;
    });

    // The hammer closes the nomination; live views move on with it.
    await prisma.nomination.updateMany({
      where: { seasonYear: seasonYear ?? currentSeason(), playerId, closedAt: null },
      data: { closedAt: new Date() },
    });

    return { ok: true, transactionId };
  } catch (e) {
    if ((e as Error).message === "ALREADY_WON")
      return { ok: false, error: `${player.name} was just entered by someone else.` };
    throw e;
  }
}

/**
 * Take a win back — a mis-keyed player, bid, or team.
 *
 * Two status moves because that is what the lifecycle allows: APPROVED →
 * SUBMITTED un-applies the roster (and un-consumes any topper — the entries
 * simply stop counting), then SUBMITTED → WITHDRAWN marks it dead. The
 * history keeps both steps, because a correction is a thing that happened.
 */
export async function revertWin(transactionId: number, owner: Recorder): Promise<WinResult> {
  if (!owner.isCommissioner) return { ok: false, error: "Only a commissioner can undo a win." };

  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: { id: true, type: true, status: true },
  });
  if (!tx || tx.type !== "AUCTION_WIN") return { ok: false, error: "That isn't an auction win." };
  if (tx.status !== "APPROVED")
    return { ok: false, error: `This win is ${tx.status.toLowerCase()}, not something to undo.` };

  const back = await applyStatusChange(transactionId, "SUBMITTED", owner.id, "Undone at the auction table");
  if ("error" in back && back.error) return { ok: false, error: back.error };
  const dead = await applyStatusChange(transactionId, "WITHDRAWN", owner.id, "Undone at the auction table");
  if ("error" in dead && dead.error) return { ok: false, error: dead.error };

  return { ok: true, transactionId };
}
