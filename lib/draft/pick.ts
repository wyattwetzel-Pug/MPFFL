/*
 * Recording a rookie pick.
 *
 * A pick is not a proposal. The moment it's made it's real — the league treats
 * it as binding the second the text goes out — so it enters the ledger already
 * approved rather than queuing for a commissioner who may be asleep. Everything
 * else about it is ordinary: a transaction, its entries, and the roster move
 * driven by the same code every other transaction uses.
 *
 * The two outcomes both write to the ledger, which is the one thing v1 didn't
 * do. It recorded "top at auction" and then never used it, so who held a topper
 * lived in the group's memory until someone was wrong about it out loud.
 *
 * Framework-free, with the caller's identity already established, so the whole
 * path can be exercised outside a browser session.
 */
import { prisma } from "@/lib/prisma";
import { currentSeason } from "@/lib/constants";
import { advanceWindows, getBoard, slotLabel } from "@/lib/draft/board";
import { movePlayers } from "@/lib/ledger/transition";

/** 1st, 2nd, 3rd… */
function ordinalSuffix(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

/** Who is making the pick — resolved by the action wrapper. */
export type Picker = { id: number; teamId: number | null; isCommissioner: boolean };

type Result =
  | { ok: true; transactionId: number; teamSlug: string }
  | { ok: false; error: string };

export async function recordPick({
  slot,
  playerId,
  selection,
  owner,
  seasonYear,
}: {
  slot: number;
  playerId: number;
  selection: "HOLDOVER" | "TOP";
  owner: Picker;
  seasonYear?: number;
}): Promise<Result> {
  const season = seasonYear ?? currentSeason();

  // Someone may have been sitting on this page for hours. Re-open any windows
  // that have come due before deciding whether this one is theirs to use.
  await advanceWindows(season);
  const { slots } = await getBoard(season);

  const target = slots.find((s) => s.slot === slot);
  if (!target) return { ok: false, error: `Pick ${slotLabel(slot)} isn't on this year's board.` };
  if (target.state === "waiting")
    return { ok: false, error: `Pick ${target.label} hasn't opened yet.` };
  if (target.state === "filled")
    return { ok: false, error: `Pick ${target.label} has already been made.` };

  /*
   * Ownership is derived, so a pick traded ten minutes ago belongs to its new
   * team here without anything having been reconciled.
   */
  const onBehalf = target.teamId !== owner.teamId;
  if (onBehalf && !owner.isCommissioner)
    return { ok: false, error: `Pick ${target.label} belongs to ${target.teamName}.` };

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { id: true, name: true, position: true, active: true, rookieYear: true },
  });
  if (!player) return { ok: false, error: "That player isn't in the league database." };
  if (!player.active) return { ok: false, error: `${player.name} is marked inactive.` };
  if (player.rookieYear == null || player.rookieYear < season)
    return { ok: false, error: `${player.name} isn't a ${season} rookie.` };

  const taken = await prisma.draftPick.findFirst({
    where: { seasonYear: season, playerId },
    select: { slot: true },
  });
  if (taken) return { ok: false, error: `${player.name} went at ${slotLabel(taken.slot)}.` };

  const onRoster = await prisma.rosterSpot.findFirst({
    where: { playerId, cutAt: null },
    select: { team: { select: { name: true } } },
  });
  if (onRoster)
    return { ok: false, error: `${player.name} is already on ${onRoster.team.name}'s roster.` };

  /*
   * The price of holding a rookie is a grid: pick number × position. A missing
   * cell stops the draft, so say exactly which cell is missing.
   */
  let holdoverAmount: number | null = null;
  if (selection === "HOLDOVER") {
    const rate = await prisma.holdoverRate.findUnique({
      where: { pickNumber_position: { pickNumber: slot, position: player.position } },
    });
    if (!rate)
      return {
        ok: false,
        error: `No holdover rate is set for pick ${target.label} at ${player.position}. A commissioner needs to add one first.`,
      };
    holdoverAmount = rate.amount;
  }

  const summary =
    selection === "HOLDOVER"
      ? `${target.teamName} hold ${player.name} over for $${holdoverAmount} with pick ${target.label}`
      : `${target.teamName} take a topper on ${player.name} with pick ${target.label}`;

  try {
    const transactionId = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          type: "ROOKIE_PICK_SELECTION",
          status: "APPROVED",
          submittedByOwnerId: owner.id,
          submittedForTeamId: target.teamId,
          note: summary,
          entries: {
            create: [
              /*
               * The pick is spent: it leaves the team and goes nowhere, which
               * is what makes it stop showing up in their holdings and stop
               * being offered by the trade form. Derivation needs no notion of
               * "spent" — it's the same mechanism as any asset leaving.
               */
              {
                seasonYear: season,
                assetType: "ROOKIE_PICK",
                fromTeamId: target.teamId,
                toTeamId: null,
                round: target.round,
                pickNumber: slot,
                originTeamId: target.originTeamId,
                label: `Pick ${target.label} exercised`,
              },
              selection === "HOLDOVER"
                ? {
                    seasonYear: season,
                    assetType: "PLAYER" as const,
                    fromTeamId: null,
                    toTeamId: target.teamId,
                    playerId: player.id,
                    label: `Held over for $${holdoverAmount}`,
                    // No contract. The manual is explicit: holding over signs
                    // them for the year, and the owner may or may not put them
                    // on a 3-year deal afterwards. That's a separate decision.
                    details: {
                      salary: holdoverAmount,
                      source: "ROOKIE_HOLDOVER",
                      pickNumber: slot,
                      // Overall pick number, not the round.slot label — the
                      // roster's notes column is prose, and "14th rookie pick"
                      // reads where "1.14" would need explaining.
                      notes: `${slot}${ordinalSuffix(slot)} rookie pick in ${season}`,
                    },
                  }
                : {
                    seasonYear: season,
                    assetType: "TOPPER_HOLDOVER" as const,
                    fromTeamId: null,
                    toTeamId: target.teamId,
                    playerId: player.id,
                    label: `Topper on ${player.name} from pick ${target.label}`,
                    details: { source: "ROOKIE_TOPPER", pickNumber: slot },
                  },
            ],
          },
        },
      });

      /*
       * Claim the slot only if it's still unclaimed. Windows overlap by design,
       * so two people really can be submitting at the same moment — the
       * database decides, not whoever read the board most recently.
       */
      const claimed = await tx.draftPick.updateMany({
        where: { seasonYear: season, slot, pickedAt: null },
        data: {
          playerId,
          selection,
          holdoverAmount,
          pickedAt: new Date(),
          pickedByOwnerId: owner.id,
          onBehalf,
          transactionId: transaction.id,
        },
      });
      if (claimed.count === 0) throw new Error("SLOT_TAKEN");

      // Rosters move through the same path as every other approved
      // transaction, rather than through a second copy of that logic here.
      await movePlayers(tx, transaction.id, "apply");

      await tx.transactionStatusLog.create({
        data: {
          transactionId: transaction.id,
          oldStatus: null,
          newStatus: "APPROVED",
          changedByOwnerId: owner.id,
          comment: onBehalf ? `Recorded from the slow draft on behalf of ${target.teamName}` : "Recorded from the slow draft",
        },
      });

      return transaction.id;
    });

    return { ok: true, transactionId, teamSlug: target.teamSlug };
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "SLOT_TAKEN")
      return { ok: false, error: `Pick ${target.label} was made while you were deciding.` };
    // The unique index on (season, player) is what actually settles a tie.
    if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002")
      return { ok: false, error: `${player.name} was taken while you were deciding.` };
    throw err;
  }
}
