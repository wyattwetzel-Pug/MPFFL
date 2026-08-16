import { prisma } from "@/lib/prisma";
import { currentSeason } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { HeadshotManager, type PlayerCard } from "@/components/admin/headshot-manager";

export const dynamic = "force-dynamic";

const OLD_HOST = "p3ivmayjayqzqaam.public.blob.vercel-storage.com";

export default async function HeadshotsPage() {
  const season = currentSeason();

  /*
   * This year's rookies first, then anyone who already has a portrait. The
   * draft only needs the incoming class, but last year's images are here so
   * they can be checked after the copy.
   */
  const players = await prisma.player.findMany({
    where: {
      active: true,
      OR: [{ rookieYear: { gte: season } }, { headshotUrl: { not: null } }],
    },
    select: { id: true, name: true, position: true, nflTeam: true, headshotUrl: true, rookieYear: true },
    orderBy: [{ rookieYear: "desc" }, { name: "asc" }],
  });

  const cards: PlayerCard[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    position: p.position,
    nflTeam: p.nflTeam,
    headshotUrl: p.headshotUrl,
    legacy: !!p.headshotUrl?.includes(OLD_HOST),
  }));

  return (
    <div className="space-y-4">
      <PageHeader title="Player headshots" />
      <p className="max-w-3xl text-sm text-muted-foreground">
        {season} rookies and anyone who already has a portrait. Click a face to upload or
        replace it — PNG, under 4MB. Players without one show their initials, which is what
        the draft board will use as a fallback.
      </p>
      <HeadshotManager
        players={cards}
        legacyCount={cards.filter((c) => c.legacy).length}
      />
    </div>
  );
}
