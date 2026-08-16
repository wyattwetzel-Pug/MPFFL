import { Badge } from "@/components/ui/badge";
import type { AssetType, TransactionStatus, TransactionType } from "@prisma/client";

/*
 * Shared rendering for what moved in a transaction, so the league feed, the
 * team ledger and the detail page describe an asset the same way everywhere.
 */

export type EntryView = {
  id: number;
  assetType: AssetType;
  seasonYear: number;
  amount: number;
  round: number | null;
  pickNumber: number | null;
  label: string | null;
  isContingent: boolean;
  resolvedAt: Date | null;
  player: { name: string; position: string } | null;
  fromTeam: { name: string; abbreviation: string } | null;
  toTeam: { name: string; abbreviation: string } | null;
};

export function describeEntry(e: EntryView): string {
  switch (e.assetType) {
    case "PLAYER":
      return e.player ? `${e.player.name} (${e.player.position})` : "a player";
    case "CAP_DOLLARS":
      return `$${e.amount} of ${e.seasonYear} cap`;
    case "ROOKIE_PICK": {
      // A first is a different asset from a second, so always say which.
      // The exact slot only exists once the cage matches settle standings.
      const ordinal = e.round === 1 ? "1st" : e.round === 2 ? "2nd" : null;
      const slot =
        e.pickNumber != null ? ` (${e.round ?? "?"}.${String(e.pickNumber).padStart(2, "0")})` : "";
      return ordinal
        ? `${e.seasonYear} ${ordinal} round pick${slot}`
        : `${e.seasonYear} rookie pick${slot}`;
    }
    case "PS_SPOT":
      return `${e.amount} ${e.seasonYear} PS spot${e.amount === 1 ? "" : "s"}`;
    case "CONDITIONAL_CUT":
      return `${e.amount} conditional cut${e.amount === 1 ? "" : "s"}`;
    case "UNCONDITIONAL_CUT":
      return `${e.amount} unconditional cut${e.amount === 1 ? "" : "s"}`;
    case "TOPPER_HOLDOVER":
      /*
       * Two different assets share this type. With a player attached it's a
       * named topper — the right to top *that* player at the auction — and the
       * player is the whole story: "1 topper/holdover" under a draft pick told
       * nobody who was actually topped. Without one it's the spendable,
       * anybody-flavoured right.
       */
      return e.player
        ? `topper on ${e.player.name} (${e.player.position})`
        : `${e.amount} topper/holdover`;
    default:
      return e.label ?? "other consideration";
  }
}

/*
 * The feed headline, per type: the action and the money, in a sentence.
 * "Zay Flowers (WR)" under a declaration told nobody she was held over or
 * for how much. Null means the type has no
 * better story than its entries — trades keep the who-gets-what sides view,
 * allocations keep the flat list.
 */
