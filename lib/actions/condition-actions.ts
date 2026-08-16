"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCommissioner } from "@/lib/auth";
import { applyStatusChange } from "@/lib/ledger/transition";
import type { ConditionOutcome } from "@prisma/client";
import type { TradeAsset } from "@/lib/actions/submit-trade";

/*
 * Conditional terms, captured at approval and settled later.
 *
 * Nothing here evaluates a condition. The trigger is prose about the real
 * world — "if he makes the playoffs" — and the league's failure mode was never
 * computation, it was memory. So the system remembers and a human judges.
 */

/**
 * Approve a transaction, recording any conditional terms in the same step.
 *
 * The question is asked here rather than on the owner's form because approval
 * is the one moment somebody with authority is deliberately reading the deal.
 */
export async function approveWithConditions(input: {
  transactionId: number;
  /** Entries the commissioner marked conditional. May be empty. */
  conditionalEntryIds: number[];
  /**
   * A term whose asset isn't listed in the transaction at all — two of the
   * league's three historical conditions were exactly this.
   */
  description: string | null;
  decideBy: string | null;
  comment?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const owner = await requireCommissioner();
  const { transactionId, conditionalEntryIds, description } = input;

  const hasTerms = conditionalEntryIds.length > 0 || !!description?.trim();

  if (hasTerms) {
    const decideBy = input.decideBy ? new Date(input.decideBy) : null;
    if (decideBy && Number.isNaN(decideBy.getTime()))
      return { ok: false, error: "That isn't a date." };

    await prisma.$transaction(async (tx) => {
      const condition = await tx.condition.create({
        data: {
          transactionId,
          description:
            description?.trim() ||
            "Terms noted on the transaction; see the note for what was agreed.",
          decideBy,
          createdByOwnerId: owner.id,
        },
      });

      if (conditionalEntryIds.length > 0) {
        // Marked entries stop counting until the term settles — an unresolved
        // condition is a promise, not a holding.
        await tx.ledgerEntry.updateMany({
          where: { id: { in: conditionalEntryIds }, transactionId },
          data: { isContingent: true, conditionId: condition.id, resolvedAt: null },
        });
      }
    });
  }

  const result = await applyStatusChange(transactionId, "APPROVED", owner.id, input.comment);
  revalidatePath("/transactions");
  revalidatePath(`/transactions/${transactionId}`);
  revalidatePath("/admin/conditions");
  revalidatePath("/rosters");
  return "error" in result ? { ok: false, error: String(result.error) } : { ok: true };
}

/**
 * Settle a condition.
 *
 * Whatever conveys is carried by a *linked* transaction rather than appended to
 * the original. The feed sorts by date, so a resolution written onto a trade
 * from eighteen months ago would never resurface — and the two owners with an
 * asset riding on it would find out by noticing their counts had changed.
 */
export async function resolveCondition(input: {
  conditionId: number;
  outcome: ConditionOutcome;
  note: string;
  /** Only for REPLACED: what conveys instead, and which way it moves. */
  replacement?: { fromTeamId: number; toTeamId: number; assets: TradeAsset[] };
}): Promise<{ ok: true; resolutionId: number | null } | { ok: false; error: string }> {
  const owner = await requireCommissioner();

  const condition = await prisma.condition.findUnique({
    where: { id: input.conditionId },
    include: { entries: { select: { id: true } }, transaction: { select: { id: true, note: true } } },
  });
  if (!condition) return { ok: false, error: "Condition not found." };
  if (condition.resolvedAt) return { ok: false, error: "That condition is already settled." };
  if (!input.note.trim()) return { ok: false, error: "Say why — the log is the record." };

  const { outcome } = input;
  if (outcome === "REPLACED" && !input.replacement?.assets.length)
    return { ok: false, error: "Say what conveys instead." };

  const resolutionId = await prisma.$transaction(async (tx) => {
    let generated: number | null = null;

    if (outcome === "CONVEYED") {
      // The entries filed with the trade were right all along; they simply
      // start counting now.
      await tx.ledgerEntry.updateMany({
        where: { conditionId: condition.id },
        data: { resolvedAt: new Date() },
      });
    }

    if (outcome === "NOT_MET") {
      // Settled against its holder: nothing conveys. Zeroed rather than
      // deleted, because the entry is part of the record.
      await tx.ledgerEntry.updateMany({
        where: { conditionId: condition.id },
        data: { resolvedAt: new Date(), amount: 0, label: "Condition not met" },
      });
    }

    if (outcome === "REPLACED") {
      await tx.ledgerEntry.updateMany({
        where: { conditionId: condition.id },
        data: { resolvedAt: new Date(), amount: 0, label: "Replaced on resolution" },
      });
    }

    // Anything that conveys arrives as its own dated, visible event.
    if (outcome === "REPLACED" && input.replacement) {
      const { fromTeamId, toTeamId, assets } = input.replacement;
      const created = await tx.transaction.create({
        data: {
          type: "ADJUSTMENT",
          status: "APPROVED",
          note:
            `Resolves the condition on transaction #${condition.transactionId}: ` +
            `${condition.description}\n\n${input.note.trim()}`,
          submittedByOwnerId: owner.id,
          submittedForTeamId: fromTeamId,
          entries: {
            create: assets.map((a) => ({
              assetType: a.assetType,
              seasonYear: a.seasonYear,
              amount: a.amount,
              round: a.round ?? null,
              pickNumber: a.pickNumber ?? null,
              originTeamId: a.originTeamId ?? null,
              playerId: a.playerId ?? null,
              fromTeamId,
              toTeamId,
            })),
          },
          statusLogs: {
            create: { newStatus: "APPROVED", changedByOwnerId: owner.id, comment: "Condition settled" },
          },
        },
        select: { id: true },
      });
      generated = created.id;
    }

    await tx.condition.update({
      where: { id: condition.id },
      data: {
        resolvedAt: new Date(),
        outcome,
        resolutionNote: input.note.trim(),
        resolvedByOwnerId: owner.id,
        resolutionTransactionId: generated,
      },
    });

    return generated;
  });

  revalidatePath("/transactions");
  revalidatePath(`/transactions/${condition.transactionId}`);
  revalidatePath("/admin/conditions");
  revalidatePath("/rosters");
  return { ok: true, resolutionId };
}
