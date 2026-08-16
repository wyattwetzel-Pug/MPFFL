"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { currentSeason } from "@/lib/constants";
import { advanceWindows } from "@/lib/draft/board";
import { recordPick } from "@/lib/draft/pick";
import { announcePick, notifyDraft } from "@/lib/draft/notify";

/*
 * Auth and cache invalidation. The rules live in lib/draft/pick.ts, where a
 * script can reach them.
 */

type Result = { ok: true } | { ok: false; error: string };

export async function makeDraftPick({
  slot,
  playerId,
  selection,
}: {
  slot: number;
  playerId: number;
  selection: "HOLDOVER" | "TOP";
}): Promise<Result> {
  const owner = await requireOwner();
  const result = await recordPick({ slot, playerId, selection, owner });
  if (!result.ok) return result;

  /*
   * Texts happen here, not in recordPick: the verification suite drives real
   * picks against the real ledger and must never text sixteen people to do it.
   *
   * Open the next window *before* announcing. The announcement names who's up,
   * and computing that first told the league "Nobody is now on the clock".
   */
  await advanceWindows(currentSeason());
  await announcePick(currentSeason(), slot, owner.id);
  await notifyDraft(currentSeason());

  revalidatePath("/draft");
  revalidatePath("/rosters");
  revalidatePath("/transactions");
  revalidatePath(`/teams/${result.teamSlug}`);
  return { ok: true };
}

/**
 * Start the draft, opening the first window.
 *
 * Separate from setting the date so that "it's scheduled" and "it's running"
 * stay distinct facts — the league has moved this date before.
 */
export async function startDraft(seasonYear = currentSeason()): Promise<Result> {
  const owner = await requireOwner();
  if (!owner.isCommissioner) return { ok: false, error: "Commissioners only." };

  const config = await prisma.draftConfig.findUnique({ where: { seasonYear } });
  if (config?.startedAt) return { ok: false, error: "The draft is already running." };

  const now = new Date();
  await prisma.draftConfig.upsert({
    where: { seasonYear },
    create: { seasonYear, startsAt: now, startedAt: now },
    update: { startedAt: now, completedAt: null },
  });
  await advanceWindows(seasonYear);
  await notifyDraft(seasonYear);

  revalidatePath("/draft");
  return { ok: true };
}

/** Minutes each team gets once their window opens. */
export async function setPickWindow(
  minutes: number,
  seasonYear = currentSeason()
): Promise<Result> {
  const owner = await requireOwner();
  if (!owner.isCommissioner) return { ok: false, error: "Commissioners only." };
  if (!Number.isInteger(minutes) || minutes < 15)
    return { ok: false, error: "A window has to be at least 15 minutes." };

  await prisma.draftConfig.upsert({
    where: { seasonYear },
    create: { seasonYear, pickWindow: minutes },
    update: { pickWindow: minutes },
  });

  revalidatePath("/draft");
  return { ok: true };
}

/**
 * Text the on-the-clock message again for one slot.
 *
 * For the owner who swears they never got it. Rate limits still apply, and the
 * resend is logged like any other message.
 */
export async function resendOnTheClock(
  slot: number,
  seasonYear = currentSeason()
): Promise<Result> {
  const owner = await requireOwner();
  if (!owner.isCommissioner) return { ok: false, error: "Commissioners only." };

  const row = await prisma.draftPick.findUnique({
    where: { seasonYear_slot: { seasonYear, slot } },
    select: { pickedAt: true },
  });
  if (!row) return { ok: false, error: "That window hasn't opened." };
  if (row.pickedAt) return { ok: false, error: "That pick has already been made." };

  // Clearing the flag is what lets notifyDraft send it again — the same path,
  // rather than a second one that could drift from it.
  await prisma.draftPick.update({
    where: { seasonYear_slot: { seasonYear, slot } },
    data: { openNotifiedAt: null },
  });
  const sent = await notifyDraft(seasonYear);

  revalidatePath("/admin/draft");
  return sent.onTheClock > 0 ? { ok: true } : { ok: false, error: "Nothing was sent — check the text-message page for why." };
}
