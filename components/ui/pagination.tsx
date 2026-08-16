import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Server-rendered pagination. Always states the full total so a page of
 * results can never be mistaken for the whole set.
 */

function pageList(page: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const pages = new Set<number>([1, pageCount, page, page - 1, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  pathname,
  hash,
  params = {},
  itemLabel = "results",
  className,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  pathname: string;
  /** Anchor to jump to, so paging a section doesn't scroll back to the top. */
  hash?: string;
  params?: Record<string, string | undefined>;
  itemLabel?: string;
  className?: string;
}) {
  if (total === 0) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    const suffix = hash ? `#${hash}` : "";
    return (qs ? `${pathname}?${qs}` : pathname) + suffix;
  };

  const stepClass =
    "inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-sm transition-colors hover:bg-accent";
  const disabledClass = "pointer-events-none opacity-40";

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <p className="text-sm text-muted-foreground">
        Showing <span className="font-medium text-foreground">{first}–{last}</span> of{" "}
        <span className="font-medium text-foreground">{total}</span> {itemLabel}
      </p>

      {pageCount > 1 && (
        <nav className="flex items-center gap-1" aria-label="Pagination">
          <Link
            href={href(page - 1)}
            className={cn(stepClass, page <= 1 && disabledClass)}
            aria-disabled={page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" aria-hidden /> Prev
          </Link>

          {pageList(page, pageCount).map((p, i) =>
            p === "gap" ? (
              <span key={`gap-${i}`} className="px-1 text-sm text-muted-foreground">
                …
              </span>
            ) : (
              <Link
                key={p}
                href={href(p)}
                aria-current={p === page ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm transition-colors",
                  p === page
                    ? "border-transparent bg-primary font-semibold text-primary-foreground"
                    : "hover:bg-accent"
                )}
              >
                {p}
              </Link>
            )
          )}

          <Link
            href={href(page + 1)}
            className={cn(stepClass, page >= pageCount && disabledClass)}
            aria-disabled={page >= pageCount}
            aria-label="Next page"
          >
            Next <ChevronRight className="size-4" aria-hidden />
          </Link>
        </nav>
      )}
    </div>
  );
}
