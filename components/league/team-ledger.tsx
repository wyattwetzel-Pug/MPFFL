import Link from "next/link";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  EntryLine,
  StatusBadge,
  TYPE_LABEL,
  type EntryView,
} from "@/components/league/transaction-entry-list";
import { describeEntry } from "@/components/league/transaction-entry-list";
import type { LedgerPage, LedgerRow } from "@/lib/ledger/queries";

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * v1 often stored a transaction's note and its entry label as the same string,
 * so showing both repeats the line verbatim. Only show a note that adds
 * something the entries don't already say.
 */
function noteAddsSomething(row: LedgerRow): boolean {
  if (!row.note) return false;
  const note = normalize(row.note);
  const shown = [...row.incoming, ...row.outgoing].map((e) =>
    normalize(describeEntry(e as never))
  );
  if (shown.some((line) => line === note || line.includes(note) || note.includes(line))) {
    return false;
  }
  return true;
}

/*
 * A team's transactions in reverse chronological order, each showing what the
 * team received and gave up. Entries that don't currently count — pending
 * approval, or an unsettled condition — are muted rather than hidden, so the
 * page shows the whole picture rather than only the settled part.
 */
export function TeamLedger({ page }: { page: LedgerPage }) {
  const rows = page.rows;
  if (rows.length === 0) {
    return <EmptyState title="No transactions yet" />;
  }

  return (
    <div className="space-y-2">
      {rows.map((row: LedgerRow) => (
        <Card key={row.id} className={row.counts ? "" : "border-dashed opacity-75"}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/transactions/${row.id}`} className="font-medium hover:underline">
                {TYPE_LABEL[row.type]}
                {row.type !== "ALLOCATION" && row.counterparties.length > 0 && (
                  <span className="font-normal"> with {row.counterparties.join(", ")}</span>
                )}
              </Link>
              <StatusBadge status={row.status} />
              <span className="text-sm text-muted-foreground">
                {row.createdAt.toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
            {row.submittedBy && (
              <span className="text-xs text-muted-foreground">filed by {row.submittedBy}</span>
            )}
          </div>

          {row.type !== "TRADE" ? (
            <div className="px-4 py-3 text-sm">
              <ul className="space-y-0.5">
                {/*
                  Some entries record a move within a single team — pulling a
                  player off the practice squad, say — so they appear in both
                  directions. Show each entry once.
                */}
                {[
                  ...new Map(
                    [...row.outgoing, ...row.incoming].map((e) => [e.id, e])
                  ).values(),
                ].map((e: LedgerRow["incoming"][number]) => (
                  <EntryLine key={e.id} entry={e as unknown as EntryView} />
                ))}
              </ul>
            </div>
          ) : (
          <div className="grid gap-4 px-4 py-3 text-sm sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-success">
                Received
              </div>
              {row.incoming.length === 0 ? (
                <p className="text-muted-foreground">—</p>
              ) : (
                <ul className="space-y-0.5">
                  {row.incoming.map((e: LedgerRow["incoming"][number]) => (
                    <EntryLine key={e.id} entry={e as unknown as EntryView} />
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-destructive">
                Sent
              </div>
              {row.outgoing.length === 0 ? (
                <p className="text-muted-foreground">—</p>
              ) : (
                <ul className="space-y-0.5">
                  {row.outgoing.map((e: LedgerRow["outgoing"][number]) => (
                    <EntryLine key={e.id} entry={e as unknown as EntryView} />
                  ))}
                </ul>
              )}
            </div>
          </div>
          )}
          {noteAddsSomething(row) && (
            <p className="border-t px-4 py-2 text-sm text-muted-foreground">{row.note}</p>
          )}
        </Card>
      ))}
    </div>
  );
}
