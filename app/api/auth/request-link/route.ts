import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateToken, hashToken, LOGIN_TOKEN_TTL_MS } from "@/lib/auth";
import { sendMagicLink } from "@/lib/email";
import { safeNext } from "@/lib/safe-next";

export async function POST(req: NextRequest) {
  const { email, next } = await req.json().catch(() => ({}));
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const owner = await prisma.owner.findFirst({
    where: { email: { equals: email.trim(), mode: "insensitive" }, active: true },
  });

  // Always report success so the form can't be used to probe which emails exist.
  let devLink: string | undefined;

  if (owner) {
    // Retire any outstanding links so only the newest one works. Without this,
    // older emails sitting in an inbox stay clickable and fail confusingly.
    await prisma.loginToken.updateMany({
      where: { ownerId: owner.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = generateToken();
    await prisma.loginToken.create({
      data: {
        ownerId: owner.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + LOGIN_TOKEN_TTL_MS),
      },
    });
    const base = process.env.APP_URL ?? req.nextUrl.origin;
    /*
     * The destination rides along in the link so it survives the round trip
     * through an inbox — there is no session yet to remember it in, and the
     * click often happens in a different browser from the request.
     */
    const dest = safeNext(typeof next === "string" ? next : null);
    const url =
      `${base}/sign-in/verify?token=${token}` +
      (dest ? `&next=${encodeURIComponent(dest)}` : "");
    await sendMagicLink(owner.email, url);

    // With no mail provider configured (local dev), hand the link back so the
    // sign-in page can show it. Never happens once RESEND_API_KEY is set.
    if (!process.env.RESEND_API_KEY && process.env.NODE_ENV !== "production") {
      devLink = url;
    }
  }

  return NextResponse.json({ success: true, devLink });
}
