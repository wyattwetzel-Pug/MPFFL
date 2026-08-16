"use server";

import { revalidatePath } from "next/cache";
import { requireCommissioner } from "@/lib/auth";
import { applyClear, revertClear } from "@/lib/auction/clear";

/*
 * Thin wrappers: auth and cache invalidation. The rules live in
 * lib/auction/clear.ts where a script can reach them.
 */

function revalidate() {
  revalidatePath("/admin/auction-prep");
  revalidatePath("/rosters");
  revalidatePath("/transactions");
  revalidatePath("/auction");
}

export async function runClear() {
  const owner = await requireCommissioner();
  const result = await applyClear(owner.id);
  revalidate();
  return result;
}

export async function undoClear(teamId: number) {
  const owner = await requireCommissioner();
  const result = await revertClear(teamId, owner.id);
  revalidate();
  return result;
}
