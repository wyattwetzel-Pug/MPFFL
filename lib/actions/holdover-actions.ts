"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCommissioner } from "@/lib/auth";

/** Change one cell of the rate grid. */
export async function setHoldoverRate(
  pickNumber: number,
  position: string,
  amount: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireCommissioner();
  if (!Number.isInteger(amount) || amount < 0) return { ok: false, error: "Rates are whole dollars." };

  await prisma.holdoverRate.upsert({
    where: { pickNumber_position: { pickNumber, position } },
    create: { pickNumber, position, amount },
    update: { amount },
  });

  revalidatePath("/admin/holdover-rates");
  return { ok: true };
}
