"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionOwner } from "@/lib/auth";
import { normalisePhone } from "@/lib/phone";
import type { ConsentKind, ConsentSource } from "@prisma/client";

/*
 * Editing a team, and recording consent.
 *
 * Consent is a live checkbox because Twilio and the TCPA require it be
 * revocable — but every change also appends a ConsentEvent, because an
 * overwritten timestamp can't answer "when did they opt out, and how," and the
 * privacy policy commits to keeping those records for four years.
 *
 * Only the person consents. An owner may grant or revoke their own; a
 * commissioner may *revoke* on someone's behalf, because a phoned-in opt-out
 * has to be honourable — but never grant it for them.
 */

/** Effective date of the policies as published, recorded against each grant. */
const POLICY_EFFECTIVE = "2025-06-22";

const FIELD: Record<ConsentKind, "privacyConsentAt" | "touConsentAt" | "smsConsentAt"> = {
  PRIVACY: "privacyConsentAt",
  TOU: "touConsentAt",
  SMS: "smsConsentAt",
};

export async function setConsent(input: {
  ownerId: number;
  kind: ConsentKind;
  granted: boolean;
  source?: ConsentSource;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getSessionOwner();
  if (!actor) return { ok: false, error: "You must be signed in." };

  const self = actor.id === input.ownerId;
  if (!self) {
    if (!actor.isCommissioner)
      return { ok: false, error: "You can only change your own consent." };
    if (input.granted)
      return {
        ok: false,
        error: "Consent has to come from the person giving it. You can revoke, not grant.",
      };
  }

  const source: ConsentSource = input.source ?? (self ? "WEB" : "COMMISSIONER");

  await prisma.$transaction([
    prisma.owner.update({
      where: { id: input.ownerId },
      data: { [FIELD[input.kind]]: input.granted ? new Date() : null },
    }),
    prisma.consentEvent.create({
      data: {
        ownerId: input.ownerId,
        kind: input.kind,
        granted: input.granted,
        source,
        actorOwnerId: self ? null : actor.id,
        policyEffective: input.granted ? POLICY_EFFECTIVE : null,
      },
    }),
  ]);

  revalidatePath("/teams", "layout");
  return { ok: true };
}

/** Your own contact details, or a commissioner fixing anyone's. */
export async function updateOwnerContact(input: {
  ownerId: number;
  name: string;
  phone: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getSessionOwner();
  if (!actor) return { ok: false, error: "You must be signed in." };
  if (actor.id !== input.ownerId && !actor.isCommissioner)
    return { ok: false, error: "You can only edit your own details." };
  if (!input.name.trim()) return { ok: false, error: "A name is required." };

  // Stored E.164 so it can go straight to Twilio without guessing later.
  const parsed = normalisePhone(input.phone);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  await prisma.owner.update({
    where: { id: input.ownerId },
    data: { name: input.name.trim(), phone: parsed.phone },
  });

  revalidatePath("/teams", "layout");
  revalidatePath("/rosters");
  return { ok: true };
}

/**
 * Change the address someone signs in with.
 *
 * Separate from `updateOwnerContact`, and deliberately not part of the
 * autosave-on-blur set, because email is not a detail about a person here — it
 * *is* the account. There is no password to fall back on: get it wrong and the
 * next sign-in link goes somewhere they can't read. So it takes an explicit
 * press, the way renaming a team does.
 *
 * Outstanding sign-in links are destroyed on the way through. A magic link
 * already sitting in the old inbox would otherwise still work, which is exactly
 * the thing changing the address was meant to stop.
 *
 * Live sessions are left alone on purpose: whoever made the change is signed in
 * on this device, and signing them out at the moment they might have mistyped
 * the address is how a recoverable typo becomes a locked account.
 */
export async function updateOwnerEmail(input: {
  ownerId: number;
  email: string;
}): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const actor = await getSessionOwner();
  if (!actor) return { ok: false, error: "You must be signed in." };
  if (actor.id !== input.ownerId && !actor.isCommissioner)
    return { ok: false, error: "You can only change your own sign-in email." };

  // Stored lower-case: addresses are matched exactly at sign-in, and "Psims80@"
  // not matching "psims80@" is a lockout nobody would think to look for.
  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false, error: "An email address is required — it's how you sign in." };
  // Deliberately loose. The delivery test is whether the sign-in link arrives,
  // and a clever pattern that rejects a real address is the worse failure.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { ok: false, error: "That doesn't look like an email address." };

  const current = await prisma.owner.findUnique({
    where: { id: input.ownerId },
    select: { email: true, name: true },
  });
  if (!current) return { ok: false, error: "No such owner." };
  if (current.email === email) return { ok: true, email };

  const clash = await prisma.owner.findUnique({ where: { email }, select: { name: true } });
  if (clash) return { ok: false, error: `${clash.name} already signs in with that address.` };

  await prisma.$transaction([
    prisma.owner.update({ where: { id: input.ownerId }, data: { email } }),
    prisma.loginToken.deleteMany({ where: { ownerId: input.ownerId, usedAt: null } }),
  ]);

  revalidatePath("/teams", "layout");
  revalidatePath("/admin/stats");
  return { ok: true, email };
}

/**
 * Rename a team.
 *
 * The slug moves with the name, because a team's URL should say what the team
 * is called. Old links break, which is the lesser evil: a stale slug that
 * silently resolves to a renamed team is how the wrong roster gets shared.
 */
export async function renameTeam(
  teamId: number,
  name: string
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const actor = await getSessionOwner();
  if (!actor) return { ok: false, error: "You must be signed in." };
  if (actor.teamId !== teamId && !actor.isCommissioner)
    return { ok: false, error: "You can only rename your own team." };
  if (!name.trim()) return { ok: false, error: "A team needs a name." };

  const slug = name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  if (!slug) return { ok: false, error: "That name has no letters or numbers in it." };

  const clash = await prisma.team.findFirst({ where: { slug, NOT: { id: teamId } } });
  if (clash) return { ok: false, error: "Another team already uses that name." };

  await prisma.team.update({ where: { id: teamId }, data: { name: name.trim(), slug } });

  revalidatePath("/teams", "layout");
  revalidatePath("/rosters");
  return { ok: true, slug };
}
