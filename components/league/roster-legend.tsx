import { cn } from "@/lib/utils";
import { currentSeason } from "@/lib/constants";
import { StripDivider } from "@/components/league/asset-strip";

/**
 * The roster table uses three marks that mean nothing without explanation.
 * Shown wherever a roster is rendered.
 *
 * `assets` adds the asset-strip abbreviations, which only earn their space on
 * the rosters page — the team page spells those out in full on its cards.
 */
export function RosterLegend({
  className,
  assets = false,
}: {
  className?: string;
  assets?: boolean;
}) {
  return (
    <p className={cn("flex flex-wrap gap-x-3 gap-y-1 text-[11px] leading-relaxed text-muted-foreground", className)}>
      <span>
        <span className="font-semibold text-ir">IR</span> injured reserve
      </span>
      <span>
        <span className="font-semibold text-ps">PS</span> practice squad
      </span>
      <span>
        <span className="text-b2b">*</span> 2 consecutive contracts
      </span>
      {assets && (
        <>
          <StripDivider />
          <span>
            <span className="font-semibold text-foreground/80">CCut</span> conditional cut
          </span>
          <span>
            <span className="font-semibold text-foreground/80">UCut</span> unconditional cut
          </span>
          <span>
            <span className="font-semibold text-foreground/80">T/H</span> topper / holdover
          </span>
          <span>
            <span className="font-semibold text-foreground/80">RPs</span> rookie picks
          </span>
        </>
      )}
    </p>
  );
}

/**
 * Roster totals.
 *
 * Spend and contracted are genuinely different figures: every player's salary
 * counts against the cap this year, but only players on multi-year deals carry
 * their salary into future seasons. Reporting one number for both invites
 * reading a team's committed future money as its current spend.
 */
export function rosterSummary(
  rows: { salary: number; contractEndSeason: number | null; acquiredForSeason?: number | null }[]
) {
  /*
   * The current league year counts, along with every year beyond it. Contracts
   * that ended in a prior year are spent — the league year rolls over on March
   * 1st, so by the time anyone reads this those players are already gone.
   *
   * Committed adds this season's uncontracted money — declared holdovers,
   * auction wins — per PLAN §16.3: the roster spot is the cap commitment,
   * so "Available" has to subtract it or a $60 holdover looks free.
   */
  const contracted = rows.filter(
    (r) => r.contractEndSeason != null && r.contractEndSeason >= currentSeason()
  );
  const holdovers = rows.filter(
    (r) => r.contractEndSeason == null && r.acquiredForSeason === currentSeason()
  );
  return {
    players: rows.length,
    contracts: contracted.length,
    spend: rows.reduce((sum, r) => sum + r.salary, 0),
    contracted: contracted.reduce((sum, r) => sum + r.salary, 0),
    committed:
      contracted.reduce((sum, r) => sum + r.salary, 0) +
      holdovers.reduce((sum, r) => sum + r.salary, 0),
  };
}
