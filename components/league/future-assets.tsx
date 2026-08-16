import Link from "next/link";
import type { AssetType } from "@prisma/client";

type FutureEntry = {
  id: number;
  seasonYear: number;
  assetType: AssetType;
  amount: number;
  round: number | null;
  pickNumber: number | null;
  originTeamId: number | null;
  direction: string;
  transaction: { id: number };
};

/*
 * Assets a team holds — or owes — in seasons beyond the current one.
 *
 * Listed individually rather than netted, and each links to the transaction
 * that created it: when a pick turns up in a season three years out, the useful
 * question is which deal it came from.
 */
function describe(e: FutureEntry, teamNames: Map<number, string>, teamId: number): string {
  switch (e.assetType) {
    case "ROOKIE_PICK": {
      const ordinal = e.round === 1 ? "1st" : e.round === 2 ? "2nd" : null;
      const slot = e.pickNumber != null ? ` (${e.round}.${String(e.pickNumber).padStart(2, "0")})` : "";
      // "via" only tells you something when the pick started somewhere else.
      const origin =
        e.originTeamId && e.originTeamId !== teamId
          ? ` via ${teamNames.get(e.originTeamId) ?? "trade"}`
          : "";
      return ordinal
        ? `${e.seasonYear} ${ordinal} round pick${slot}${origin}`
        : `${e.seasonYear} rookie pick${slot}${origin}`;
    }
    case "CAP_DOLLARS":
      return `$${e.amount} of ${e.seasonYear} cap`;
    case "PS_SPOT":
      return `${e.amount} ${e.seasonYear} PS spot${e.amount === 1 ? "" : "s"}`;
    case "TOPPER_HOLDOVER":
      return `${e.seasonYear} topper/holdover`;
    case "CONDITIONAL_CUT":
      return `${e.seasonYear} conditional cut`;
    case "UNCONDITIONAL_CUT":
      return `${e.seasonYear} unconditional cut`;
    default:
      return `${e.seasonYear} asset`;
  }
}

export function FutureAssets({
  entries,
  teamNames,
  teamId,
}: {
  entries: FutureEntry[];
  teamNames: Map<number, string>;
  teamId: number;
}) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing held or owed beyond this season.
      </p>
    );
  }

  return (
    <ul className="space-y-1 text-sm">
      {entries.map((e) => (
        <li key={e.id} className="flex items-baseline gap-2">
          <span
            className={e.direction === "in" ? "text-success" : "text-destructive"}
            aria-label={e.direction === "in" ? "holds" : "owes"}
          >
            {e.direction === "in" ? "+" : "−"}
          </span>
          <Link
            href={`/transactions/${e.transaction.id}`}
            className="underline-offset-4 hover:text-primary hover:underline"
          >
            {describe(e, teamNames, teamId)}
          </Link>
        </li>
      ))}
    </ul>
  );
}
