import Link from "next/link";
import type { TeamAssets } from "@/lib/ledger/derive";

/*
 * A team's assets condensed to one line for the rosters page.
 *
 * Two labelled groups — this season's holdings, then anything owned in a later
 * season — because "2027 2nd" sitting beside "2026 picks" would otherwise read
 * as one list. Every value carries its own label: an unlabelled "1.11 1.13
 * 2.29" means nothing to someone who isn't already thinking about picks.
 *
 * Kept typographically quiet, because most visits to that page are people
 * scanning for players across teams and the rosters should stay the loudest
 * thing on it.
 */

/** Separates the labelled groups that share the strip's line. */
export function StripDivider() {
  return (
    <span aria-hidden className="select-none text-muted-foreground/30">
      |
    </span>
  );
}
export type FutureBrief = {
  seasonYear: number;
  assetType: string;
  amount: number;
  round: number | null;
  transactionId: number;
};

/** Short-form holding, e.g. "2027 2nd" or "$10 2028 cap". */
function briefFuture(e: FutureBrief): string {
  if (e.assetType === "ROOKIE_PICK") {
    const ord = e.round === 1 ? "1st" : e.round === 2 ? "2nd" : "pick";
    return `${e.seasonYear} ${ord}`;
  }
  if (e.assetType === "CAP_DOLLARS") return `$${e.amount} ${e.seasonYear} cap`;
  if (e.assetType === "PS_SPOT") return `${e.seasonYear} PS`;
  return `${e.seasonYear} asset`;
}

export function AssetStrip({
  assets,
  future,
  committed,
}: {
  assets: TeamAssets;
  future?: FutureBrief[];
  /** Every dollar already owed this season — contracts plus declared
   *  holdovers (PLAN §16.3) — for the Available figure. */
  committed?: number;
}) {
  const picks = [...assets.rookiePicks]
    .sort((a, b) => a.round - b.round || (a.pickNumber ?? 99) - (b.pickNumber ?? 99))
    .map((p) =>
      p.pickNumber
        ? `${p.round}.${String(p.pickNumber).padStart(2, "0")}`
        : p.round === 1
          ? "1st"
          : p.round === 2
            ? "2nd"
            : "pick"
    );

  /*
   * Cap is the allocation — $500 give or take dollars traded. Available is
   * what's left once contracts *and this season's holdovers* are paid: the
   * number an owner actually bids with. Subtracting only contracts made a
   * holdover look free — a real bug once shipped exactly that way.
   */
  const stats: [string, string][] = [
    ["Cap", `$${assets.capDollars}`],
    ...(committed != null
      ? ([["Available", `$${assets.capDollars - committed}`]] as [string, string][])
      : []),
    ["PS", String(assets.psSpots)],
    ["CCut", String(assets.conditionalCuts)],
    // Zeros stay visible: every team carries the same six terms in the same
    // order, so the strip can be scanned down the page as a column.
    ["UCut", String(assets.unconditionalCuts)],
    ["T/H", String(assets.topperHoldovers)],
    /*
     * Named toppers are listed, not counted. "Toppers: 1" would be useless —
     * the whole asset is *which player*, and a topper on Jeanty and a topper on
     * a seventh-rounder are not the same holding. Kept out of the T/H count for
     * the same reason: that one is spendable on anybody, this one isn't.
     */
    ...(assets.namedToppers.length > 0
      ? ([
          [
            "Toppers",
            assets.namedToppers.map((t) => t.playerName ?? `#${t.playerId}`).join(", "),
          ],
        ] as [string, string][])
      : []),
    ["RPs", picks.length > 0 ? picks.join(", ") : "none"],
  ];

  const futures = future ?? [];

  /*
   * A fragment, not a container. As a nested flex box this wrapped as a single
   * unit, breaking the line at the container boundary rather than where the
   * screen actually ran out of room.
   */
  return (
    <>
      <span className="whitespace-nowrap">{assets.seasonYear} Assets:</span>
      {stats.map(([label, value]) => (
        <span key={label} className="whitespace-nowrap">
          {label}: <span className="font-medium text-foreground/80">{value}</span>
        </span>
      ))}
      {futures.length > 0 && (
        <>
          <StripDivider />
          <span className="whitespace-nowrap">
            Future Assets:{" "}
            {/* Each links to the trade that produced it — the provenance is
                the whole reason a future asset is believable. */}
            {futures.map((e, i) => (
              <span key={e.transactionId + "-" + i}>
                {i > 0 && ", "}
                <Link
                  href={`/transactions/${e.transactionId}`}
                  className="font-medium text-foreground/80 underline-offset-4 hover:text-primary hover:underline"
                >
                  {briefFuture(e)}
                </Link>
              </span>
            ))}
          </span>
        </>
      )}
    </>
  );
}
