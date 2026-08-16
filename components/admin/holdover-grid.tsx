"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { setHoldoverRate } from "@/lib/actions/holdover-actions";

/*
 * The rate grid: every pick against every position.
 *
 * A grid rather than a form, because nobody edits one of these in isolation —
 * a rate only makes sense next to the ones above and beside it. Cells save on
 * blur, like the rest of our settings.
 */
export type Cell = { pickNumber: number; position: string; amount: number };

function RateCell({ cell }: { cell: Cell }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState(String(cell.amount));
  const [error, setError] = useState(false);

  const commit = () => {
    const n = Number(value);
    if (n === cell.amount) return;
    if (!Number.isInteger(n) || n < 0) return setError(true);
    start(async () => {
      const res = await setHoldoverRate(cell.pickNumber, cell.position, n);
      setError(!res.ok);
    });
  };

  return (
    <Input
      type="number"
      min={0}
      value={value}
      disabled={pending}
      aria-label={`Pick ${cell.pickNumber} ${cell.position}`}
      onChange={(e) => { setValue(e.target.value); setError(false); }}
      onBlur={commit}
      className={`h-8 w-16 px-1.5 text-center tabular-nums ${error ? "border-destructive" : ""}`}
    />
  );
}

export function HoldoverGrid({
  positions,
  rows,
}: {
  positions: string[];
  rows: { pickNumber: number; cells: Cell[] }[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-sm">
        <thead>
          <tr className="border-b">
            <th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Pick
            </th>
            {positions.map((p) => (
              <th key={p} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.pickNumber}>
              {/* Round boundary marked, since 1.xx and 2.xx price differently. */}
              <td className="px-2 py-1 text-center font-medium tabular-nums">
                {r.pickNumber <= 16 ? `1.${String(r.pickNumber).padStart(2, "0")}` : `2.${String(r.pickNumber - 16).padStart(2, "0")}`}
              </td>
              {r.cells.map((c) => (
                <td key={c.position} className="px-1 py-1 text-center">
                  <RateCell cell={c} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
