"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCommissioner } from "@/lib/auth";
import { applyStatusChange } from "@/lib/ledger/transition";
import type { TransactionStatus } from "@prisma/client";

export async function changeTransactionStatus(
  transactionId: number,
  newStatus: TransactionStatus,
  comment?: string
) {
  const owner = await requireCommissioner();
  const result = await applyStatusChange(transactionId, newStatus, owner.id, comment);

  revalidatePath("/transactions");
  revalidatePath(`/transactions/${transactionId}`);
  revalidatePath("/rosters");
  return result;
}

/** Settle a contingent term — at which point it starts counting. */
export async function resolveContingency(entryId: number, outcome: "met" | "not-met") {
  const owner = await requireCommissioner();

  const entry = await prisma.ledgerEntry.findUnique({ where: { id: entryId } });
  if (!entry) return { error: "Entry not found." };
  if (!entry.isContingent) return { error: "That term isn't contingent." };
  if (entry.resolvedAt) return { error: "That term is already settled." };

  if (outcome === "met") {
    await prisma.ledgerEntry.update({ where: { id: entryId }, data: { resolvedAt: new Date() } });
  } else {
    // The condition failed, so the transfer never happens. Keep the record and
    // zero it, rather than deleting evidence that the term existed.
    await prisma.ledgerEntry.update({
      where: { id: entryId },
      data: { resolvedAt: new Date(), amount: 0, label: `${entry.label ?? "Contingent"} — condition not met` },
    });
  }

  await prisma.transactionStatusLog.create({
    data: {
      transactionId: entry.transactionId,
      oldStatus: null as never,
      newStatus: (await prisma.transaction.findUnique({ where: { id: entry.transactionId }, select: { status: true } }))!.status,
      changedByOwnerId: owner.id,
      comment: `Contingency ${outcome === "met" ? "met" : "not met"}: ${entry.condition ?? "(no condition recorded)"}`,
    },
  });

  revalidatePath("/transactions");
  revalidatePath(`/transactions/${entry.transactionId}`);
  return { success: true };
}

/** Everything still hanging — the list that used to live in the commissioner's head. */
export async function getOpenContingencies() {
  return prisma.ledgerEntry.findMany({
    where: { isContingent: true, resolvedAt: null },
    include: {
      transaction: { select: { id: true, status: true, type: true, createdAt: true } },
      fromTeam: { select: { name: true } },
      toTeam: { select: { name: true } },
      player: { select: { name: true } },
    },
    orderBy: { id: "asc" },
  });
}
