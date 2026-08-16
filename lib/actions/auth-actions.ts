"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, hashToken, normalizeLoginToken } from "@/lib/auth";
import { nextOrHome } from "@/lib/safe-next";

/*
 * Consuming a sign-in link happens here, on POST, never on GET.
 *
 * Link previewers (iMessage, Slack, WhatsApp, mail scanners) fetch any URL
 * they see. When the GET itself signed you in, those fetches silently spent
 * the token and the real recipient was told the link was "already used".
 * A POST is only issued by someone actually clicking the button.
 */
export async function confirmSignIn(formData: FormData) {
  const token = normalizeLoginToken(String(formData.get("token") ?? ""));
  // Checked again here rather than trusted from the form — this is the only
  // place the value actually turns into a redirect.
  const dest = nextOrHome(String(formData.get("next") ?? ""));
  if (!token) redirect("/sign-in?error=invalid");

  const loginToken = await prisma.loginToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });

  if (!loginToken) redirect("/sign-in?error=invalid");
  if (loginToken.usedAt) redirect("/sign-in?error=used");
  if (loginToken.expiresAt < new Date()) redirect("/sign-in?error=expired");

  await prisma.loginToken.update({
    where: { id: loginToken.id },
    data: { usedAt: new Date() },
  });
  await createSession(loginToken.ownerId);

  redirect(dest);
}
