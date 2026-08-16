"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCommissioner } from "@/lib/auth";
import { chainVerdict } from "@/lib/contract-chain";
import { psTransition } from "@/lib/practice-squad";
import { currentSeason } from "@/lib/constants";

const spotSchema = z.object({
  playerId: z.coerce.number().int().positive(),
  salary: z.coerce.number().int().min(0),
  contractEndSeason: z.coerce
    .number()
    .int()
    .min(2000)
    .max(2100)
    .nullable()
    .or(z.literal("").transform(() => null)),
  designation: z.enum(["ACTIVE", "IR", "PS"]),
  isBackToBack: z.coerce.boolean(),
  notes: z
    .string()
    .trim()
    .transform((s) => (s === "" ? null : s)),
});

/** The player's most recent PS year on record, for the two-in-a-row rule. */
async function lastPsSeasonOf(playerId: number, excludeSpotId?: number) {
  const row = await prisma.rosterSpot.findFirst({
    where: { playerId, psSeason: { not: null }, ...(excludeSpotId ? { id: { not: excludeSpotId } } : {}) },
    orderBy: { psSeason: "desc" },
    select: { psSeason: true },
  });
  return row?.psSeason ?? null;
}

function revalidateRosters(teamId: number) {
  revalidatePath("/rosters");
  revalidatePath(`/admin/rosters/${teamId}`);
}

export async function addRosterSpot(teamId: number, formData: FormData) {
  await requireCommissioner();
  const parsed = spotSchema.parse({
    playerId: formData.get("playerId"),
    salary: formData.get("salary"),
    contractEndSeason: formData.get("contractEndSeason") || "",
    designation: formData.get("designation") ?? "ACTIVE",
    isBackToBack: formData.get("isBackToBack") === "on",
    notes: formData.get("notes") ?? "",
  });

  const existing = await prisma.rosterSpot.findFirst({
    where: { playerId: parsed.playerId, cutAt: null },
    include: { team: { select: { name: true } }, player: { select: { name: true } } },
  });
  if (existing) {
    return {
      error: `${existing.player.name} is already on ${existing.team.name}'s roster.`,
    };
  }

  let warning: string | undefined;
  const psSeason = parsed.designation === "PS" ? currentSeason() : null;
  if (psSeason != null) {
    const last = await lastPsSeasonOf(parsed.playerId);
    if (last === psSeason - 1) {
      warning = `This player was on the practice squad last year too — two years running isn't a thing the manual allows.`;
    }
  }

  await prisma.rosterSpot.create({ data: { teamId, ...parsed, psSeason } });
  revalidateRosters(teamId);
  return warning ? { success: true, warning } : { success: true };
}

export async function updateRosterSpot(spotId: number, formData: FormData) {
  await requireCommissioner();
  const parsed = spotSchema.omit({ playerId: true }).parse({
    salary: formData.get("salary"),
    contractEndSeason: formData.get("contractEndSeason") || "",
    designation: formData.get("designation") ?? "ACTIVE",
    isBackToBack: formData.get("isBackToBack") === "on",
    notes: formData.get("notes") ?? "",
  });

  // Same rules as the patch path. The full form sends every field, so the PS
  // delta only applies when the typed contract year matches the stored one —
  // a hand-adjusted year is the commissioner's number, not ours to move.
  let warning: string | undefined;
  const before = await prisma.rosterSpot.findUnique({
    where: { id: spotId },
    select: {
      contractEndSeason: true, designation: true, psSeason: true, playerId: true,
      player: { select: { name: true } },
    },
  });

  const data: typeof parsed & { psSeason?: number | null } = { ...parsed };
  if (before && before.designation !== parsed.designation) {
    const effect = psTransition(
      before,
      parsed.designation,
      currentSeason(),
      await lastPsSeasonOf(before.playerId, spotId),
      before.player.name
    );
    data.psSeason = effect.psSeason;
    if (
      effect.contractDelta !== 0 &&
      before.contractEndSeason != null &&
      parsed.contractEndSeason === before.contractEndSeason
    ) {
      data.contractEndSeason = before.contractEndSeason + effect.contractDelta;
    }
    warning = effect.warning ?? effect.note;
  }

  if (!data.isBackToBack && data.contractEndSeason != null && before?.contractEndSeason == null) {
    const verdict = await chainVerdict(spotId);
    data.isBackToBack = verdict.backToBack;
    if (verdict.backToBack) warning = verdict.reason;
  }

  const spot = await prisma.rosterSpot.update({
    where: { id: spotId },
    data,
  });
  revalidateRosters(spot.teamId);
  return warning ? { success: true, warning } : { success: true };
}

