"use client";

import { useState, useTransition } from "react";
import {
  addRosterSpot,
  patchRosterSpot,
  cutRosterSpot,
  uncutRosterSpot,
  deleteRosterSpot,
} from "@/lib/actions/roster-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TextCell, SelectCell, CheckCell } from "@/components/admin/inline-cell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Spot = {
  id: number;
  playerName: string;
  position: string;
  nflTeam: string;
  salary: number;
  contractEndSeason: number | null;
  designation: "ACTIVE" | "IR" | "PS";
  isBackToBack: boolean;
  notes: string | null;
  cutAt: string | null;
};

type FreeAgent = { id: number; name: string; position: string; nflTeam: string };

const DESIGNATIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "IR", label: "IR" },
  { value: "PS", label: "PS" },
];

export function RosterEditor({
  teamId,
  spots,
  freeAgents,
}: {
  teamId: number;
  spots: Spot[];
  freeAgents: FreeAgent[];
}) {
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: "error" | "warning" } | null>(null);
  const [pending, startTransition] = useTransition();

  const current = spots.filter((s) => !s.cutAt);
  const cut = spots.filter((s) => s.cutAt);

  function run(fn: () => Promise<{ error?: string; warning?: string } | { success: boolean }>) {
    startTransition(async () => {
      const result = await fn();
      setMessage(
        result && "error" in result && result.error
          ? { text: result.error, kind: "error" }
          : result && "warning" in result && result.warning
            ? { text: result.warning, kind: "warning" }
            : null
      );
      if (!result || !("error" in result) || !result.error) setAdding(false);
    });
  }

  /** Every cell reports its own failures through the shared banner. */
  const saver =
    (spotId: number, field: string) =>
    async (value: unknown) => {
      const result = await patchRosterSpot(spotId, { [field]: value });
      // Errors and warnings share the banner, but not a colour: a warning is
      // a message that saved anyway — the auto-set back-to-back flag
      // explaining itself must not read as a failure.
      if (result && "error" in result && result.error) {
        setMessage({ text: result.error, kind: "error" });
      } else if (result && "warning" in result && result.warning) {
        setMessage({ text: result.warning, kind: "warning" });
      } else {
        setMessage(null);
      }
      return result;
    };

  return (
    <div className="space-y-6">
      {message && (
        <Alert variant={message.kind === "error" ? "destructive" : "warning"}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {adding ? (
        <Card className="p-3">
          <form
            action={(fd) => run(() => addRosterSpot(teamId, fd))}
            className="flex flex-wrap items-end gap-2"
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-muted-foreground">Player (free agents)</span>
              <Select name="playerId" required className="w-64">
                <option value="">Select player…</option>
                {freeAgents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.position}, {p.nflTeam})
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-muted-foreground">Salary $</span>
              <Input name="salary" type="number" min={0} required className="w-20" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-muted-foreground">Contract yr</span>
              <Input
                name="contractEndSeason"
                type="number"
                min={2000}
                max={2100}
                placeholder="none"
                className="w-24"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-muted-foreground">Designation</span>
              <Select name="designation" defaultValue="ACTIVE" className="w-28">
                {DESIGNATIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex items-center gap-1.5 pb-2 text-sm">
              <Checkbox name="isBackToBack" />
              <span title="2nd 3-year contract — cannot be heldover">B2B</span>
            </label>
            <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
              <span className="text-xs text-muted-foreground">Notes</span>
              <Input name="notes" />
            </label>
            <Button type="submit" loading={pending}>
              Add
            </Button>
            <Button type="button" variant="outline" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </form>
        </Card>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setAdding(true)}>+ Add Player</Button>
          <p className="text-sm text-muted-foreground">
            Edit any value directly in the table — changes save as you go.
          </p>
        </div>
      )}

      <SpotTable
        title={`Roster (${current.length})`}
        spots={current}
        saver={saver}
        onCut={(id) => {
          const date = prompt("Cut date (YYYY-MM-DD), blank = today:") ?? undefined;
          run(() => cutRosterSpot(id, date || undefined));
        }}
        onDelete={(id, name) => {
          if (confirm(`Permanently delete ${name}'s roster row? Use Cut for real cuts.`))
            run(() => deleteRosterSpot(id));
        }}
      />

      {cut.length > 0 && (
        <SpotTable
          title={`Cut players (${cut.length})`}
          spots={cut}
          saver={saver}
          onUncut={(id) => run(() => uncutRosterSpot(id))}
          onDelete={(id, name) => {
            if (confirm(`Permanently delete ${name}'s roster row?`))
              run(() => deleteRosterSpot(id));
          }}
          muted
        />
      )}
    </div>
  );
}

