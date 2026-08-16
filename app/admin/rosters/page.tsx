import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function AdminRostersPage() {
  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { rosterSpots: { where: { cutAt: null } } } } },
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Edit Rosters" />
      {teams.length === 0 ? (
        <EmptyState title="No teams yet" />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <Link key={t.id} href={`/admin/rosters/${t.id}`}>
              <Card className="flex flex-row items-center justify-between px-4 py-3 transition-colors hover:bg-accent/50">
                <span className="font-medium">{t.name}</span>
                <span className="text-sm text-muted-foreground">
                  {t._count.rosterSpots} players
                </span>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
