import type { Metadata } from "next";
import Link from "next/link";
import { Edit, History } from "lucide-react";
import { getCurrentManual } from "@/lib/manual/queries";
import { getSessionOwner } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ManualContent } from "@/components/manual/manual-content";
import { TableOfContents } from "@/components/manual/table-of-contents";
import { PrintButton } from "@/components/manual/print-button";
import { ManualTabs } from "@/components/manual-tabs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "League Manual",
  description: "The rules of the MPFFL fantasy football league.",
};

// Public: anyone can read the rules without signing in.
export default async function ManualPage() {
  const [manual, owner] = await Promise.all([getCurrentManual(), getSessionOwner()]);

  if (!manual) {
    return (
      <EmptyState
        title="No manual yet"
        description="The league manual hasn't been published."
        action={
          owner?.isCommissioner ? (
            <Button asChild>
              <Link href="/manual/edit">Create the first version</Link>
            </Button>
          ) : undefined
        }
      />
    );
  }

  const updated = manual.createdAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-6">
      <div className="no-print"><ManualTabs active="manual" /></div>
      <div className="no-print flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{manual.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Version {manual.version} · Updated {updated}
            {manual.authorName && ` by ${manual.authorName}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/manual/versions">
              <History /> History
            </Link>
          </Button>
          {owner?.isCommissioner && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/manual/edit">
                <Edit /> Edit
              </Link>
            </Button>
          )}
          <PrintButton />
        </div>
      </div>

      <div className="gap-10 lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="no-print hidden lg:block">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pb-8">
            <TableOfContents entries={manual.toc} />
          </div>
        </aside>
        <article>
          <ManualContent html={manual.html} />
        </article>
      </div>
    </div>
  );
}
