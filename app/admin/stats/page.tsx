import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireCommissioner } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StripDivider } from "@/components/league/asset-strip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const DAYS = 30;

/** "3m ago" while it matters, a date once it doesn't. */
function when(at: Date | null): string {
  if (!at) return "never";
  const mins = Math.floor((Date.now() - at.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return at.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function StatsPage() {
  await requireCommissioner();
  const since = new Date(Date.now() - DAYS * 86400_000);

  const [owners, viewsByPath, viewsByOwner, recent, totalViews] = await Promise.all([
    prisma.owner.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        sessions: { select: { createdAt: true, lastSeenAt: true } },
        teamOwner: { select: { team: { select: { name: true, slug: true } } } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.pageView.groupBy({
      by: ["path"],
      where: { at: { gte: since } },
      _count: true,
      orderBy: { _count: { path: "desc" } },
      take: 20,
    }),
    prisma.pageView.groupBy({
      by: ["ownerId"],
      where: { at: { gte: since } },
      _count: true,
    }),
    prisma.pageView.findMany({
      orderBy: { id: "desc" },
      take: 15,
      include: { owner: { select: { name: true } } },
    }),
    prisma.pageView.count({ where: { at: { gte: since } } }),
  ]);

  const viewCount = new Map(viewsByOwner.map((v) => [v.ownerId, v._count]));

  /*
   * A session is created each time somebody follows a magic link, and lives ten
   * years — so the count is "how many times they signed in", usually one per
   * device, not how many visits they've made. Labelled that way rather than
   * "logins", which would invite reading it as visits.
   */
  const people = owners
    .map((o) => {
      const first = o.sessions.reduce<Date | null>(
        (a, s) => (!a || s.createdAt < a ? s.createdAt : a),
        null
      );
      const last = o.sessions.reduce<Date | null>(
        (a, s) => (!a || s.lastSeenAt > a ? s.lastSeenAt : a),
        null
      );
      return {
        id: o.id,
        name: o.name,
        team: o.teamOwner?.team,
        signIns: o.sessions.length,
        first,
        last,
        views: viewCount.get(o.id) ?? 0,
      };
    })
    .sort((a, b) => {
      // Never-signed-in to the bottom; otherwise most recently active first.
      if (!a.last && !b.last) return a.name.localeCompare(b.name);
      if (!a.last) return 1;
      if (!b.last) return -1;
      return b.last.getTime() - a.last.getTime();
    });

  const signedIn = people.filter((p) => p.signIns > 0).length;
  const active = people.filter((p) => p.views > 0).length;
  const maxPath = viewsByPath[0]?._count ?? 1;

  return (
    <div className="space-y-5">
      <PageHeader title="Usage" />

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span className="whitespace-nowrap">
          Signed in at least once:{" "}
          <span className="font-medium text-foreground/80">
            {signedIn} of {people.length}
          </span>
        </span>
        <StripDivider />
        <span className="whitespace-nowrap">
          Active in {DAYS} days: <span className="font-medium text-foreground/80">{active}</span>
        </span>
        <span className="whitespace-nowrap">
          Page views: <span className="font-medium text-foreground/80">{totalViews}</span>
        </span>
      </p>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Who has signed in
        </h2>
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Owner</TableHead>
                <TableHead className="hidden sm:table-cell">Team</TableHead>
                <TableHead className="text-center">Sign-ins</TableHead>
                <TableHead className="text-center">First</TableHead>
                <TableHead className="text-center">Last seen</TableHead>
                <TableHead className="text-center">Views</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((p, i) => (
                <TableRow key={p.id} className={i % 2 === 1 ? "bg-muted/20" : ""}>
                  <TableCell className="whitespace-nowrap font-medium">
                    {p.name}
                    {p.signIns === 0 && (
                      <Badge variant="warning" className="ml-2">
                        never
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
                    {p.team ? (
                      <Link
                        href={`/teams/${p.team.slug}`}
                        className="underline-offset-4 hover:text-primary hover:underline"
                      >
                        {p.team.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">{p.signIns}</TableCell>
                  <TableCell className="whitespace-nowrap text-center text-muted-foreground">
                    {when(p.first)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-center text-muted-foreground">
                    {when(p.last)}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">{p.views || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <p className="text-xs text-muted-foreground">
          A sign-in is one trip through a magic link, and the session lasts ten years — so
          this counts devices signed in, not visits. &ldquo;Last seen&rdquo; is refreshed at
          most once a day, so it reads as a day rather than a minute.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Most viewed pages · last {DAYS} days
        </h2>
        {viewsByPath.length === 0 ? (
          <EmptyState
            title="Nothing recorded yet"
            description="Views are counted from now on, and only for signed-in owners."
          />
        ) : (
          <Card>
            <CardContent className="space-y-1.5 p-4">
              {viewsByPath.map((v) => (
                <div key={v.path} className="flex items-center gap-3 text-sm">
                  <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">
                    {v._count}
                  </span>
                  {/* A bar makes the shape readable at a glance; the number is
                      still there for anyone who wants the figure. */}
                  <span className="h-2 shrink-0 rounded-full bg-success/70" style={{ width: `${Math.max(4, (v._count / maxPath) * 55)}%` }} />
                  <Link
                    href={v.path}
                    className="min-w-0 truncate text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                  >
                    {v.path}
                  </Link>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Latest activity
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-2 rounded-md border px-3 py-1.5">
                <span className="font-medium">{r.owner.name}</span>
                <span className="min-w-0 truncate text-muted-foreground">{r.path}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{when(r.at)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Only signed-in owners are counted — anonymous traffic here is mostly link previewers
          fetching every URL they see, and counting those would make these figures say
          something untrue. A repeat view of the same page within five minutes counts once, so
          a draft board left open doesn&apos;t out-view the league.
        </p>
      </section>
    </div>
  );
}
