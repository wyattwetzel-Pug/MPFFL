"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCommissioner } from "@/lib/auth";
import { normalisePhone } from "@/lib/phone";

/*
 * Who owns which team, and who is still in the league.
 *
 * Three rules shape all of this.
 *
 * **An owner row is never deleted.** They have filed transactions, made draft
 * picks, granted consent and received texts, and every one of those records
 * points at them. Deleting the row would either fail on a foreign key or, far
 * worse, succeed and tear holes in a log the league treats as sacred. Leaving
 * the league is `active: false`; leaving a team is dropping the join row.
 *
 * **The two are separate decisions.** Detaching frees somebody from a team
 * while leaving them able to sign in — which is what a hand-over looks like
 * mid-season. Deactivating is being out of the league: sign-in refuses both the
 * link request and the session, so it takes effect immediately and everywhere.
 *
 * **A membership change is a league event, so it goes in the log.** Not as an
 * asset movement — nothing moves — but as the record-only adjustment the
 * transaction form already supports. "When did Pat take over from Dave" has no
 * other answer, and a year from now somebody will ask.
 */

type Result = { ok: true } | { ok: false; error: string };

/** File the record. Membership changes only — editing a phone number isn't news. */
async function record(note: string, teamId: number | null, actorId: number) {
  await prisma.transaction.create({
    data: {
      type: "ADJUSTMENT",
      status: "COMPLETED",
      note,
      isHistorical: false,
      submittedByOwnerId: actorId,
      submittedForTeamId: teamId,
    },
  });
}

function refresh() {
  revalidatePath("/admin/owners");
  revalidatePath("/teams", "layout");
  revalidatePath("/rosters");
  revalidatePath("/transactions");
}

/**
 * Put someone on a team — a new person, or one already in the league without
 * a team.
 *
 * Refuses to move an owner who already belongs somewhere. Moving a team's
 * owner is a hand-over with two sides to it, and doing it as a side effect of
 * an "add" is how the wrong person ends up on the wrong roster. Detach first.
 */
export async function addOwnerToTeam(input: {
  teamId: number;
  name: string;
  email: string;
  phone: string;
}): Promise<Result> {
  const actor = await requireCommissioner();

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) return { ok: false, error: "A name is required." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { ok: false, error: "That doesn't look like an email address." };

  const parsed = normalisePhone(input.phone);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const team = await prisma.team.findUnique({ where: { id: input.teamId }, select: { name: true } });
  if (!team) return { ok: false, error: "No such team." };

  const existing = await prisma.owner.findUnique({
    where: { email },
    select: { id: true, name: true, active: true, teamOwner: { select: { teamId: true } } },
  });

  if (existing?.teamOwner) {
    if (existing.teamOwner.teamId === input.teamId)
      return { ok: false, error: `${existing.name} already owns ${team.name}.` };
    return {
      ok: false,
      error: `${existing.name} already owns another team. Detach them from it first — a hand-over should be two deliberate steps.`,
    };
  }

  const owner = existing
    ? await prisma.owner.update({
        where: { id: existing.id },
        // Re-adding somebody who was let go brings them back in.
        data: { name, phone: parsed.phone, active: true },
        select: { id: true, name: true },
      })
    : await prisma.owner.create({
        data: { name, email, phone: parsed.phone, isCommissioner: false, active: true },
        select: { id: true, name: true },
      });

  await prisma.teamOwner.create({ data: { teamId: input.teamId, ownerId: owner.id } });
  await record(
    `${owner.name} added as an owner of ${team.name}.` +
      (existing ? " They were already in the league." : " New to the league — they'll be asked to accept the policies when they first sign in."),
    input.teamId,
    actor.id
  );

  refresh();
  return { ok: true };
}

/** Take somebody off a team. They stay in the league and can still sign in. */
export async function detachOwner(ownerId: number): Promise<Result> {
  const actor = await requireCommissioner();

  const owner = await prisma.owner.findUnique({
    where: { id: ownerId },
    select: { name: true, teamOwner: { select: { teamId: true, team: { select: { name: true } } } } },
  });
  if (!owner) return { ok: false, error: "No such owner." };
  if (!owner.teamOwner) return { ok: false, error: `${owner.name} isn't on a team.` };

  const teamId = owner.teamOwner.teamId;
  const teamName = owner.teamOwner.team.name;

  await prisma.teamOwner.delete({ where: { teamId_ownerId: { teamId, ownerId } } });
  await record(`${owner.name} is no longer an owner of ${teamName}.`, teamId, actor.id);

  refresh();
  return { ok: true };
}

/** Put an owner without a team onto one. */
export async function attachOwner(ownerId: number, teamId: number): Promise<Result> {
  const actor = await requireCommissioner();

  const [owner, team] = await Promise.all([
    prisma.owner.findUnique({
      where: { id: ownerId },
      select: { name: true, active: true, teamOwner: { select: { teamId: true } } },
    }),
    prisma.team.findUnique({ where: { id: teamId }, select: { name: true } }),
  ]);
  if (!owner || !team) return { ok: false, error: "No such owner or team." };
  if (owner.teamOwner) return { ok: false, error: `${owner.name} already owns a team. Detach them first.` };
  if (!owner.active)
    return { ok: false, error: `${owner.name} is out of the league. Bring them back in first.` };

  await prisma.teamOwner.create({ data: { teamId, ownerId } });
  await record(`${owner.name} is now an owner of ${team.name}.`, teamId, actor.id);

  refresh();
  return { ok: true };
}

/**
 * In or out of the league.
 *
 * Out means out: `active: false` is checked when a sign-in link is requested
 * *and* when a session is read, so it takes hold immediately on every device
 * rather than whenever a cookie happens to expire. Their history stays exactly
 * where it is.
 */
export async function setOwnerActive(ownerId: number, active: boolean): Promise<Result> {
  const actor = await requireCommissioner();

  const owner = await prisma.owner.findUnique({
    where: { id: ownerId },
    select: {
      name: true,
      active: true,
      isCommissioner: true,
      teamOwner: { select: { teamId: true, team: { select: { name: true } } } },
    },
  });
  if (!owner) return { ok: false, error: "No such owner." };
  if (owner.active === active) return { ok: true };

  if (!active) {
    // Locking yourself out mid-click is not a decision anyone means to make.
    if (ownerId === actor.id)
      return { ok: false, error: "You can't remove yourself from the league." };

    if (owner.isCommissioner) {
      const others = await prisma.owner.count({
        where: { isCommissioner: true, active: true, NOT: { id: ownerId } },
      });
      if (others === 0)
        return {
          ok: false,
          error: "That's the last active commissioner — make someone else one first.",
        };
    }
  }

  await prisma.owner.update({ where: { id: ownerId }, data: { active } });
  if (!active) {
    // A sign-in link already in their inbox would otherwise still work.
    await prisma.loginToken.deleteMany({ where: { ownerId, usedAt: null } });
  }

  await record(
    active
      ? `${owner.name} is back in the league.`
      : `${owner.name} is no longer in the league.` +
          (owner.teamOwner ? ` Still listed as an owner of ${owner.teamOwner.team.name}.` : ""),
    owner.teamOwner?.teamId ?? null,
    actor.id
  );

  refresh();
  return { ok: true };
}
