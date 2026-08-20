"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TextLink } from "@/components/ui/text-link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  setLegacyStringField,
  setLegacyRequiredIntField,
  setLegacyOptionalIntField,
  setLegacyTeam,
  type LegacyStringField,
  type LegacyRequiredIntField,
  type LegacyOptionalIntField,
} from "@/lib/actions/legacy-actions";

export type LegacyRow = {
  id: number;
  teamId: number;
  slug: string;
  label: string;
  wins: number;
  losses: number;
  winPct: string;
  pointsScored: string;
  pointsAgainst: string;
  highestScorerSeasons: number | null;
  playoffAppearances: number | null;
  playoffRecord: string | null;
  oneSeedAppearances: number | null;
  titleAppearances: number | null;
  titleWins: number | null;
  bpotya: number | null;
  coty: number | null;
};

export type TeamOption = { id: number; name: string; slug: string };

const dash = <span className="text-muted-foreground">–</span>;

function StringCell({ id, field, initial }: { id: number; field: LegacyStringField; initial: string }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const commit = () => {
    if (value === initial) return;
    start(async () => {
      const res = await setLegacyStringField(id, field, value);
      setError(res.ok ? null : res.error);
    });
  };

  return (
    <Input
      value={value}
      disabled={pending}
      onChange={(e) => { setValue(e.target.value); setError(null); }}
      onBlur={commit}
      aria-invalid={!!error}
      title={error ?? undefined}
      className="h-8 min-w-24 px-1.5 text-center"
    />
  );
}

function RequiredIntCell({ id, field, initial }: { id: number; field: LegacyRequiredIntField; initial: number }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState(String(initial));
  const [error, setError] = useState<string | null>(null);

  const commit = () => {
    const n = Number(value);
    if (n === initial) return;
    if (!Number.isInteger(n) || n < 0) return setError("Whole number, 0 or more.");
    start(async () => {
      const res = await setLegacyRequiredIntField(id, field, n);
      setError(res.ok ? null : res.error);
    });
  };

  return (
    <Input
      type="number"
      min={0}
      value={value}
      disabled={pending}
      onChange={(e) => { setValue(e.target.value); setError(null); }}
      onBlur={commit}
      aria-invalid={!!error}
      title={error ?? undefined}
      className="h-8 w-14 px-1 text-center tabular-nums"
    />
  );
}

function OptionalIntCell({ id, field, initial }: { id: number; field: LegacyOptionalIntField; initial: number | null }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState(initial === null ? "" : String(initial));
  const [error, setError] = useState<string | null>(null);

  const commit = () => {
    const trimmed = value.trim();
    const n = trimmed === "" ? null : Number(trimmed);
    if (n === initial) return;
    if (n !== null && (!Number.isInteger(n) || n < 0)) return setError("Whole number, 0 or more.");
    start(async () => {
      const res = await setLegacyOptionalIntField(id, field, n);
      setError(res.ok ? null : res.error);
    });
  };

  return (
    <Input
      type="number"
      min={0}
      value={value}
      disabled={pending}
      placeholder="–"
      onChange={(e) => { setValue(e.target.value); setError(null); }}
      onBlur={commit}
      aria-invalid={!!error}
      title={error ?? undefined}
      className="h-8 w-14 px-1 text-center tabular-nums"
    />
  );
}

function TeamCell({ row, teams }: { row: LegacyRow; teams: TeamOption[] }) {
  const [pending, start] = useTransition();
  const [teamId, setTeamId] = useState(row.teamId);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <StringCell id={row.id} field="label" initial={row.label} />
      <Select
        value={teamId}
        disabled={pending}
        onChange={(e) => {
          const next = Number(e.target.value);
          setTeamId(next);
          start(async () => {
            const res = await setLegacyTeam(row.id, next);
            setError(res.ok ? null : res.error);
          });
        }}
        aria-invalid={!!error}
        title={error ?? "Roster this row links to"}
        className="h-7 text-xs"
      >
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </Select>
    </div>
  );
}

