import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { PlayerManager } from "@/components/admin/player-manager";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

export default async function AdminPlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: pageParam } = await searchParams;
  const where: Prisma.PlayerWhereInput = q
    ? { name: { contains: q, mode: "insensitive" } }
    : {};

  const total = await prisma.player.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(pageParam) || 1), pageCount);

  const players = await prisma.player.findMany({
    where,
    orderBy: { name: "asc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      rosterSpots: {
        where: { cutAt: null },
        include: { team: { select: { name: true } } },
      },
    },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Manage Players"
        actions={
          <form method="get">
            <Input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search players…"
              aria-label="Search players"
              className="w-56"
            />
          </form>
        }
      />

      <Pagination
        page={page}
        pageCount={pageCount}
        total={total}
        pageSize={PAGE_SIZE}
        pathname="/admin/players"
        params={{ q }}
        itemLabel="players"
      />

      <PlayerManager
        players={players.map((p) => ({
          id: p.id,
          name: p.name,
          position: p.position,
          nflTeam: p.nflTeam,
          rookieYear: p.rookieYear,
          active: p.active,
          onRoster: p.rosterSpots[0]?.team.name ?? null,
        }))}
      />

      <Pagination
        page={page}
        pageCount={pageCount}
        total={total}
        pageSize={PAGE_SIZE}
        pathname="/admin/players"
        params={{ q }}
        itemLabel="players"
      />
    </div>
  );
}
