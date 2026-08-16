"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, TYPE_LABEL } from "@/components/league/transaction-entry-list";
import type { TransactionStatus, TransactionType } from "@prisma/client";

/*
 * The transaction feed, with search.
 *
 * Filtering happens on what's already rendered rather than round-tripping to
 * the server: people scan this page for "the Kamara trade" and want the list to
 * narrow as they type, the way the rosters search does.
 */
export type FeedItem = {
  id: number;
  type: TransactionType;
  status: TransactionStatus;
  createdAt: string;
  teams: string[];
  entries: string[];
  /** Who receives what. Empty when nothing has a destination — a cut, an expiry. */
  sides: { team: string; gets: string[] }[];
  /**
   * Set only for a record-only adjustment — a commissioner's correction that
   * moves no asset. With no entries there is nothing else on the card, so the
   * note is shown here rather than one click away.
   */
  note?: string | null;
  /**
   * Action-phrased headline for single-actor types ("Held over Zay Flowers
   * (WR) for $46"). Null falls back to the sides / flat entry rendering.
   */
  summary?: string[] | null;
};

export function TransactionFeed({ transactions }: { transactions: FeedItem[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return transactions;
    // Every word must appear somewhere, so "kamara horse" narrows rather than widens.
    const words = q.split(/\s+/);
    return transactions.filter((t) => {
      const hay = [
        ...t.teams,
        ...t.entries,
        ...(t.summary ?? []),
        t.note ?? "",
        TYPE_LABEL[t.type],
        t.createdAt,
      ]
        .join(" ")
        .toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [query, transactions]);

  return (
    <div className="space-y-3">
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search teams, players, assets…"
        aria-label="Search transactions"
      />

      {query && (
        <p className="text-sm text-muted-foreground">
          {filtered.length} of {transactions.length} shown
        </p>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          title="Nothing matches"
          description={query ? "Try fewer words." : "Try clearing the filters."}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => {
            // The league-wide allocation touches all sixteen teams; naming them
            // all would drown the feed in a wall of bold text. Between three
            // and four, " ↔ " would falsely read as a chain — say what it is.
            const teamLine =
              t.teams.length > 4
                ? `${t.teams.length} teams`
                : t.teams.length > 2
                  ? `${t.teams.length}-team trade · ${t.teams.join(", ")}`
                  : t.teams.join(" ↔ ");
            const shown = t.entries.slice(0, 8);
            /*
             * Sides are worth showing for a deal between a few teams. One side
             * — a waiver claim, an allocation to a single team — reads better
             * flat, and the league-wide March allocation touches sixteen, which
             * as sixteen "gets" lines would bury the feed. Same threshold the
             * team line uses above, so the two never disagree.
             */
            const twoWay = t.sides.length >= 2 && t.sides.length <= 4;
            return (
              <Card key={t.id} className="overflow-hidden">
                {/*
                 * Teams first, assets second, bookkeeping last. People arrive
                 * here looking for "the Kamara trade" or "what did Horse &
                 * Pepper do" — not for a transaction type.
                 */}
                <Link
                  href={`/transactions/${t.id}`}
                  className="block px-4 py-3 transition-colors hover:bg-muted/30"
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="text-base font-bold tracking-tight">
                      {teamLine || TYPE_LABEL[t.type]}
                    </span>
                    <StatusBadge status={t.status} />
                  </div>

                  {t.summary?.length ? (
                    // The action in a sentence — what happened and for how much.
                    <ul className="mt-1 space-y-0.5 text-sm font-medium text-foreground/90">
                      {t.summary.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  ) : twoWay ? (
                    <ul className="mt-1.5 space-y-1">
                      {t.sides.map((side) => (
                        <li key={side.team} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                          <span className="font-medium text-foreground">{side.team}</span>
                          <span className="text-xs text-muted-foreground">gets</span>
                          <span className="font-medium text-foreground/90">
                            {side.gets.slice(0, 6).join(" · ")}
                            {side.gets.length > 6 && (
                              <span className="text-muted-foreground">
                                {" "}
                                · +{side.gets.length - 6} more
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    (shown.length === 0 && t.note ? (
                      // Nothing moved, so the note carries the whole record.
                      <p className="mt-1 line-clamp-3 text-sm text-foreground/80">{t.note}</p>
                    ) : (
                      shown.length > 0 && (
                      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm font-medium text-foreground/90">
                        {shown.map((e, i) => (
                          <li key={i}>
                            {i > 0 && <span className="mr-3 text-muted-foreground/70">·</span>}
                            {e}
                          </li>
                        ))}
                        {t.entries.length > 8 && (
                          <li className="text-muted-foreground">
                            <span className="mr-3 text-muted-foreground/70">·</span>+
                            {t.entries.length - 8} more
                          </li>
                        )}
                      </ul>
                      )
                    ))
                  )}

                  <div className="mt-1.5 text-xs text-muted-foreground">
                    {TYPE_LABEL[t.type]} #{t.id} · {t.createdAt}
                  </div>
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
