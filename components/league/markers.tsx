import * as React from "react";
import { cn } from "@/lib/utils";
import { fantasyProsUrl } from "@/lib/roster-display";

/*
 * League-domain marks, matching v1's roster visuals exactly:
 * IR blue / PS green in the # column; red asterisk on back-to-back contracts.
 */

function DesignationMark({
  designation,
  index,
  className,
}: {
  designation: "ACTIVE" | "IR" | "PS";
  index: number;
  className?: string;
}) {
  if (designation === "IR")
    return (
      <span className={cn("font-semibold text-ir", className)} title="Injured Reserve">
        IR
      </span>
    );
  if (designation === "PS")
    return (
      <span className={cn("font-semibold text-ps", className)} title="Practice Squad">
        PS
      </span>
    );
  return <span className={className}>{index + 1}</span>;
}

/*
 * Contract year, with the back-to-back asterisk taken out of the flow.
 *
 * In flow it widened the cell and shunted the year off centre, so a column of
 * years read as ragged whenever one of them was a second consecutive contract.
 */
function ContractCell({ season, backToBack }: { season: number | null; backToBack: boolean }) {
  return (
    <span className="relative inline-block">
      {season ?? "-"}
      {season != null && backToBack && (
        <span
          className="absolute left-full top-0 ml-1 text-b2b"
          title="2 consecutive contracts"
        >
          *
        </span>
      )}
    </span>
  );
}

/*
 * Shared column widths. The rosters page stacks sixteen separate tables, and
 * with auto layout each one sized its columns to its own longest player name —
 * so scrolling down the page made the columns jump sideways. Fixed only from
 * `sm` up; narrow screens still need auto layout to fit at all.
 */
const ROSTER_COL = {
  num: "sm:w-10",
  pos: "sm:w-24",
  player: "sm:w-64",
  amount: "sm:w-20",
  contract: "sm:w-24",
  nfl: "sm:w-16",
  bye: "sm:w-14",
  // Notes takes the slack. Giving it to Player instead opens a gap in the
  // middle of the table; here the spare width reads as a right-hand margin.
  notes: "",
} as const;

/* Player name → FantasyPros, styled like v1 */
function PlayerLink({ name, className }: { name: string; className?: string }) {
  return (
    <a
      href={fantasyProsUrl(name)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("font-medium text-primary underline-offset-4 hover:underline", className)}
    >
      {name}
    </a>
  );
}

function SalaryCell({ amount }: { amount: number }) {
  return <>${amount}</>;
}

export { DesignationMark, ContractCell, PlayerLink, SalaryCell, ROSTER_COL };
