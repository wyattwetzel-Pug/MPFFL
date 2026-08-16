import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DesignationMark,
  ContractCell,
  PlayerLink,
  SalaryCell,
  ROSTER_COL,
} from "@/components/league/markers";
import type { RosterRow } from "@/lib/roster-display";

/** Read-only roster table, shared by the team page and anywhere else it's shown. */
export function RosterTable({ rows }: { rows: RosterRow[] }) {
  return (
    <Table className="sm:table-fixed">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={`w-10 text-center ${ROSTER_COL.num}`}>#</TableHead>
          <TableHead className={`text-center ${ROSTER_COL.pos}`}>POS</TableHead>
          <TableHead className={ROSTER_COL.player}>Player</TableHead>
          <TableHead className={`text-center ${ROSTER_COL.amount}`}>$</TableHead>
          <TableHead className={`text-center ${ROSTER_COL.contract}`}>Contract</TableHead>
          {/*
           * NFL team and bye week are the first things to go on a phone: a
           * nine-column table ran off the right edge, and these two are the
           * least load-bearing when you're checking a roster on the move.
           */}
          <TableHead className={`hidden text-center sm:table-cell ${ROSTER_COL.nfl}`}>NFL</TableHead>
          <TableHead className={`hidden text-center sm:table-cell ${ROSTER_COL.bye}`}>Bye</TableHead>
          <TableHead className="hidden sm:table-cell">Notes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={row.id} className={i % 2 === 1 ? "bg-muted/20" : ""}>
            <TableCell className="whitespace-nowrap text-center">
              <DesignationMark designation={row.designation} index={i} />
            </TableCell>
            <TableCell className="whitespace-nowrap text-center font-medium">
              {row.position}
            </TableCell>
            <TableCell className="whitespace-nowrap">
              <PlayerLink name={row.playerName} />
              {/* Still rostered, still paid for, but flagged inactive — so
                  they won't turn up in any picker. Say so rather than let it
                  look like a search that's broken. */}
              {row.playerInactive && (
                <span
                  className="ml-1.5 text-[11px] font-semibold uppercase text-muted-foreground"
                  title="Flagged inactive in the player database"
                >
                  inactive
                </span>
              )}
            </TableCell>
            <TableCell className="whitespace-nowrap text-center">
              <SalaryCell amount={row.salary} />
            </TableCell>
            <TableCell className="whitespace-nowrap text-center">
              <ContractCell season={row.contractEndSeason} backToBack={row.isBackToBack} />
            </TableCell>
            <TableCell className="hidden whitespace-nowrap text-center sm:table-cell">
              {row.nflTeam}
            </TableCell>
            <TableCell className="hidden whitespace-nowrap text-center text-muted-foreground sm:table-cell">
              {row.byeWeek ?? "—"}
            </TableCell>
            <TableCell className="hidden text-muted-foreground sm:table-cell">
              {row.notes ?? ""}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
