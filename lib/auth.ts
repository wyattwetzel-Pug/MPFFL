import "server-only";
import { createHash, randomBytes } from "crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { safeNext } from "@/lib/safe-next";

export const SESSION_COOKIE = "mpffl_session";
const TEN_YEARS_SECONDS = 10 * 365 * 24 * 60 * 60;
export const LOGIN_TOKEN_TTL_MS = 30 * 60 * 1000;

/**
 * Mail clients wrap long URLs and can inject whitespace mid-token, and some
 * linkifiers append trailing punctuation. Keep only the base64url alphabet.
 */
export function normalizeLoginToken(raw: string): string {
  return (raw ?? "").replace(/[^A-Za-z0-9_-]/g, "");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(ownerId: number) {
  const token = generateToken();
  await prisma.session.create({
    data: { ownerId, tokenHash: hashToken(token) },
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TEN_YEARS_SECONDS,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  cookieStore.delete(SESSION_COOKIE);
}

export type SessionOwner = {
  id: number;
  name: string;
  email: string;
  isCommissioner: boolean;
  teamId: number | null;
};

// Cached per-request: layouts and pages can all call this without duplicate queries.
export const getSessionOwner = cache(async (): Promise<SessionOwner | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { owner: { include: { teamOwner: true } } },
  });
  if (!session || !session.owner.active) return null;

  // Touch lastSeenAt at most once a day to keep reads cheap.
  if (Date.now() - session.lastSeenAt.getTime() > 24 * 60 * 60 * 1000) {
    prisma.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => {});
  }

  return {
    id: session.owner.id,
    name: session.owner.name,
    email: session.owner.email,
    isCommissioner: session.owner.isCommissioner,
    teamId: session.owner.teamOwner?.teamId ?? null,
  };
});

/*
 * "/sign-in", plus where they were trying to go.
 *
 * The path comes from middleware.ts — a server component can't see its own
 * URL. Without it, an owner following a text message to a specific page signs
 * in and lands on the home page, which is the moment the link stops working
 * for them.
 */
async function signInUrl(): Promise<string> {
  const here = safeNext((await headers()).get("x-pathname"));
  return here ? `/sign-in?next=${encodeURIComponent(here)}` : "/sign-in";
}

export async function requireOwner(): Promise<SessionOwner> {
  const owner = await getSessionOwner();
  if (!owner) redirect(await signInUrl());
  return owner;
}

export async function requireCommissioner(): Promise<SessionOwner> {
  const owner = await getSessionOwner();
  if (!owner) redirect(await signInUrl());
  // Signed in but not a commissioner is a wrong turn, not a missing session —
  // sending them back through sign-in would just loop.
  if (!owner.isCommissioner) redirect("/");
  return owner;
}