function SpotTable({
  title,
  spots,
  saver,
  onCut,
  onUncut,
  onDelete,
  muted,
}: {
  title: string;
  spots: Spot[];
  saver: (spotId: number, field: string) => (value: unknown) => Promise<{ error?: string } | { success: boolean } | undefined>;
  onCut?: (id: number) => void;
  onUncut?: (id: number) => void;
  onDelete: (id: number, name: string) => void;
  muted?: boolean;
}) {
  return (
    <Card className={`overflow-hidden ${muted ? "opacity-70" : ""}`}>
      <div className="bg-muted/50 px-4 py-2 text-sm font-semibold">{title}</div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Player</TableHead>
            <TableHead className="text-center">Pos</TableHead>
            <TableHead className="w-20 text-center">Salary</TableHead>
            <TableHead className="w-24 text-center">Contract</TableHead>
            <TableHead className="w-28 text-center">Desig.</TableHead>
            <TableHead className="w-14 text-center">B2B</TableHead>
            <TableHead className="min-w-40">Notes</TableHead>
            {muted && <TableHead className="text-center">Cut</TableHead>}
            <TableHead className="text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {spots.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="whitespace-nowrap font-medium">{s.playerName}</TableCell>
              <TableCell className="text-center">{s.position}</TableCell>
              <TableCell className="p-0.5">
                <TextCell
                  type="number"
                  align="center"
                  value={s.salary}
                  save={saver(s.id, "salary")}
                  ariaLabel={`Salary for ${s.playerName}`}
                />
              </TableCell>
              <TableCell className="p-0.5">
                <TextCell
                  type="number"
                  align="center"
                  value={s.contractEndSeason}
                  placeholder="—"
                  save={async (v) =>
                    saver(s.id, "contractEndSeason")(v === "" || v === null ? null : v)
                  }
                  ariaLabel={`Contract year for ${s.playerName}`}
                />
              </TableCell>
              <TableCell className="p-0.5">
                <SelectCell
                  value={s.designation}
                  options={DESIGNATIONS}
                  save={saver(s.id, "designation")}
                  ariaLabel={`Designation for ${s.playerName}`}
                />
              </TableCell>
              <TableCell className="text-center">
                <CheckCell
                  value={s.isBackToBack}
                  save={saver(s.id, "isBackToBack")}
                  ariaLabel={`Back-to-back contract for ${s.playerName}`}
                />
              </TableCell>
              <TableCell className="p-0.5">
                <TextCell
                  value={s.notes}
                  placeholder="—"
                  save={async (v) => saver(s.id, "notes")(v === "" ? null : v)}
                  ariaLabel={`Notes for ${s.playerName}`}
                />
              </TableCell>
              {muted && (
                <TableCell className="whitespace-nowrap text-center">{s.cutAt}</TableCell>
              )}
              <TableCell className="whitespace-nowrap text-center">
                {onCut && (
                  <Button variant="link" size="sm" className="text-warning" onClick={() => onCut(s.id)}>
                    Cut
                  </Button>
                )}
                {onUncut && (
                  <Button variant="link" size="sm" className="text-success" onClick={() => onUncut(s.id)}>
                    Restore
                  </Button>
                )}
                <Button
                  variant="link"
                  size="sm"
                  className="text-destructive"
                  onClick={() => onDelete(s.id, s.playerName)}
                >
                  Delete
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
