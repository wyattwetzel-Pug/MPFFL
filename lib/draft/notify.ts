import "server-only";
import { prisma } from "@/lib/prisma";
import { currentSeason } from "@/lib/constants";
import { sendToLeague, sendToOwner } from "@/lib/sms/send";
import { ordinal } from "@/lib/sms/templates";
import { getBoard, slotLabel } from "@/lib/draft/board";

/*
 * Telling people it's their turn.
 *
 * There is no scheduler. Windows open when someone loads the board, and the
 * texts go out on the same code path — a cron that fires at 3am is a thing that
 * fails silently on the one night it matters, and nobody would know until a
 * team's twelve hours had already run out.
 *
 * The cost of that choice is that any page load can send. `openNotifiedAt` and
 * `reminderSentAt` are what make it safe: they're written in the same query
 * that claims the right to send, so two simultaneous loads can't both text.
 *
 * Deliberately kept out of `recordPick`. The verification suite drives real
 * picks against the real ledger, and it must never text sixteen people to do
 * it — so announcements are the action wrapper's job, not the rules module's.
 */

/** How long before a window closes we nudge. */
const REMINDER_LEAD_MS = 2 * 3600_000;

/** "2 hours", "45 minutes" — the unit travels with the number. */
function timeLeft(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60_000));
  if (mins < 90) return `${mins} minute${mins === 1 ? "" : "s"}`;
  const hours = Math.round(mins / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

/** Everyone who can act for a team. Both owners get told; either can pick. */
async function ownersOf(teamId: number): Promise<number[]> {
  const rows = await prisma.teamOwner.findMany({
    where: { teamId },
    select: { ownerId: true },
  });
  return rows.map((r) => r.ownerId);
}

/**
 * Send what's due: on-the-clock texts for windows that just opened, and a
 * reminder to anyone inside the last two hours of theirs.
 *
 * Safe to call on every page load. Returns what it sent, for the commissioner
 * page and for tests.
 */
export async function notifyDraft(seasonYear = currentSeason()) {
  const config = await prisma.draftConfig.findUnique({ where: { seasonYear } });
  if (!config?.startedAt || config.completedAt) return { onTheClock: 0, reminders: 0 };

  const { slots } = await getBoard(seasonYear);
  const open = slots.filter((s) => s.state === "open");
  if (open.length === 0) return { onTheClock: 0, reminders: 0 };

  const rows = await prisma.draftPick.findMany({
    where: { seasonYear, slot: { in: open.map((s) => s.slot) } },
    select: { slot: true, openNotifiedAt: true, reminderSentAt: true },
  });
  const state = new Map(rows.map((r) => [r.slot, r]));
  const hours = Math.round(config.pickWindow / 60);

  let onTheClock = 0;
  let reminders = 0;

  for (const slot of open) {
    const row = state.get(slot.slot);
    if (!row) continue;

    /*
     * Claim the send before making it. `updateMany` with the null guard is a
     * single atomic statement — the loser of a race updates zero rows and
     * stays quiet, where a read-then-write would have both callers texting.
     */
    if (!row.openNotifiedAt) {
      const claimed = await prisma.draftPick.updateMany({
        where: { seasonYear, slot: slot.slot, openNotifiedAt: null },
        data: { openNotifiedAt: new Date() },
      });
      if (claimed.count > 0) {
        for (const ownerId of await ownersOf(slot.teamId)) {
          await sendToOwner({
            ownerId,
            template: "DRAFT_PICK_NOTIFICATION",
            vars: {
              pickNumber: slot.label,
              leagueYear: seasonYear,
              teamName: slot.teamName,
              hours,
              slot: slot.slot,
            },
            triggerData: { seasonYear, slot: slot.slot },
          });
        }
        onTheClock++;
      }
    }

    const closesIn = slot.expiresAt ? slot.expiresAt.getTime() - Date.now() : Infinity;
    if (!row.reminderSentAt && closesIn > 0 && closesIn <= REMINDER_LEAD_MS) {
      const claimed = await prisma.draftPick.updateMany({
        where: { seasonYear, slot: slot.slot, reminderSentAt: null },
        data: { reminderSentAt: new Date() },
      });
      if (claimed.count > 0) {
        for (const ownerId of await ownersOf(slot.teamId)) {
          await sendToOwner({
            ownerId,
            template: "DRAFT_PICK_REMINDER",
            vars: {
              pickNumber: slot.label,
              teamName: slot.teamName,
              timeLeft: timeLeft(closesIn),
              slot: slot.slot,
            },
            triggerData: { seasonYear, slot: slot.slot },
          });
        }
        reminders++;
      }
    }
  }

  return { onTheClock, reminders };
}

/**
 * Tell the league a pick was made, and who's up.
 *
 * Called after the pick is already in the ledger. A text that fails must never
 * take the pick down with it — the record is the thing that matters, and the
 * announcement is a courtesy on top of it.
 */
export async function announcePick(seasonYear: number, slot: number, byOwnerId?: number) {
  const { slots } = await getBoard(seasonYear);
  const made = slots.find((s) => s.slot === slot);
  if (!made?.pick) return;

  // Whoever is up now. Several windows can be open at once, so this is the
  // earliest unfilled slot rather than simply slot + 1.
  const next = slots.find((s) => s.state === "open");
  const config = await prisma.draftConfig.findUnique({ where: { seasonYear } });

  try {
    await sendToLeague({
      template: "ROOKIE_PICK_ANNOUNCEMENT",
      vars: {
        pickNumber: slot,
        slot,
        ordinalSuffix: ordinal(slot),
        leagueYear: seasonYear,
        selectingTeam: made.teamName,
        playerName: made.pick.playerName,
        position: made.pick.position,
        nflTeam: made.pick.nflTeam,
        nextTeam: next ? `${next.teamName} (${slotLabel(next.slot)})` : "Nobody",
        hours: Math.round((config?.pickWindow ?? 720) / 60),
      },
      exceptOwnerId: byOwnerId,
      triggerData: { seasonYear, slot },
    });
  } catch {
    // Logged by sendToOwner per recipient; never fail the pick over a text.
  }
}
