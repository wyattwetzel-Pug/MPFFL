"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCommissioner } from "@/lib/auth";
import { POSITIONS } from "@/lib/constants";
import {
  buildIndex,
  classifyRow,
  parsePlayerCsv,
  planImport,
  type CsvRow,
  type CsvPreview,
} from "@/lib/player-import";
import type { Position } from "@prisma/client";

/*
 * No type exports live in this file.
 *
 * A `"use server"` module may only export async functions. A type export from
 * one is not always erased: the server-actions loader re-exports every name it
 * sees, so `export type { CsvRow }` compiled to a runtime reference to a type
 * that doesn't exist at runtime. The module then failed to evaluate — taking
 * *every* action in it down, not just the CSV one. Adding a player returned a
 * server error for that reason, as would every edit and delete on the page.
 *
 * Shared types belong in lib/player-import.ts.
 */

const playerSchema = z.object({
  name: z.string().trim().min(1),
  position: z.enum(POSITIONS),
  nflTeam: z.string().trim().min(1).toUpperCase(),
  rookieYear: z.coerce
    .number()
    .int()
    .min(1980)
    .max(2100)
    .nullable()
    .or(z.literal("").transform(() => null)),
  active: z.coerce.boolean(),
});

function revalidatePlayers() {
  revalidatePath("/admin/players");
}

export async function createPlayer(formData: FormData) {
  await requireCommissioner();
  const parsed = playerSchema.parse({
    name: formData.get("name"),
    position: formData.get("position"),
    nflTeam: formData.get("nflTeam"),
    rookieYear: formData.get("rookieYear") || "",
    active: formData.get("active") === "on",
  });

  const dupe = await prisma.player.findFirst({
    where: {
      name: { equals: parsed.name, mode: "insensitive" },
      position: parsed.position,
    },
  });
  if (dupe) return { error: `${parsed.name} (${parsed.position}) already exists.` };

  await prisma.player.create({ data: parsed });
  revalidatePlayers();
  return { success: true };
}

export async function updatePlayer(playerId: number, formData: FormData) {
  await requireCommissioner();
  const parsed = playerSchema.parse({
    name: formData.get("name"),
    position: formData.get("position"),
    nflTeam: formData.get("nflTeam"),
    rookieYear: formData.get("rookieYear") || "",
    active: formData.get("active") === "on",
  });

  const dupe = await prisma.player.findFirst({
    where: {
      name: { equals: parsed.name, mode: "insensitive" },
      position: parsed.position,
      id: { not: playerId },
    },
  });
  if (dupe)
    return { error: `Another ${parsed.name} (${parsed.position}) already exists.` };

  await prisma.player.update({ where: { id: playerId }, data: parsed });
  revalidatePlayers();
  return { success: true };
}

export async function deletePlayer(playerId: number) {
  await requireCommissioner();
  const spots = await prisma.rosterSpot.count({ where: { playerId } });
  if (spots > 0) {
    return {
      error:
        "This player has roster history and can't be deleted. Mark them Inactive instead.",
    };
  }
  await prisma.player.delete({ where: { id: playerId } });
  revalidatePlayers();
  return { success: true };
}

// ---------- CSV upsert ----------
// Matching rules live in lib/player-import.ts so this and the CLI script
// (scripts/import-players.ts) can never disagree. Nothing is written until
// commitPlayerCsv runs.

export async function previewPlayerCsv(formData: FormData): Promise<CsvPreview> {
  await requireCommissioner();

  const empty: CsvPreview = {
    updates: [],
    positionChanges: [],
    adds: [],
    unchanged: 0,
    notInCsv: 0,
    errors: [],
    rows: [],
    rookieYear: null,
  };

  const file = formData.get("file") as File | null;
  if (!file) return { ...empty, errors: ["No file uploaded"] };

  const rookieYearRaw = formData.get("rookieYear");
  const rookieYear = rookieYearRaw ? Number(rookieYearRaw) : null;
  if (rookieYearRaw && !Number.isInteger(rookieYear)) {
    return { ...empty, errors: ["Rookie year must be a whole number"] };
  }

  const { rows, errors } = parsePlayerCsv(await file.text());
  if (rows.length === 0) return { ...empty, errors };

  const existing = await prisma.player.findMany({
    select: { id: true, name: true, position: true, nflTeam: true, active: true },
  });

  return { ...planImport(rows, existing), errors, rows, rookieYear };
}

export async function commitPlayerCsv(rowsJson: string, rookieYearRaw?: string) {
  await requireCommissioner();
  const rows: CsvRow[] = JSON.parse(rowsJson);
  const rookieYear = rookieYearRaw ? Number(rookieYearRaw) : null;

  const existing = await prisma.player.findMany({
    select: { id: true, name: true, position: true, nflTeam: true, active: true },
  });
  const idx = buildIndex(rows, existing);

  let updated = 0;
  let added = 0;
  let repositioned = 0;

  for (const row of rows) {
    const result = classifyRow(row, idx);

    if (result.kind === "update") {
      const data: { nflTeam?: string; active?: boolean } = {};
      if (result.player.nflTeam !== row.nflTeam) data.nflTeam = row.nflTeam;
      if (row.active !== null && result.player.active !== row.active)
        data.active = row.active;
      if (Object.keys(data).length > 0) {
        await prisma.player.update({ where: { id: result.player.id }, data });
        updated++;
      }
      continue;
    }

    if (result.kind === "positionChange") {
      await prisma.player.update({
        where: { id: result.player.id },
        data: {
          position: row.position as Position,
          nflTeam: row.nflTeam,
          ...(row.active !== null ? { active: row.active } : {}),
        },
      });
      repositioned++;
      continue;
    }

    await prisma.player.create({
      data: {
        name: row.name,
        position: row.position as Position,
        nflTeam: row.nflTeam,
        active: row.active ?? true,
        ...(rookieYear ? { rookieYear } : {}),
      },
    });
    added++;
  }

  revalidatePlayers();
  return { success: true, updated, added, repositioned };
}