export function LegacyStandingsTable({
  rows,
  teams,
  editable,
}: {
  rows: LegacyRow[];
  teams: TeamOption[];
  editable: boolean;
}) {
  const teamSlug = (teamId: number) => teams.find((t) => t.id === teamId)?.slug;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Team</TableHead>
          <TableHead className="text-center">W</TableHead>
          <TableHead className="text-center">L</TableHead>
          <TableHead className="text-center">Win %</TableHead>
          <TableHead className="text-center">PF</TableHead>
          <TableHead className="text-center">PA</TableHead>
          <TableHead className="text-center">Scoring Titles</TableHead>
          <TableHead className="text-center">Playoff Apps</TableHead>
          <TableHead className="text-center">Playoff Record</TableHead>
          <TableHead className="text-center">1 Seeds</TableHead>
          <TableHead className="text-center">Title Apps</TableHead>
          <TableHead className="text-center">Titles</TableHead>
          <TableHead className="text-center">BPOTYA</TableHead>
          <TableHead className="text-center">COTY</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) =>
          editable ? (
            <TableRow key={row.id}>
              <TableCell className="font-medium"><TeamCell row={row} teams={teams} /></TableCell>
              <TableCell className="text-center"><RequiredIntCell id={row.id} field="wins" initial={row.wins} /></TableCell>
              <TableCell className="text-center"><RequiredIntCell id={row.id} field="losses" initial={row.losses} /></TableCell>
              <TableCell className="text-center"><StringCell id={row.id} field="winPct" initial={row.winPct} /></TableCell>
              <TableCell className="text-center"><StringCell id={row.id} field="pointsScored" initial={row.pointsScored} /></TableCell>
              <TableCell className="text-center"><StringCell id={row.id} field="pointsAgainst" initial={row.pointsAgainst} /></TableCell>
              <TableCell className="text-center"><OptionalIntCell id={row.id} field="highestScorerSeasons" initial={row.highestScorerSeasons} /></TableCell>
              <TableCell className="text-center"><OptionalIntCell id={row.id} field="playoffAppearances" initial={row.playoffAppearances} /></TableCell>
              <TableCell className="text-center"><StringCell id={row.id} field="playoffRecord" initial={row.playoffRecord ?? ""} /></TableCell>
              <TableCell className="text-center"><OptionalIntCell id={row.id} field="oneSeedAppearances" initial={row.oneSeedAppearances} /></TableCell>
              <TableCell className="text-center"><OptionalIntCell id={row.id} field="titleAppearances" initial={row.titleAppearances} /></TableCell>
              <TableCell className="text-center"><OptionalIntCell id={row.id} field="titleWins" initial={row.titleWins} /></TableCell>
              <TableCell className="text-center"><OptionalIntCell id={row.id} field="bpotya" initial={row.bpotya} /></TableCell>
              <TableCell className="text-center"><OptionalIntCell id={row.id} field="coty" initial={row.coty} /></TableCell>
            </TableRow>
          ) : (
            <TableRow key={row.id}>
              <TableCell className="font-medium">
                {teamSlug(row.teamId) ? (
                  <TextLink href={`/teams/${teamSlug(row.teamId)}`}>{row.label}</TextLink>
                ) : (
                  row.label
                )}
              </TableCell>
              <TableCell className="text-center">{row.wins}</TableCell>
              <TableCell className="text-center">{row.losses}</TableCell>
              <TableCell className="text-center">{row.winPct}</TableCell>
              <TableCell className="text-center">{row.pointsScored}</TableCell>
              <TableCell className="text-center">{row.pointsAgainst}</TableCell>
              <TableCell className="text-center">{row.highestScorerSeasons ?? dash}</TableCell>
              <TableCell className="text-center">{row.playoffAppearances ?? dash}</TableCell>
              <TableCell className="text-center">{row.playoffRecord ?? dash}</TableCell>
              <TableCell className="text-center">{row.oneSeedAppearances ?? dash}</TableCell>
              <TableCell className="text-center">{row.titleAppearances ?? dash}</TableCell>
              <TableCell className="text-center">{row.titleWins ?? dash}</TableCell>
              <TableCell className="text-center">{row.bpotya ?? dash}</TableCell>
              <TableCell className="text-center">{row.coty ?? dash}</TableCell>
            </TableRow>
          )
        )}
      </TableBody>
    </Table>
  );
}
