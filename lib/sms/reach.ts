import { prisma } from "@/lib/prisma";

/*
 * Who the league can actually reach, and — the question that matters during a
 * draft — which teams it can't.
 *
 * An owner who hasn't consented is skipped by `sendToOwner` silently, by
 * design: consent is checked there so no caller can forget to ask. The cost is
 * that nothing anywhere says who is being skipped. Three owners were invisible
 * to the draft and the only way to find out was to query the database.
 *
 * A team with two owners is still reachable if one of them has consented —
 * both get texted and either can pick. So the alarming number is not "owners
 * without consent", it's **teams where nobody can be told they're on the
 * clock**. That team's window opens, twelve hours pass in silence, and the
 * draft moves on without them.
 */

export type UnreachableOwner = {
  ownerId: number;
  name: string;
  teamName: string | null;
  reason: "no consent" | "no mobile number" | "no consent, no number";
};

export type ReachReport = {
  reachable: number;
  total: number;
  owners: UnreachableOwner[];
  /** Teams with no reachable owner at all. These stall a draft. */
  silentTeams: { teamId: number; teamName: string; owners: string[] }[];
};

export async function reachReport(): Promise<ReachReport> {
  const owners = await prisma.owner.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      phone: true,
      smsConsentAt: true,
      teamOwner: { select: { teamId: true, team: { select: { name: true } } } },
    },
    orderBy: { name: "asc" },
  });

  const canText = (o: (typeof owners)[number]) => !!o.smsConsentAt && !!o.phone;

  const unreachable: UnreachableOwner[] = owners
    .filter((o) => !canText(o))
    .map((o) => ({
      ownerId: o.id,
      name: o.name,
      teamName: o.teamOwner?.team.name ?? null,
      reason: !o.smsConsentAt && !o.phone
        ? "no consent, no number"
        : !o.smsConsentAt
          ? "no consent"
          : "no mobile number",
    }));

  // Group by team, then keep only the teams where every owner is unreachable.
  const byTeam = new Map<number, { name: string; all: string[]; reachable: number }>();
  for (const o of owners) {
    const t = o.teamOwner;
    if (!t) continue;
    const entry = byTeam.get(t.teamId) ?? { name: t.team.name, all: [], reachable: 0 };
    entry.all.push(o.name);
    if (canText(o)) entry.reachable++;
    byTeam.set(t.teamId, entry);
  }

  const silentTeams = [...byTeam.entries()]
    .filter(([, t]) => t.reachable === 0)
    .map(([teamId, t]) => ({ teamId, teamName: t.name, owners: t.all }))
    .sort((a, b) => a.teamName.localeCompare(b.teamName));

  return {
    reachable: owners.filter(canText).length,
    total: owners.length,
    owners: unreachable,
    silentTeams,
  };
}
