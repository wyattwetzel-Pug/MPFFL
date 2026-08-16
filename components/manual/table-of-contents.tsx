"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { TocEntry } from "@/lib/manual/document";

/*
 * Sticky table of contents. The manual runs ~8,000 words across 30+ sections;
 * v1 gave readers no way to navigate it at all.
 */
export function TableOfContents({ entries }: { entries: TocEntry[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const headings = entries
      .map((e) => document.getElementById(e.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;

    // Highlight the heading nearest the top of the viewport.
    const observer = new IntersectionObserver(
      (records) => {
        const visible = records
          .filter((r) => r.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 }
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [entries]);

  if (entries.length === 0) return null;

  // Deep sub-headings make the list unreadable; top two levels are the outline.
  const minLevel = Math.min(...entries.map((e) => e.level));
  const shown = entries.filter((e) => e.level <= minLevel + 1);

  return (
    <nav aria-label="Table of contents" className="text-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Contents
      </p>
      <ul className="space-y-1 border-l">
        {shown.map((e) => (
          <li key={e.id}>
            <a
              href={`#${e.id}`}
              className={cn(
                "-ml-px block border-l py-0.5 pl-3 transition-colors hover:text-primary",
                e.level > minLevel && "pl-6 text-xs",
                activeId === e.id
                  ? "border-primary font-medium text-primary"
                  : "border-transparent text-muted-foreground"
              )}
            >
              {e.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
