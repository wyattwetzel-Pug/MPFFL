import "server-only";
import { prisma } from "@/lib/prisma";
import { TEMPLATES, render, type TemplateKey } from "@/lib/sms/templates";

/*
 * Sending a text.
 *
 * Three gates before anything leaves, in this order: the kill switch, consent,
 * then rate limits. Every attempt is written to SmsMessage whether it left or
 * not — a message that was *never* sent is exactly the thing you need a record
 * of when someone says they weren't told.
 *
 * Rate limits are exploit containment, not league rules: a bug that texts
 * everyone in a loop is the failure mode that actually costs money.
 *
 * Sized against a real draft rather than guessed. With 19 consented owners,
 * each pick sends ~18 announcements plus the on-the-clock text — about 20
 * messages league-wide, and one per owner. A 32-pick draft is therefore ~640
 * messages and 32 per owner in total.
 *
 * The old numbers (10/hour, 30/day, 400/league/day) were set before anything
 * sent for real, and 10/owner/hour was the binding one: eleven picks inside an
 * hour — entirely likely early on, when everyone is watching — and owners stop
 * being told anything. The send is logged as skipped and nobody hears about it.
 *
 * These clear a fast draft with room: 25/hour allows a burst of 25 picks in an
 * hour, 80/day covers more picks in a day than the draft contains, and
 * 1200/league/day covers all 32 picks landing on the same day nearly twice
 * over. A runaway loop still hits a wall long before it costs anything.
 */

export const LIMITS = { perOwnerHour: 25, perOwnerDay: 80, leagueDay: 1200 };

export const smsEnabled = () => process.env.SMS_KILL_SWITCH !== "true";
const testMode = () => process.env.SMS_TEST_MODE === "true";
const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? "https://your-project.vercel.app";

export type SendResult = { sent: boolean; status: string; reason?: string; id: number };

async function twilioSend(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) throw new Error("Twilio is not configured.");

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  const json = (await res.json()) as { sid?: string; code?: number; message?: string };
  if (!res.ok) throw Object.assign(new Error(json.message ?? "Twilio rejected the message"), {
    code: String(json.code ?? res.status),
  });
  return json.sid!;
}

/** Have we already texted this person too much? */
async function overLimit(ownerId: number) {
  const now = Date.now();
  const [hour, day, league] = await Promise.all([
    prisma.smsMessage.count({
      where: { ownerId, status: "sent", createdAt: { gte: new Date(now - 3600e3) } },
    }),
    prisma.smsMessage.count({
      where: { ownerId, status: "sent", createdAt: { gte: new Date(now - 86400e3) } },
    }),
    prisma.smsMessage.count({
      where: { status: "sent", createdAt: { gte: new Date(now - 86400e3) } },
    }),
  ]);
  if (hour >= LIMITS.perOwnerHour) return `${hour} already sent to them this hour`;
  if (day >= LIMITS.perOwnerDay) return `${day} already sent to them today`;
  if (league >= LIMITS.leagueDay) return `${league} already sent league-wide today`;
  return null;
}

export async function sendToOwner(input: {
  ownerId: number;
  template: TemplateKey;
  vars: Record<string, string | number>;
  sentByOwnerId?: number;
  triggerData?: Record<string, unknown>;
}): Promise<SendResult> {
  const owner = await prisma.owner.findUnique({
    where: { id: input.ownerId },
    select: { id: true, phone: true, smsConsentAt: true, active: true },
  });

  const body = render(input.template, { ...input.vars, siteUrl: siteUrl() });
  const spec = TEMPLATES[input.template];

  const log = (status: string, extra: Partial<{ reason: string; twilioSid: string; errorCode: string }> = {}) =>
    prisma.smsMessage.create({
      data: {
        ownerId: owner?.id ?? null,
        toPhone: owner?.phone ?? "",
        template: input.template,
        body,
        status,
        testMode: testMode(),
        triggerType: spec.triggerType,
        triggerData: (input.triggerData ?? {}) as object,
        sentByOwnerId: input.sentByOwnerId ?? null,
        ...extra,
      },
      select: { id: true },
    });

  const skip = async (reason: string): Promise<SendResult> => {
    const row = await log("skipped", { reason });
    return { sent: false, status: "skipped", reason, id: row.id };
  };

  if (!smsEnabled()) return skip("SMS is switched off");
  if (!owner || !owner.active) return skip("No such active owner");
  if (!owner.phone) return skip("No mobile number on file");
  // Consent is checked here, not at the call site, so no future caller can
  // forget to ask.
  if (!owner.smsConsentAt) return skip("Owner has not consented to texts");

  const limited = await overLimit(owner.id);
  if (limited) return skip(`Rate limit: ${limited}`);

  // In test mode the message still gets composed, logged and sent — just to
  // one number, so the whole path is exercised without texting the league.
  const to = testMode() ? process.env.SMS_TEST_PHONE_NUMBER : owner.phone;
  if (!to) return skip("Test mode is on but SMS_TEST_PHONE_NUMBER isn't set");

  try {
    const sid = await twilioSend(to, body);
    const row = await log("sent", { twilioSid: sid });
    return { sent: true, status: "sent", id: row.id };
  } catch (e) {
    const err = e as Error & { code?: string };
    const row = await log("failed", { reason: err.message, errorCode: err.code });
    return { sent: false, status: "failed", reason: err.message, id: row.id };
  }
}

/** Everyone who has opted in — the draft announcement's audience. */
export async function sendToLeague(input: {
  template: TemplateKey;
  vars: Record<string, string | number>;
  exceptOwnerId?: number;
  triggerData?: Record<string, unknown>;
}): Promise<SendResult[]> {
  const owners = await prisma.owner.findMany({
    where: { active: true, smsConsentAt: { not: null }, phone: { not: null } },
    select: { id: true },
  });

  /*
   * In test mode every message is redirected to the same phone, so a
   * league-wide send arrives as nineteen identical copies of one announcement.
   * One is the entire point of a test — and during a draft rehearsal the real
   * behaviour being checked is "did the announcement go out", not "did it go
   * out nineteen times".
   */
  if (testMode()) {
    const one = owners.find((o) => o.id !== input.exceptOwnerId);
    return one ? [await sendToOwner({ ...input, ownerId: one.id })] : [];
  }

  const results: SendResult[] = [];
  for (const o of owners) {
    if (o.id === input.exceptOwnerId) continue;
    results.push(await sendToOwner({ ...input, ownerId: o.id }));
  }
  return results;
}
