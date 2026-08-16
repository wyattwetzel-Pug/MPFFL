import { requireCommissioner } from "@/lib/auth";
import { currentSeason } from "@/lib/constants";
import { clearProposal, clearStatus } from "@/lib/auction/clear";
import { milestone } from "@/lib/calendar";
import { formatLeagueDateTime } from "@/lib/tz";
import { PageHeader } from "@/components/ui/page-header";
import { ClearPanel } from "@/components/admin/clear-panel";

export const dynamic = "force-dynamic";

/*
 * The pre-auction roster clear.
 *
 * The rule proposes; the commissioner reads and confirms. Everything on this
 * page is derived fresh on load — who clears, who stays, and why, per team —
 * so what's shown is exactly what the button would do. After it runs, the
 * same page shows each team's clear transaction and a per-team restore,
 * because the ledger is the backup: reverting one team's transaction brings
 * that roster back alone.
 */
export default async function AuctionPrepPage() {
  await requireCommissioner();
  const season = currentSeason();

  const [proposal, status, auction] = await Promise.all([
    clearProposal(season),
    clearStatus(season),
    milestone("AUCTION", season),
  ]);

  const totals = {
    clears: proposal.reduce((n, t) => n + t.clears.length, 0),
    keeps: proposal.reduce((n, t) => n + t.keeps.length, 0),
    salary: proposal.reduce((n, t) => n + t.clearedSalary, 0),
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Auction prep" />
      <p className="-mt-2 text-sm text-muted-foreground">
        Auction: {formatLeagueDateTime(auction.at)}. The clear runs shortly before it —
        after the rookie draft, before declarations open. Every player without a live
        contract returns to the pool; contracts through {season}{" "}
        or beyond and this year&apos;s slow-draft holdovers stay. There is no separate backup: each team&apos;s
        clear is a transaction, and restoring a team is reverting it.
      </p>
      <ClearPanel proposal={proposal} status={status} totals={totals} season={season} />
    </div>
  );
}
