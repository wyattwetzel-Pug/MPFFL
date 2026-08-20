"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCommissioner } from "@/lib/auth";

/*
 * The legacy standings table predates the ledger, so editing it is a
 * correction to a display record, not a transaction — it saves on blur like
 * every other setting, not through a submit button.
 */

const STRING_FIELDS = ["label", "winPct", "pointsScored", "pointsAgainst", "playoffRecord"] as const;
const REQUIRED_INT_FIELDS = ["wins", "losses"] as const;
const OPTIONAL_INT_FIELDS = [
  "highestScorerSeasons",
  "playoffAppearances",
  "oneSeedAppearances",
  "titleAppearances",
  "titleWins",
  "bpotya",
  "coty",
] as const;

export type LegacyStringField = (typeof STRING_FIELDS)[number];
export type LegacyRequiredIntField = (typeof REQUIRED_INT_FIELDS)[number];
export type LegacyOptionalIntField = (typeof OPTIONAL_INT_FIELDS)[number];

type ActionResult = { ok: true } | { ok: false; error: string };

export async function setLegacyStringField(
  id: number,
  field: LegacyStringField,
  value: string
): Promise<ActionResult> {
  await requireCommissioner();
  if (!STRING_FIELDS.includes(field)) return { ok: false, error: "Unknown field." };

  const trimmed = value.trim();
  if (field === "label" && !trimmed) return { ok: false, error: "Team can't be blank." };

  await prisma.legacyStanding.update({
    where: { id },
    data: { [field]: field === "playoffRecord" && !trimmed ? null : trimmed },
  });

  revalidatePath("/legacy");
  return { ok: true };
}

export async function setLegacyRequiredIntField(
  id: number,
  field: LegacyRequiredIntField,
  value: number
): Promise<ActionResult> {
  await requireCommissioner();
  if (!REQUIRED_INT_FIELDS.includes(field)) return { ok: false, error: "Unknown field." };
  if (!Number.isInteger(value) || value < 0) return { ok: false, error: "Must be a whole number, 0 or more." };

  await prisma.legacyStanding.update({ where: { id }, data: { [field]: value } });

  revalidatePath("/legacy");
  return { ok: true };
}

export async function setLegacyOptionalIntField(
  id: number,
  field: LegacyOptionalIntField,
  value: number | null
): Promise<ActionResult> {
  await requireCommissioner();
  if (!OPTIONAL_INT_FIELDS.includes(field)) return { ok: false, error: "Unknown field." };
  if (value !== null && (!Number.isInteger(value) || value < 0)) {
    return { ok: false, error: "Must be a whole number, 0 or more." };
  }

  await prisma.legacyStanding.update({ where: { id }, data: { [field]: value } });

  revalidatePath("/legacy");
  return { ok: true };
}

export async function setLegacyTeam(id: number, teamId: number): Promise<ActionResult> {
  await requireCommissioner();

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) return { ok: false, error: "Team not found." };

  await prisma.legacyStanding.update({ where: { id }, data: { teamId } });

  revalidatePath("/legacy");
  return { ok: true };
}
