"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCommissioner } from "@/lib/auth";
import { currentSeason } from "@/lib/constants";
import { MILESTONES } from "@/lib/calendar";
import { zonedToInstant } from "@/lib/tz";
import type { MilestoneKey } from "@prisma/client";

/** Set or clear one milestone. Clearing returns it to its fallback. */
export async function setMilestone(
  key: MilestoneKey,
  value: string | null,
  note: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const owner = await requireCommissioner();
  const season = currentSeason();

  const spec = MILESTONES.find((m) => m.key === key);
  if (!spec) return { ok: false, error: "Unknown milestone." };
  // March 1st is a rule, not a choice.
  if (spec.derived) return { ok: false, error: `${spec.label} is fixed by rule.` };

  if (!value) {
    await prisma.leagueMilestone.deleteMany({ where: { seasonYear: season, key } });
    revalidatePath("/admin/calendar");
    return { ok: true };
  }

  /*
   * The form hands back a wall-clock string with no zone. `new Date(value)`
   * read it in the *server's* zone, which is UTC on Vercel — so "23:59" was
   * stored as 23:59Z and meant 3:59pm here. The commissioner means league time.
   */
  const occursAt = zonedToInstant(value);
  if (!occursAt) return { ok: false, error: "That isn't a date." };

  await prisma.leagueMilestone.upsert({
    where: { seasonYear_key: { seasonYear: season, key } },
    create: { seasonYear: season, key, occursAt, note: note.trim() || null, setByOwnerId: owner.id },
    update: { occursAt, note: note.trim() || null, setByOwnerId: owner.id, setAt: new Date() },
  });

  revalidatePath("/admin/calendar");
  return { ok: true };
}