export function summarizeTransaction(type: TransactionType, entries: EntryView[]): string[] | null {
  const players = entries.filter((e) => e.assetType === "PLAYER" && e.player);
  const p0 = players[0];
  const pname = (e: EntryView) => `${e.player!.name} (${e.player!.position})`;
  const caps = entries.filter((e) => e.assetType === "CAP_DOLLARS");
  const capText = caps.map((c) => `$${c.amount} of ${c.seasonYear} cap`).join(" + ");
  const thSpent = entries.some((e) => e.assetType === "TOPPER_HOLDOVER" && !e.player && e.fromTeam);
  const named = entries.find((e) => e.assetType === "TOPPER_HOLDOVER" && e.player);
  // Prices sometimes live only in the label ("Held over for $10").
  const labelPrice = (e: EntryView) => e.label?.match(/\$\d+/)?.[0] ?? null;

  switch (type) {
    case "AUCTION_DECLARATION":
      if (p0)
        return [`Held over ${pname(p0)} for $${p0.amount}${thSpent ? " — T/H right spent" : ""}`];
      if (named)
        return [`Topper declared on ${pname(named)}${thSpent ? " — T/H right spent" : ""}`];
      return null;
    case "CONDITIONAL_CUT": {
      if (!p0) return null;
      const n = entries.filter((e) => e.assetType === "CONDITIONAL_CUT").reduce((s, e) => s + e.amount, 0) || players.length;
      return [
        `Cut ${players.map(pname).join(", ")} — ${capText ? `${capText} paid` : "salary paid from cap"}, ${n} conditional cut${n === 1 ? "" : "s"} used`,
      ];
    }
    case "UNCONDITIONAL_CUT": {
      if (!p0) return null;
      const n = entries.filter((e) => e.assetType === "UNCONDITIONAL_CUT").reduce((s, e) => s + e.amount, 0) || players.length;
      return [
        `Cut ${players.map(pname).join(", ")} — contract${players.length === 1 ? "" : "s"} ended, ${n} unconditional cut${n === 1 ? "" : "s"} used`,
      ];
    }
    case "WAIVER":
      return p0 ? [`Waived ${players.map(pname).join(", ")}${capText ? ` — buyout ${capText}` : ""}`] : null;
    case "AUCTION_WIN":
      return p0
        ? [`Won ${pname(p0)} for $${p0.amount}${thSpent || named ? " — topper exercised" : ""}`]
        : null;
    case "AUCTION_CLEAR": {
      const sum = players.reduce((s, e) => s + e.amount, 0);
      return players.length
        ? [`${players.length} player${players.length === 1 ? "" : "s"} returned to the auction pool ($${sum} expiring salary)`]
        : null;
    }
    case "ROOKIE_PICK_SELECTION": {
      const pick = entries.find((e) => e.assetType === "ROOKIE_PICK");
      const pickLabel = pick?.label?.replace(/ exercised$/i, "") ?? "a rookie pick";
      if (p0) {
        const price = labelPrice(p0);
        return [`Held over ${pname(p0)}${price ? ` for ${price}` : ""} — ${pickLabel}`];
      }
      if (named) return [named.label ?? `Topper on ${pname(named)} — ${pickLabel}`];
      return null;
    }
    default:
      return null;
  }
}

export const TYPE_LABEL: Record<TransactionType, string> = {
  TRADE: "Trade",
  WAIVER: "Waiver",
  CONDITIONAL_CUT: "Conditional cut",
  UNCONDITIONAL_CUT: "Unconditional cut",
  ROOKIE_PICK_SELECTION: "Rookie pick",
  AUCTION_WIN: "Auction win",
  AUCTION_CLEAR: "Auction clear",
  AUCTION_DECLARATION: "Auction declaration",
  ALLOCATION: "Allocation",
  ADJUSTMENT: "Adjustment",
  OTHER: "Other",
};

/** "Rosters Updated" rather than "Approved" — that's what it actually means. */
export const STATUS_LABEL: Record<TransactionStatus, string> = {
  SUBMITTED: "Submitted",
  APPROVED: "Rosters Updated",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
  WITHDRAWN: "Cancelled",
};

/*
 * Approved and completed are the overwhelming majority, so they stay quiet —
 * a badge louder than the team names buries the thing people came to find.
 * Colour is reserved for the statuses that actually want attention.
 */
const STATUS_VARIANT: Record<TransactionStatus, "default" | "outline" | "secondary" | "success" | "warning" | "destructive"> = {
  SUBMITTED: "warning",
  APPROVED: "outline",
  COMPLETED: "outline",
  REJECTED: "destructive",
  WITHDRAWN: "secondary",
};

export function StatusBadge({ status }: { status: TransactionStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function EntryLine({ entry }: { entry: EntryView }) {
  const pending = entry.isContingent && !entry.resolvedAt;
  return (
    <li className={pending ? "text-muted-foreground" : undefined}>
      {describeEntry(entry)}
      {pending && (
        <Badge variant="warning" className="ml-2 align-middle">
          conditional
        </Badge>
      )}
      {entry.isContingent && entry.resolvedAt && entry.amount === 0 && (
        <span className="ml-2 text-xs">— condition not met</span>
      )}
    </li>
  );
}
