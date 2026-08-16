"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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
import Link from "next/link";
import { AssetStrip, StripDivider, type FutureBrief } from "@/components/league/asset-strip";
import { RosterLegend, rosterSummary } from "@/components/league/roster-legend";
import type { TeamAssets } from "@/lib/ledger/derive";
import {
  defaultRosterSort,
  POSITION_ORDER,
  type RosterRow,
  type TeamRosterData,
} from "@/lib/roster-display";

type SortColumn = "position" | "player" | "amount" | "contract";
type SortState = { column: SortColumn; direction: "asc" | "desc" } | null;

export function RostersView({
  teams,
  assets,
  future,
}: {
  teams: TeamRosterData[];
  assets: Record<number, TeamAssets>;
  future: Record<number, FutureBrief[]>;
}) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return teams;
    return teams
      .map((t) => ({
        ...t,
        rows: t.rows.filter((r) => r.playerName.toLowerCase().includes(q)),
      }))
      .filter((t) => t.rows.length > 0);
  }, [teams, q]);

  function toggle(teamId: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Player search"
          aria-label="Player search"
          className="h-10 flex-1 basis-64"
        />
        <Button variant="secondary" size="lg" asChild>
          <a href="/api/rosters/csv" download>
            <Download /> Download CSV
          </a>
        </Button>
      </div>

      {filtered.length > 0 && <RosterLegend className="px-1" assets />}

      {filtered.length === 0 ? (
        <EmptyState
          title="No players match"
          description={`No rostered player matches "${query}".`}
        />
      ) : (
        filtered.map((team) => (
          <TeamSection
            key={team.teamId}
            team={team}
            assets={assets[team.teamId]}
            future={future[team.teamId]}
            collapsed={!q && collapsed.has(team.teamId)}
            onToggle={() => toggle(team.teamId)}
          />
        ))
      )}
    </div>
  );
}

function TeamSection({
  team,
  assets,
  future,
  collapsed,
  onToggle,
}: {
  team: TeamRosterData;
  assets?: TeamAssets;
  future?: FutureBrief[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  const [sort, setSort] = useState<SortState>(null);

  function clickHeader(column: SortColumn) {
    setSort((prev) =>
      prev?.column === column
        ? prev.direction === "asc"
          ? { column, direction: "desc" }
          : null
        : { column, direction: "asc" }
    );
  }

  const rows = useMemo(() => {
    const sorted = [...team.rows];
    if (!sort) return sorted.sort(defaultRosterSort);
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sort.column) {
        case "position":
          cmp = (POSITION_ORDER[a.position] ?? 99) - (POSITION_ORDER[b.position] ?? 99);
          break;
        case "player":
          cmp = a.playerName.localeCompare(b.playerName);
          break;
        case "amount":
          cmp = a.salary - b.salary;
          break;
        case "contract":
          cmp = (a.contractEndSeason ?? 9999) - (b.contractEndSeason ?? 9999);
          break;
      }
      if (sort.direction === "desc") cmp = -cmp;
      return cmp !== 0 ? cmp : defaultRosterSort(a, b);
    });
    return sorted;
  }, [team.rows, sort]);

  const sortable = "cursor-pointer select-none hover:bg-accent";
  const summary = rosterSummary(team.rows);

  return (
    <Card className="overflow-hidden">
      {/*
        The collapse control and the team link are siblings: the link used to
        sit inside the button, which is invalid markup and meant opening a team
        page also toggled the roster.
      */}
      {/* Baseline, not centre: the link should sit on the same line as the
          team and owner names, which are themselves baseline-aligned. */}
      <div className="flex items-baseline justify-between gap-4 px-3 py-2">
        <button
          onClick={onToggle}
          // Suppressing focus on mousedown keeps the focus ring for keyboard
          // users while stopping a click from leaving a box around the team
          // name. The click itself still fires.
          onMouseDown={(e) => e.preventDefault()}
          className="flex min-w-0 items-center gap-2 text-left"
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-lg font-bold">{team.teamName}</span>
            {team.ownerNames.length > 0 && (
              <span className="text-sm text-muted-foreground">
                {team.ownerNames.join(" & ")}
              </span>
            )}
          </span>
        </button>
        <Link
          href={`/teams/${team.slug}`}
          className="shrink-0 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
        >
          Details &amp; ledger
        </Link>
      </div>

      {/* One left-flowing line, indented past the chevron to sit under the team name. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t py-1.5 pl-9 pr-3 text-xs text-muted-foreground">
        <span className="whitespace-nowrap">
          {summary.players} players (${summary.spend}) · {summary.contracts} contracted ($
          {summary.contracted})
        </span>
        {assets && (
          <>
            <StripDivider />
            <AssetStrip assets={assets} future={future} committed={summary.committed} />
          </>
        )}
      </div>

      {!collapsed && (
        <Table className="sm:table-fixed">
          <TableHeader>
            {/* Top border: without it the header runs straight into the asset line. */}
            <TableRow className="border-t hover:bg-transparent">
              <TableHead className={`w-10 text-center ${ROSTER_COL.num}`}>#</TableHead>
              <TableHead
                className={`text-center ${ROSTER_COL.pos} ${sortable}`}
                onClick={() => clickHeader("position")}
              >
                POS
              </TableHead>
              <TableHead
                className={`${ROSTER_COL.player} ${sortable}`}
                onClick={() => clickHeader("player")}
              >
                Player
              </TableHead>
              <TableHead
                className={`text-center ${ROSTER_COL.amount} ${sortable}`}
                onClick={() => clickHeader("amount")}
              >
                $
              </TableHead>
              <TableHead
                className={`text-center ${ROSTER_COL.contract} ${sortable}`}
                onClick={() => clickHeader("contract")}
              >
                Contract
              </TableHead>
              {/* First to go on a phone — least load-bearing when you're
                  checking a roster on the move. Matches roster-table.tsx. */}
              <TableHead className={`hidden text-center sm:table-cell ${ROSTER_COL.nfl}`}>
                NFL
              </TableHead>
              <TableHead className={`hidden text-center sm:table-cell ${ROSTER_COL.bye}`}>
                Bye
              </TableHead>
              <TableHead className="hidden sm:table-cell">Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                  Empty Roster
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, i) => <RosterRowView key={row.id} row={row} index={i} />)
            )}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

function RosterRowView({ row, index }: { row: RosterRow; index: number }) {
  return (
    <TableRow className={index % 2 === 1 ? "bg-muted/20" : ""}>
      <TableCell className="text-center whitespace-nowrap">
        <DesignationMark designation={row.designation} index={index} />
      </TableCell>
      <TableCell className="text-center font-medium whitespace-nowrap">{row.position}</TableCell>
      <TableCell className="whitespace-nowrap">
        <PlayerLink name={row.playerName} />
      </TableCell>
      <TableCell className="text-center whitespace-nowrap">
        <SalaryCell amount={row.salary} />
      </TableCell>
      <TableCell className="text-center whitespace-nowrap">
        <ContractCell season={row.contractEndSeason} backToBack={row.isBackToBack} />
      </TableCell>
      <TableCell className="hidden text-center whitespace-nowrap sm:table-cell">
        {row.nflTeam}
      </TableCell>
      <TableCell className="hidden text-center whitespace-nowrap text-muted-foreground sm:table-cell">
        {row.byeWeek ?? "—"}
      </TableCell>
      <TableCell className="hidden text-muted-foreground sm:table-cell">
        {row.notes ?? ""}
      </TableCell>
    </TableRow>
  );
}
