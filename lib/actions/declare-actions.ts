"use server";

import { revalidatePath } from "next/cache";
import { getSessionOwner } from "@/lib/auth";
import { fileDeclaration, withdrawDeclaration } from "@/lib/auction/declare";

/*
 * Thin wrappers over lib/auction/declare.ts — auth and cache invalidation
 * here, the rules where scripts can reach them (§16.9).
 */

const me = async () => {
  const owner = await getSessionOwner();
  if (!owner) return null;
  return { id: owner.id, teamId: owner.teamId, isCommissioner: owner.isCommissioner };
};

const touched = () => {
  revalidatePath("/declarations");
  revalidatePath("/admin/declarations");
  revalidatePath("/rosters");
  revalidatePath("/transactions");
  revalidatePath("/board");
  revalidatePath("/board/teams");
  revalidatePath("/board/plan");
};

export async function submitDeclaration(
  teamId: number,
  playerId: number,
  kind: "HOLD" | "TOP"
): Promise<{ ok: true; transactionId: number; price: number | null } | { ok: false; error: string }> {
  const owner = await me();
  if (!owner) return { ok: false, error: "You must be signed in." };
  const res = await fileDeclaration(owner, teamId, playerId, kind);
  if (res.ok) touched();
  return res;
}

export async function retractDeclaration(
  transactionId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const owner = await me();
  if (!owner) return { ok: false, error: "You must be signed in." };
  const res = await withdrawDeclaration(owner, transactionId);
  if (res.ok) touched();
  return res;
}
