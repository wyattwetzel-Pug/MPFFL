import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionOwner } from "@/lib/auth";
import { listManualVersions } from "@/lib/manual/queries";
import { docToPlainText } from "@/lib/manual/document";
import { diffText, collapseUnchanged, diffStats } from "@/lib/manual/diff";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { RestoreButton } from "@/components/manual/restore-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Manual history",
  description: "Every version of the MPFFL league manual.",
};

// Public: the rulebook's history belongs to the league, not just the commissioner.
export default async function ManualVersionsPage({
  searchParams,
}: {
  searchParams: Promise<{ compare?: string }>;
}) {
  const { compare } = await searchParams;
  const [versions, owner] = await Promise.all([listManualVersions(), getSessionOwner()]);

  if (versions.length === 0) {
    return <EmptyState title="No versions yet" description="The manual hasn't been published." />;
  }

  const live = versions[0];
  const compareTo = compare ? Number(compare) : null;

  // Comparing a version shows what changed between it and the one before it.
  let diff = null;
  if (compareTo) {
    const idx = versions.findIndex((v) => v.version === compareTo);
    const previous = versions[idx + 1];
    if (idx !== -1 && previous) {
      const [a, b] = await Promise.all([
        prisma.manualVersion.findUnique({ where: { version: previous.version }, select: { doc: true } }),
        prisma.manualVersion.findUnique({ where: { version: compareTo }, select: { doc: true } }),
      ]);
      if (a && b) {
        const lines = diffText(docToPlainText(a.doc), docToPlainText(b.doc));
        diff = {
          from: previous.version,
          to: compareTo,
          stats: diffStats(lines),
          lines: collapseUnchanged(lines),
        };
      }
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manual history"
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/manual">Back to manual</Link>
          </Button>
        }
      />
      <p className="text-sm text-muted-foreground">
        Every edit is kept as its own version — {versions.length} in total, going back to{" "}
        {versions[versions.length - 1].createdAt.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        })}
        . Restoring an older version publishes it as a new one, so nothing is ever lost.
      </p>

      {diff && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/50 px-4 py-2.5">
            <h2 className="text-sm font-semibold">
              What changed in version {diff.to}{" "}
              <span className="font-normal text-muted-foreground">(vs. v{diff.from})</span>
            </h2>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-success">+{diff.stats.added} added</span>
              <span className="text-destructive">−{diff.stats.removed} removed</span>
              <Link href="/manual/versions" className="text-muted-foreground hover:underline">
                Close
              </Link>
            </div>
          </div>
          {diff.stats.added === 0 && diff.stats.removed === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No text changes — this version may differ only in formatting.
            </p>
          ) : (
            <div className="max-h-[32rem] overflow-y-auto p-4 text-sm">
              {diff.lines.map((line, i) =>
                line === "gap" ? (
                  <div key={i} className="my-2 border-t border-dashed" />
                ) : (
                  <p
                    key={i}
                    className={
                      line.kind === "added"
                        ? "border-l-2 border-success bg-success/10 px-2 py-1"
                        : line.kind === "removed"
                          ? "border-l-2 border-destructive bg-destructive/10 px-2 py-1 line-through opacity-70"
                          : "px-2 py-1 text-muted-foreground"
                    }
                  >
                    {line.text}
                  </p>
                )
              )}
            </div>
          )}
        </Card>
      )}

      <Card className="overflow-hidden">
        <ul className="divide-y">
          {versions.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <span className="w-14 shrink-0 font-mono text-sm font-semibold">v{v.version}</span>
              <span className="w-40 shrink-0 text-sm text-muted-foreground">
                {v.createdAt.toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
              <span className="min-w-0 flex-1 text-sm">
                {v.summary ?? <span className="text-muted-foreground">No summary</span>}
                {v.authorName && (
                  <span className="text-muted-foreground"> · {v.authorName}</span>
                )}
              </span>
              {v.version === live.version && <Badge variant="success">Live</Badge>}
              <div className="flex items-center gap-1">
                <Button variant="link" size="sm" asChild>
                  <Link href={`/manual/versions?compare=${v.version}#top`}>Changes</Link>
                </Button>
                {owner?.isCommissioner && v.version !== live.version && (
                  <RestoreButton version={v.version} />
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
