import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { extractToc, type TocEntry } from "@/lib/manual/document";

export type ManualView = {
  id: number;
  version: number;
  title: string;
  html: string;
  summary: string | null;
  createdAt: Date;
  authorName: string | null;
  toc: TocEntry[];
};

/** The live manual is simply the highest version — see the schema comment. */
export const getCurrentManual = cache(async (): Promise<ManualView | null> => {
  const v = await prisma.manualVersion.findFirst({
    orderBy: { version: "desc" },
    include: { author: { select: { name: true } } },
  });
  if (!v) return null;
  return {
    id: v.id,
    version: v.version,
    title: v.title,
    html: v.html,
    summary: v.summary,
    createdAt: v.createdAt,
    authorName: v.author?.name ?? null,
    toc: extractToc(v.doc),
  };
});

export const getManualVersion = cache(async (version: number): Promise<ManualView | null> => {
  const v = await prisma.manualVersion.findUnique({
    where: { version },
    include: { author: { select: { name: true } } },
  });
  if (!v) return null;
  return {
    id: v.id,
    version: v.version,
    title: v.title,
    html: v.html,
    summary: v.summary,
    createdAt: v.createdAt,
    authorName: v.author?.name ?? null,
    toc: extractToc(v.doc),
  };
});

export const listManualVersions = cache(async () => {
  const rows = await prisma.manualVersion.findMany({
    orderBy: { version: "desc" },
    select: {
      id: true,
      version: true,
      title: true,
      summary: true,
      createdAt: true,
      author: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    version: r.version,
    title: r.title,
    summary: r.summary,
    createdAt: r.createdAt,
    authorName: r.author?.name ?? null,
  }));
});

/**
 * Holdover rates, shaped for the manual's live table: pick number × position.
 *
 * Reads the same `HoldoverRate` grid the draft prices picks from and the
 * commissioner edits, so the prose can't quote one set of numbers while the
 * draft charges another.
 */
export const getHoldoverRates = cache(async () => {
  const rows = await prisma.holdoverRate.findMany({
    orderBy: [{ pickNumber: "asc" }, { position: "asc" }],
  });
  const positions = ["QB", "RB", "WR", "TE", "K"] as const;
  const byPick = new Map<number, Record<string, number>>();
  for (const r of rows) {
    const row = byPick.get(r.pickNumber) ?? {};
    row[r.position] = r.amount;
    byPick.set(r.pickNumber, row);
  }
  return {
    positions: positions.filter((p) => rows.some((r) => r.position === p)),
    rows: [...byPick.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([pickNumber, amounts]) => ({ pickNumber, amounts })),
  };
});
