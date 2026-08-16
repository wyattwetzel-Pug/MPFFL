"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCommissioner } from "@/lib/auth";
import { renderDocToHtml } from "@/lib/manual/render";

/*
 * Every write appends a new version — nothing is ever edited or deleted, so
 * the manual's history is a complete record of the league's rules over time.
 */
async function appendVersion(input: {
  doc: unknown;
  title: string;
  summary: string | null;
  authorId: number;
}) {
  const html = renderDocToHtml(input.doc);

  return prisma.$transaction(async (tx) => {
    const latest = await tx.manualVersion.findFirst({
      orderBy: { version: "desc" },
      select: { version: true },
    });
    return tx.manualVersion.create({
      data: {
        version: (latest?.version ?? 0) + 1,
        title: input.title,
        doc: input.doc as never,
        html,
        summary: input.summary,
        authorId: input.authorId,
      },
    });
  });
}

function revalidateManual() {
  revalidatePath("/manual");
  revalidatePath("/manual/versions");
}

const saveSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z
    .string()
    .trim()
    .max(300)
    .transform((s) => (s === "" ? null : s)),
  doc: z.string().min(2),
});

export async function saveManual(formData: FormData) {
  const owner = await requireCommissioner();

  const parsed = saveSchema.safeParse({
    title: formData.get("title"),
    summary: formData.get("summary") ?? "",
    doc: formData.get("doc"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid submission" };
  }

  let doc: unknown;
  try {
    doc = JSON.parse(parsed.data.doc);
  } catch {
    return { error: "The editor content couldn't be read. Try again." };
  }

  const version = await appendVersion({
    doc,
    title: parsed.data.title,
    summary: parsed.data.summary,
    authorId: owner.id,
  });

  revalidateManual();
  return { success: true, version: version.version };
}

/**
 * Restoring copies an old version forward as a new one rather than rolling
 * back, so the fact that a restore happened is itself part of the history.
 */
export async function restoreManualVersion(version: number) {
  const owner = await requireCommissioner();

  const source = await prisma.manualVersion.findUnique({ where: { version } });
  if (!source) return { error: `Version ${version} not found.` };

  const latest = await prisma.manualVersion.findFirst({
    orderBy: { version: "desc" },
    select: { version: true },
  });
  if (latest?.version === version) {
    return { error: `Version ${version} is already the live manual.` };
  }

  await appendVersion({
    doc: source.doc,
    title: source.title,
    summary: `Restored from version ${version}`,
    authorId: owner.id,
  });

  revalidateManual();
  redirect("/manual");
}
