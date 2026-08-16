import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { byUrgency } from "@/lib/conditions";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ConditionList, type ConditionRow } from "@/components/admin/condition-list";

export const dynamic = "force-dynamic";

/*
 * Every condition the league is still waiting on.
 *
 * Not scoped to a season: a 2027 term may not settle until 2028, and some
 * settle mid-season. The year-end review links here rather than owning it.
 */
export default async function ConditionsPage() {
  const rows = await prisma.condition.findMany({
    include: {
      transaction: {
        select: {
          id: true,
          note: true,
          createdAt: true,
          entries: {
            select: {
              id: true, assetType: true, seasonYear: true, amount: true, round: true,
              fromTeam: { select: { id: true, name: true } },
              toTeam: { select: { id: true, name: true } },
              player: { select: { name: true } },
            },
          },
        },
      },
      resolvedBy: { select: { name: true } },
    },
  });

  const open = rows.filter((r) => r.resolvedAt == null).sort(byUrgency);
  const settled = rows.filter((r) => r.resolvedAt != null).sort((a, b) => b.id - a.id);

  const shape = (r: (typeof rows)[number]): ConditionRow => ({
    id: r.id,
    transactionId: r.transactionId,
    description: r.description,
    decideBy: r.decideBy ? r.decideBy.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null,
    overdue: r.decideBy != null && r.decideBy < new Date(),
    filed: r.transaction.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    teams: [
      ...new Map(
        r.transaction.entries
          .flatMap((e) => [e.fromTeam, e.toTeam])
          .filter((t): t is { id: number; name: string } => !!t)
          .map((t) => [t.id, t] as const)
      ).values(),
    ],
    seasons: Array.from({ length: 4 }, (_, i) => new Date().getFullYear() + i),
    resolvedLabel:
      r.resolvedAt && r.outcome
        ? `${r.outcome === "CONVEYED" ? "Conveyed" : r.outcome === "NOT_MET" ? "Did not convey" : "Replaced"} · ${r.resolvedBy?.name ?? "commissioner"}`
        : null,
    resolutionTransactionId: r.resolutionTransactionId,
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Conditions" />
      <p className="max-w-3xl text-sm text-muted-foreground">
        Terms that couldn&apos;t be settled when the trade was filed. Every one in league history
        sat forgotten until someone went looking — this list is how that stops.
      </p>

      {open.length === 0 ? (
        <EmptyState title="Nothing outstanding" description="Every condition has been settled." />
      ) : (
        <ConditionList rows={open.map(shape)} />
      )}

      {settled.length > 0 && (
        <section className="space-y-2 pt-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Settled
          </h2>
          <ul className="space-y-1 text-sm">
            {settled.map((r) => {
              const s = shape(r);
              return (
                <li key={r.id} className="flex flex-wrap items-baseline gap-x-2 rounded-md border px-3 py-2">
                  <Link href={`/transactions/${r.transactionId}`} className="font-medium hover:underline">
                    #{r.transactionId}
                  </Link>
                  <span>{s.description}</span>
                  <span className="text-muted-foreground">— {s.resolvedLabel}</span>
                  {s.resolutionTransactionId && (
                    <Link href={`/transactions/${s.resolutionTransactionId}`} className="text-muted-foreground underline-offset-4 hover:text-primary hover:underline">
                      resolution #{s.resolutionTransactionId}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
