"use server";

import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireCommissioner } from "@/lib/auth";

/*
 * Player portraits.
 *
 * Stored in our own Blob store under a name derived from the player, so the
 * URL is legible and re-uploading replaces rather than accumulates. v1's names
 * carried a uuid and a timestamp, which meant every correction left the old
 * image behind forever.
 */

const slug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export async function uploadHeadshot(
  playerId: number,
  file: File
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requireCommissioner();

  if (!file || file.size === 0) return { ok: false, error: "No file." };
  if (file.size > 4 * 1024 * 1024) return { ok: false, error: "That image is over 4MB — shrink it and try again." };
  if (!file.type.startsWith("image/")) return { ok: false, error: "That isn't an image." };

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { id: true, name: true },
  });
  if (!player) return { ok: false, error: "No such player." };

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const blob = await put(`players/${slug(player.name)}.${ext}`, file, {
    access: "public",
    contentType: file.type,
    allowOverwrite: true,
  });

  await prisma.player.update({ where: { id: player.id }, data: { headshotUrl: blob.url } });

  revalidatePath("/admin/headshots");
  revalidatePath("/rosters");
  return { ok: true, url: blob.url };
}

/** Copy last year's images out of the old store before that project is retired. */
export async function importLegacyHeadshots(): Promise<
  { ok: true; copied: number; failed: number } | { ok: false; error: string }
> {
  await requireCommissioner();
  const OLD_HOST = "p3ivmayjayqzqaam.public.blob.vercel-storage.com";

  const stale = await prisma.player.findMany({
    where: { headshotUrl: { contains: OLD_HOST } },
    select: { id: true, name: true, headshotUrl: true },
  });

  let copied = 0, failed = 0;
  for (const p of stale) {
    try {
      const res = await fetch(p.headshotUrl!);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await put(`players/${slug(p.name)}.png`, await res.blob(), {
        access: "public",
        contentType: "image/png",
        allowOverwrite: true,
      });
      await prisma.player.update({ where: { id: p.id }, data: { headshotUrl: blob.url } });
      copied++;
    } catch {
      failed++;
    }
  }

  revalidatePath("/admin/headshots");
  return { ok: true, copied, failed };
}
