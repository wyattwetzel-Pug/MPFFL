"use server";

import { revalidatePath } from "next/cache";
import { requireCommissioner } from "@/lib/auth";
import { sendToOwner } from "@/lib/sms/send";
import type { TemplateKey } from "@/lib/sms/templates";

/** Send yourself one message, to prove the pipe works end to end. */
export async function sendTestSms(
  template: TemplateKey
): Promise<{ ok: true; status: string; reason?: string } | { ok: false; error: string }> {
  const owner = await requireCommissioner();

  // Sample values, so a template can be checked without staging a real draft.
  const res = await sendToOwner({
    ownerId: owner.id,
    template,
    vars: {
      pickNumber: 7, slot: 7, ordinalSuffix: "th", round: 1, leagueYear: new Date().getFullYear(),
      hours: 12, teamName: "Test Team", selectingTeam: "Test Team", nextTeam: "Another Team",
      playerName: "Sample Player", position: "RB", nflTeam: "SF",
      otherTeamNames: "Another Team", transactionId: 1,
      who: owner.name, message: "test", timeLeft: "2 hours",
    },
    sentByOwnerId: owner.id,
    triggerData: { test: true },
  });

  revalidatePath("/admin/sms");
  return { ok: true, status: res.status, reason: res.reason };
}
