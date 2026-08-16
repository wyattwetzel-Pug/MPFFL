import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendToOwner } from "@/lib/sms/send";

/*
 * Inbound texts from Twilio.
 *
 * STOP revokes SMS consent and records why. That path is the one that actually
 * matters — it's the evidence that an opt-out was honoured, and it has to work
 * even when everything else is broken, so it writes consent directly rather
 * than going through the action layer.
 *
 * Anything else is forwarded to the commissioners, matching the old site:
 * someone texting back "who is this?" should reach a human.
 */

export const dynamic = "force-dynamic";

const STOP = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit"];
const START = ["start", "unstop", "yes"];

/**
 * Twilio signs every request. Without checking it, anyone who finds this URL
 * can opt owners out — or worse, opt them back in.
 */
function signatureValid(url: string, params: Record<string, string>, signature: string | null) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !signature) return false;
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  const expected = crypto.createHmac("sha1", token).update(Buffer.from(data, "utf-8")).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const twiml = (message?: string) =>
  new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${message ? `<Message>${message}</Message>` : ""}</Response>`,
    { headers: { "Content-Type": "text/xml" } }
  );

export async function POST(request: Request) {
  const form = await request.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => (params[k] = String(v)));

  const url = process.env.NEXT_PUBLIC_SITE_URL
    ? `${process.env.NEXT_PUBLIC_SITE_URL}/api/sms/incoming`
    : request.url;
  if (!signatureValid(url, params, request.headers.get("x-twilio-signature"))) {
    return new NextResponse("Bad signature", { status: 403 });
  }

  const fromPhone = params.From ?? "";
  const body = (params.Body ?? "").trim();
  const word = body.toLowerCase().replace(/[^a-z]/g, "");

  const owner = fromPhone
    ? await prisma.owner.findFirst({ where: { phone: fromPhone }, select: { id: true, name: true } })
    : null;

  const handledAs = STOP.includes(word) ? "stop" : START.includes(word) ? "start" : "forwarded";

  await prisma.smsInbound.create({
    data: { fromPhone, body, ownerId: owner?.id ?? null, twilioSid: params.MessageSid || null, handledAs },
  });

  if (handledAs === "stop") {
    if (owner) {
      await prisma.$transaction([
        prisma.owner.update({ where: { id: owner.id }, data: { smsConsentAt: null } }),
        prisma.consentEvent.create({
          data: {
            ownerId: owner.id,
            kind: "SMS",
            granted: false,
            source: "SMS_STOP",
            note: `Replied "${body}"`,
          },
        }),
      ]);
    }
    // Twilio's own STOP handling sends the confirmation, so we stay quiet.
    return twiml();
  }

  if (handledAs === "start") {
    /*
     * Deliberately not re-granting consent. Twilio unblocks the number at the
     * carrier level, but consent is ours to record and it should be given
     * knowingly, on the team page, against a policy version.
     */
    return twiml("Thanks — turn texts back on from your team page at " +
      (process.env.NEXT_PUBLIC_SITE_URL ?? "REPLACE-WITH-YOUR-DOMAIN.example"));
  }

  const commissioners = await prisma.owner.findMany({
    where: { isCommissioner: true, active: true, smsConsentAt: { not: null }, phone: { not: null } },
    select: { id: true },
  });
  for (const c of commissioners) {
    await sendToOwner({
      ownerId: c.id,
      template: "FORWARDED_REPLY",
      vars: { who: owner?.name ?? fromPhone, message: body.slice(0, 300) },
      triggerData: { forwardedFrom: fromPhone, forwardedBody: body, owner: owner?.name },
    }).catch(() => undefined);
  }

  return twiml();
}
