"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionOwner, requireOwner, requireCommissioner } from "@/lib/auth";

/*
 * §22 rules voting.
 *
 * The lock is law: every vote write re-checks the slate's locksAt on the
 * server — the buttons disappearing client-side is a courtesy, not the gate.
 * Commissioners get no exemption on votes (the same principle as the ledger);
 * their special powers are proposals, the lock itself, and outcomes.
 *
 * Votes belong to TEAMS. Any co-owner may cast or change the team's vote;
 * castByOwnerId records whose hand moved it last, and the UI surfaces that
 * so disagreement gets settled over text messages, not edit wars.
 */

type Result = { ok: true } | { ok: false; error: string };

function revalidate(seasonYear: number) {
  revalidatePath(`/manual/rules/${seasonYear}`);
  revalidatePath("/admin/rules");
}

async function slateLocked(seasonYear: number): Promise<boolean> {
  const slate = await prisma.ruleSlate.findUnique({ where: { seasonYear } });
  return slate?.locksAt != null && slate.locksAt.getTime() <= Date.now();
}

// ---------- Owner actions ----------

export async function castRuleVote(
  proposalId: number,
  choice: "AYE" | "NAY" | "ABSTAIN"
): Promise<Result> {
  const owner = await requireOwner();
  if (owner.teamId == null) return { ok: false, error: "Your account isn't linked to a team." };
  const proposal = await prisma.ruleProposal.findUnique({
    where: { id: proposalId },
    select: { seasonYear: true },
  });
  if (!proposal) return { ok: false, error: "No such proposal." };
  if (await slateLocked(proposal.seasonYear))
    return { ok: false, error: "Voting is locked for this year." };

  await prisma.ruleVote.upsert({
    where: { proposalId_teamId: { proposalId, teamId: owner.teamId } },
    create: { proposalId, teamId: owner.teamId, choice, castByOwnerId: owner.id },
    update: { choice, castByOwnerId: owner.id },
  });
  revalidate(proposal.seasonYear);
  return { ok: true };
}

const commentSchema = z.object({
  body: z.string().trim().min(1, "Say something.").max(4000),
  parentId: z.number().int().positive().nullable(),
});

export async function addRuleComment(
  proposalId: number,
  body: string,
  parentId: number | null
): Promise<Result> {
  const owner = await requireOwner();
  if (owner.teamId == null) return { ok: false, error: "Your account isn't linked to a team." };
  const parsed = commentSchema.safeParse({ body, parentId });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Bad comment" };

  const proposal = await prisma.ruleProposal.findUnique({
    where: { id: proposalId },
    select: { seasonYear: true },
  });
  if (!proposal) return { ok: false, error: "No such proposal." };

  if (parsed.data.parentId != null) {
    const parent = await prisma.ruleComment.findUnique({
      where: { id: parsed.data.parentId },
      select: { proposalId: true, parentId: true },
    });
    if (!parent || parent.proposalId !== proposalId)
      return { ok: false, error: "That thread doesn't exist here." };
    // One visible level: a reply to a reply files under the top-level parent.
    if (parent.parentId != null) parsed.data.parentId = parent.parentId;
  }

  await prisma.ruleComment.create({
    data: {
      proposalId,
      parentId: parsed.data.parentId,
      teamId: owner.teamId,
      authorOwnerId: owner.id,
      body: parsed.data.body,
    },
  });
  revalidate(proposal.seasonYear);
  return { ok: true };
}

export async function deleteRuleComment(commentId: number): Promise<Result> {
  const owner = await requireOwner();
  const comment = await prisma.ruleComment.findUnique({
    where: { id: commentId },
    select: { authorOwnerId: true, proposal: { select: { seasonYear: true } } },
  });
  if (!comment) return { ok: true };
  if (comment.authorOwnerId !== owner.id && !owner.isCommissioner)
    return { ok: false, error: "Only the author (or a commissioner) can remove a comment." };
  // Soft: threads keep their shape; the record keeps its row.
  await prisma.ruleComment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });
  revalidate(comment.proposal.seasonYear);
  return { ok: true };
}

// ---------- Commissioner actions ----------

