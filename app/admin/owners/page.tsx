import { prisma } from "@/lib/prisma";
import { requireCommissioner } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { formatPhone } from "@/lib/phone";
import { OwnerManager, type OwnerRow, type TeamRow } from "@/components/admin/owner-manager";

export const dynamic = "force-dynamic";

export default async function OwnersPage() {
  const me = await requireCommissioner();

  const [teams, owners] = await Promise.all([
    prisma.team.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, slug: true } }),
    prisma.owner.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: {
        id: true, name: true, email: true, phone: true, active: true, isCommissioner: true,
        privacyConsentAt: true, touConsentAt: true, smsConsentAt: true,
        teamOwner: { select: { teamId: true } },
      },
    }),
  ]);

  const view = (o: (typeof owners)[number]): OwnerRow => ({
    id: o.id,
    name: o.name,
    email: o.email,
    phone: formatPhone(o.phone),
    active: o.active,
    isCommissioner: o.isCommissioner,
    isSelf: o.id === me.id,
    policies: o.privacyConsentAt != null && o.touConsentAt != null,
    sms: o.smsConsentAt != null,
  });

  const rows: TeamRow[] = teams.map((t) => ({
    ...t,
    owners: owners.filter((o) => o.teamOwner?.teamId === t.id).map(view),
  }));

  /*
   * Everyone with no team, whether they're still in the league or not. Both
   * belong in one list: the question being asked of it is "who is loose", and
   * splitting it would hide the person you just detached behind a heading.
   */
  const unattached = owners.filter((o) => !o.teamOwner).map(view);

  return (
    <div className="space-y-5">
      <PageHeader title="Owners" />
      <p className="-mt-3 text-sm text-muted-foreground">
        Who owns which team, who&apos;s in the league, and who can sign in.
      </p>
      <OwnerManager teams={rows} unattached={unattached} />
    </div>
  );
}
