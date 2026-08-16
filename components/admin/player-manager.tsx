"use client";

import { useState, useTransition } from "react";
import { createPlayer, updatePlayer, deletePlayer } from "@/lib/actions/player-actions";
import { POSITIONS, NFL_TEAMS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PlayerRow = {
  id: number;
  name: string;
  position: string;
  nflTeam: string;
  rookieYear: number | null;
  active: boolean;
  onRoster: string | null;
};

export function PlayerManager({ players }: { players: PlayerRow[] }) {
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(form: FormData, playerId?: number) {
    startTransition(async () => {
      const result = playerId
        ? await updatePlayer(playerId, form)
        : await createPlayer(form);
      if (result && "error" in result && result.error) {
        setMessage(result.error);
      } else {
        setMessage(null);
        setEditing(null);
      }
    });
  }

  function remove(playerId: number, name: string) {
    if (!confirm(`Delete ${name}? This only works for players with no roster history.`))
      return;
    startTransition(async () => {
      const result = await deletePlayer(playerId);
      setMessage(result && "error" in result && result.error ? result.error : null);
    });
  }

  return (
    <div className="space-y-4">
      {message && (
        <Alert variant="destructive">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      {editing === "new" ? (
        <PlayerForm onSubmit={(fd) => submit(fd)} onCancel={() => setEditing(null)} pending={pending} />
      ) : (
        <Button onClick={() => setEditing("new")}>+ Add Player</Button>
      )}

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Player</TableHead>
              <TableHead className="text-center">Pos</TableHead>
              <TableHead className="text-center">NFL</TableHead>
              <TableHead className="text-center">Rookie Yr</TableHead>
              <TableHead>MPFFL Team</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {players.map((p) =>
              editing === p.id ? (
                <TableRow key={p.id}>
                  <TableCell colSpan={7} className="py-2">
                    <PlayerForm
                      player={p}
                      onSubmit={(fd) => submit(fd, p.id)}
                      onCancel={() => setEditing(null)}
                      pending={pending}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow key={p.id} className={p.active ? "" : "text-muted-foreground"}>
                  <TableCell className="font-medium whitespace-nowrap">{p.name}</TableCell>
                  <TableCell className="text-center">{p.position}</TableCell>
                  <TableCell className="text-center">{p.nflTeam}</TableCell>
                  <TableCell className="text-center">{p.rookieYear ?? "-"}</TableCell>
                  <TableCell className="whitespace-nowrap">{p.onRoster ?? "—"}</TableCell>
                  <TableCell className="text-center">{p.active ? "Active" : "Inactive"}</TableCell>
                  <TableCell className="text-center whitespace-nowrap">
                    <Button variant="link" size="sm" onClick={() => setEditing(p.id)}>
                      Edit
                    </Button>
                    <Button
                      variant="link"
                      size="sm"
                      className="text-destructive"
                      onClick={() => remove(p.id, p.name)}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              )
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function PlayerForm({
  player,
  onSubmit,
  onCancel,
  pending,
}: {
  player?: PlayerRow;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const field = "flex flex-col gap-1 text-sm";
  const label = "text-xs text-muted-foreground";
  return (
    <form action={onSubmit} className="flex flex-wrap items-end gap-2 text-sm">
      <label className={field}>
        <span className={label}>Name</span>
        <Input name="name" required defaultValue={player?.name} className="w-48" />
      </label>
      <label className={field}>
        <span className={label}>Position</span>
        <Select name="position" defaultValue={player?.position ?? "QB"} className="w-24">
          {POSITIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </label>
      <label className={field}>
        <span className={label}>NFL Team</span>
        {/* "F/A", not "FA" — the constant is the slash form, and a default that
            matches no option silently selects the first one, so every new
            player was arriving as an Arizona Cardinal. */}
        <Select name="nflTeam" defaultValue={player?.nflTeam ?? "F/A"} className="w-24">
          {NFL_TEAMS.map((t) => (
            <option key={t.abbr} value={t.abbr}>
              {t.abbr}
            </option>
          ))}
        </Select>
      </label>
      <label className={field}>
        <span className={label}>Rookie Yr</span>
        <Input name="rookieYear" type="number" defaultValue={player?.rookieYear ?? ""} className="w-24" />
      </label>
      <label className="flex items-center gap-1.5 pb-2 text-sm">
        <Checkbox name="active" defaultChecked={player?.active ?? true} />
        <span>Active</span>
      </label>
      <Button type="submit" loading={pending}>
        {player ? "Save" : "Create"}
      </Button>
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}
