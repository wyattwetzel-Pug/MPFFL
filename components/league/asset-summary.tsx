import { Card, CardContent } from "@/components/ui/card";
import type { TeamAssets } from "@/lib/ledger/derive";
import { cn } from "@/lib/utils";
import { SALARY_CAP } from "@/lib/constants";

/*
 * A team's holdings for a season. Every number here is derived from the ledger
 * at read time — none of it is stored, so it cannot drift from the transactions
 * that produced it.
 */
export function AssetSummary({
  assets,
  teamNames,
  future,
}: {
  assets: TeamAssets;
  teamNames: Map<number, string>;
  future?: React.ReactNode;
}) {
  const stats = [
    { label: "Cap space", value: `$${assets.capDollars}`, note: `of $${SALARY_CAP}` },
    { label: "PS spots", value: assets.psSpots },
    { label: "Conditional cuts", value: assets.conditionalCuts },
    { label: "Unconditional cuts", value: assets.unconditionalCuts },
    { label: "Toppers / holdovers", value: assets.topperHoldovers },
  ];

  const picks = [...assets.rookiePicks].sort(
    (a, b) => a.round - b.round || (a.pickNumber ?? 99) - (b.pickNumber ?? 99)
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-3">
              <div className="text-xl font-bold">{s.value}</div>
              <div className="text-xs text-muted-foreground">
                {s.label}
                {s.note && <span className="ml-1 opacity-70">{s.note}</span>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/*
        Named toppers get their own card rather than a number in the grid: the
        asset *is* which player, so a count would say nothing. Only shown when
        there are any — an empty "Toppers" card on fifteen team pages is noise.
      */}
      {assets.namedToppers.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Topped rookies
            </div>
            <ul className="flex flex-wrap gap-2 text-sm">
              {assets.namedToppers.map((t) => (
                <li key={t.playerId} className="rounded-md border px-2 py-1">
                  <span className="font-medium">{t.playerName ?? `Player #${t.playerId}`}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    top at the auction
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Picks take the full width unless there's something to sit beside. */}
      <div className={cn("grid gap-2", future && "lg:grid-cols-2")}>
        <Card>
        <CardContent className="p-3">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {assets.seasonYear} rookie picks
          </div>
          {picks.length === 0 ? (
            <p className="text-sm text-muted-foreground">None — both traded away.</p>
          ) : (
            <ul className="flex flex-wrap gap-2 text-sm">
              {picks.map((p, i) => {
                // Before the cage matches resolve standings, a pick is known only
                // by its round and whose it is — which is how they're traded.
                const label = p.pickNumber
                  ? `${p.round}.${String(p.pickNumber).padStart(2, "0")}`
                  : `Round ${p.round}`;
                const origin =
                  p.originTeamId && p.originTeamId !== assets.teamId
                    ? teamNames.get(p.originTeamId) ?? "another team"
                    : null;
                return (
                  <li key={i} className="rounded-md border px-2 py-1">
                    <span className="font-medium">{label}</span>
                    {origin && (
                      <span className="ml-1.5 text-xs text-muted-foreground">via {origin}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

        {future && (
          <Card>
            <CardContent className="p-3">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Future assets
              </div>
              {future}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