const proposalSchema = z.object({
  seasonYear: z.number().int().min(2000).max(2100),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
  proposedByTeamId: z.number().int().positive().nullable(),
  proposedByLabel: z.string().trim().min(1).max(100),
  displayOrder: z.number().int().min(0).max(999),
});

export async function saveRuleProposal(
  proposalId: number | null,
  input: unknown
): Promise<Result & { id?: number }> {
  await requireCommissioner();
  const parsed = proposalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Bad proposal" };
  const d = parsed.data;

  // The slate row exists as soon as its first proposal does.
  await prisma.ruleSlate.upsert({
    where: { seasonYear: d.seasonYear },
    create: { seasonYear: d.seasonYear },
    update: {},
  });

  if (proposalId == null) {
    const created = await prisma.ruleProposal.create({ data: d, select: { id: true } });
    revalidate(d.seasonYear);
    return { ok: true, id: created.id };
  }
  await prisma.ruleProposal.update({ where: { id: proposalId }, data: d });
  revalidate(d.seasonYear);
  return { ok: true, id: proposalId };
}

export async function deleteRuleProposal(proposalId: number): Promise<Result> {
  await requireCommissioner();
  const p = await prisma.ruleProposal.findUnique({
    where: { id: proposalId },
    select: { seasonYear: true, _count: { select: { votes: true, comments: true } } },
  });
  if (!p) return { ok: true };
  // Deleting a proposal cascades its votes and comments — refuse once real
  // votes exist; withdrawal is what the outcome field is for.
  if (p._count.votes > 0)
    return { ok: false, error: `${p._count.votes} team vote(s) exist — mark it WITHDRAWN instead of deleting history.` };
  await prisma.ruleProposal.delete({ where: { id: proposalId } });
  revalidate(p.seasonYear);
  return { ok: true };
}

export async function setRuleLock(seasonYear: number, locksAtIso: string | null): Promise<Result> {
  await requireCommissioner();
  const locksAt = locksAtIso ? new Date(locksAtIso) : null;
  if (locksAtIso && Number.isNaN(locksAt!.getTime()))
    return { ok: false, error: "That date didn't parse." };
  await prisma.ruleSlate.upsert({
    where: { seasonYear },
    create: { seasonYear, locksAt },
    update: { locksAt },
  });
  revalidate(seasonYear);
  return { ok: true };
}

/** Proposal icons — the v1 flavor, stored the same way headshots are. */
export async function uploadRuleIcon(proposalId: number, formData: FormData): Promise<Result> {
  await requireCommissioner();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "No file." };
  if (file.size > 1_000_000) return { ok: false, error: "Keep icons under 1MB." };
  const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
  if (!["png", "jpg", "jpeg", "webp", "svg", "gif"].includes(ext))
    return { ok: false, error: "png / jpg / webp / svg / gif only." };
  const p = await prisma.ruleProposal.findUnique({
    where: { id: proposalId },
    select: { seasonYear: true },
  });
  if (!p) return { ok: false, error: "No such proposal." };

  const { put } = await import("@vercel/blob");
  const blob = await put(`rules/${p.seasonYear}-${proposalId}.${ext}`, file, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  await prisma.ruleProposal.update({ where: { id: proposalId }, data: { iconUrl: blob.url } });
  revalidate(p.seasonYear);
  return { ok: true };
}

export async function setRuleOutcome(
  proposalId: number,
  outcome: "PASSED" | "FAILED" | "WITHDRAWN" | null
): Promise<Result> {
  await requireCommissioner();
  const p = await prisma.ruleProposal.update({
    where: { id: proposalId },
    data: { outcome },
    select: { seasonYear: true },
  });
  revalidate(p.seasonYear);
  return { ok: true };
}

/** The voting page's team-notice needs to know who already voted. */
export async function myTeamContext(): Promise<{
  teamId: number | null;
  ownerId: number | null;
  isCommissioner: boolean;
}> {
  const owner = await getSessionOwner();
  return {
    teamId: owner?.teamId ?? null,
    ownerId: owner?.id ?? null,
    isCommissioner: owner?.isCommissioner ?? false,
  };
}