/**
 * Update a single field on a roster spot. The commissioner edits dozens of
 * values in a sitting, so the table saves each cell as it's changed rather
 * than making every row a separate edit-then-save round trip.
 */
const patchSchema = z
  .object({
    salary: z.coerce.number().int().min(0).max(10000),
    contractEndSeason: z.coerce.number().int().min(2000).max(2100).nullable(),
    designation: z.enum(["ACTIVE", "IR", "PS"]),
    isBackToBack: z.boolean(),
    notes: z.string().trim().max(500).nullable(),
  })
  .partial();

export async function patchRosterSpot(spotId: number, patch: unknown) {
  await requireCommissioner();

  const parsed = patchSchema.safeParse(patch);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "That value isn't valid" };
  }
  if (Object.keys(parsed.data).length === 0) return { success: true };

  /*
   * The back-to-back flag rides along with the contract itself (PLAN §19).
   * A contract landing on an uncontracted spot is the signing — the one
   * moment "second consecutive" becomes true — so the flag is computed and
   * written in the same patch. A contract being cleared takes the flag with
   * it. An explicit isBackToBack in the patch is the commissioner's override
   * and always wins; the checkbox stays the correction tool for v1-era rows.
   */
  const data: typeof parsed.data & { psSeason?: number | null } = { ...parsed.data };
  let warning: string | undefined;

  /*
   * A designation change through PS moves the contract with it (PLAN §19.6):
   * on = the stashed year stretches the deal, off = the year comes back only
   * if the PS season hasn't completed. The pure table in lib/practice-squad
   * decides; this just applies the delta and passes the explanation up.
   */
  if ("designation" in data && data.designation != null) {
    const before = await prisma.rosterSpot.findUnique({
      where: { id: spotId },
      select: {
        designation: true, contractEndSeason: true, psSeason: true, playerId: true,
        player: { select: { name: true } },
      },
    });
    if (before && before.designation !== data.designation) {
      const effect = psTransition(
        before,
        data.designation,
        currentSeason(),
        await lastPsSeasonOf(before.playerId, spotId),
        before.player.name
      );
      data.psSeason = effect.psSeason;
      if (effect.contractDelta !== 0 && before.contractEndSeason != null && !("contractEndSeason" in data)) {
        data.contractEndSeason = before.contractEndSeason + effect.contractDelta;
      }
      warning = effect.warning ?? effect.note;
    }
  }

  if (!("isBackToBack" in data) && "contractEndSeason" in data && !("designation" in data)) {
    const before = await prisma.rosterSpot.findUnique({
      where: { id: spotId },
      select: { contractEndSeason: true },
    });
    if (before?.contractEndSeason == null && data.contractEndSeason != null) {
      const verdict = await chainVerdict(spotId);
      data.isBackToBack = verdict.backToBack;
      if (verdict.backToBack) warning = verdict.reason;
    } else if (before?.contractEndSeason != null && data.contractEndSeason == null) {
      data.isBackToBack = false;
    }
  }

  const spot = await prisma.rosterSpot.update({
    where: { id: spotId },
    data,
  });
  revalidateRosters(spot.teamId);
  return warning ? { success: true, warning } : { success: true };
}

// Cut = end the spot (row is kept forever); date defaults to now.
export async function cutRosterSpot(spotId: number, cutDate?: string) {
  await requireCommissioner();
  const cutAt = cutDate ? new Date(`${cutDate}T12:00:00`) : new Date();
  const spot = await prisma.rosterSpot.update({
    where: { id: spotId },
    data: { cutAt },
  });
  revalidateRosters(spot.teamId);
  return { success: true };
}

export async function uncutRosterSpot(spotId: number) {
  await requireCommissioner();
  const spot = await prisma.rosterSpot.update({
    where: { id: spotId },
    data: { cutAt: null },
  });
  revalidateRosters(spot.teamId);
  return { success: true };
}

// Hard delete — for data-entry mistakes only; cuts are the normal path.
export async function deleteRosterSpot(spotId: number) {
  await requireCommissioner();
  const spot = await prisma.rosterSpot.delete({ where: { id: spotId } });
  revalidateRosters(spot.teamId);
  return { success: true };
}
