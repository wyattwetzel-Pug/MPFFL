"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { submitTransaction, type TransactionInput } from "@/lib/actions/submit-transaction";
import { PICK_HORIZON } from "@/lib/ledger/derive";
import type { AssetType } from "@prisma/client";

/*
 * Filing a cut, a waiver, or an adjustment.
 *
 * One form, four types, because they differ only in what they cost — every one
 * of them is "a player leaves this roster" plus a price. The type buttons swap
 * the price, not the layout.
 */

export type FormPlayer = {
  playerId: number;
  name: string;
  position: string;
  salary: number;
  contractEndSeason: number | null;
};

export type FormTeam = { id: number; name: string; players: FormPlayer[] };

type Kind = "WAIVER" | "CONDITIONAL_CUT" | "UNCONDITIONAL_CUT" | "ADJUSTMENT";

const KINDS: { value: Kind; label: string; blurb: string }[] = [
  { value: "WAIVER", label: "Waiver", blurb: "Buy out the years still to run." },
  { value: "CONDITIONAL_CUT", label: "Conditional cut", blurb: "Costs a conditional cut and the player's salary." },
  { value: "UNCONDITIONAL_CUT", label: "Unconditional cut", blurb: "Costs an unconditional cut. No cap charge." },
  { value: "ADJUSTMENT", label: "Other / adjustment", blurb: "Awards, penalties, corrections — anything the log must carry." },
];

const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: "CAP_DOLLARS", label: "Cap dollars" },
  { value: "ROOKIE_PICK", label: "Rookie pick" },
  { value: "PS_SPOT", label: "PS spot" },
  { value: "CONDITIONAL_CUT", label: "Conditional cut" },
  { value: "UNCONDITIONAL_CUT", label: "Unconditional cut" },
  { value: "TOPPER_HOLDOVER", label: "Topper / holdover" },
];

function waiverCost(p: FormPlayer, season: number) {
  if (p.contractEndSeason == null || p.contractEndSeason <= season) return 0;
  return p.salary * (p.contractEndSeason - season);
}

export function TransactionForm({
  teams,
  defaultTeamId,
  isCommissioner,
  season,
}: {
  teams: FormTeam[];
  defaultTeamId: number | null;
  isCommissioner: boolean;
  season: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [teamId, setTeamId] = useState(defaultTeamId ?? teams[0]?.id ?? 0);
  const [kind, setKind] = useState<Kind | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [payments, setPayments] = useState<{ seasonYear: number; amount: string }[]>([
    { seasonYear: season, amount: "" },
  ]);
  const [lines, setLines] = useState<
    { assetType: AssetType; seasonYear: number; amount: string; round: string; direction: "in" | "out" }[]
  >([{ assetType: "CAP_DOLLARS", seasonYear: season, amount: "", round: "", direction: "in" }]);
  const [errors, setErrors] = useState<string[]>([]);
  const [notices, setNotices] = useState<string[]>([]);

  const team = teams.find((t) => t.id === teamId);
  const roster = useMemo(() => team?.players ?? [], [team]);

  // What this costs, recomputed as players are ticked.
  const due = useMemo(() => {
    if (kind === "WAIVER")
      return selected.reduce((sum, id) => {
        const p = roster.find((r) => r.playerId === id);
        return sum + (p ? waiverCost(p, season) : 0);
      }, 0);
    if (kind === "CONDITIONAL_CUT")
      return selected.reduce((sum, id) => {
        const p = roster.find((r) => r.playerId === id);
        return sum + (p?.salary ?? 0);
      }, 0);
    return 0;
  }, [kind, selected, roster, season]);

  /*
   * An unconditional cut spends a cut to end a live contract. A player whose
   * deal has already expired has nothing to end, so they aren't listed at all
   * rather than shown struck through — the rule is stated once beneath.
   */
  const eligible = useMemo(
    () =>
      kind === "UNCONDITIONAL_CUT"
        ? roster.filter((p) => p.contractEndSeason != null && p.contractEndSeason >= season)
        : roster,
    [kind, roster, season]
  );
  const hidden = roster.length - eligible.length;

  const paid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const toggle = (id: number) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  function submit() {
    setErrors([]);
    setNotices([]);
    const input: TransactionInput = {
      teamId,
      type: kind!,
      note,
      playerIds: kind === "ADJUSTMENT" ? undefined : selected,
      payments:
        kind === "WAIVER"
          ? payments
              .filter((p) => Number(p.amount) > 0)
              .map((p) => ({ seasonYear: p.seasonYear, amount: Number(p.amount) }))
          : undefined,
      lines:
        kind === "ADJUSTMENT"
          ? lines
              .filter((l) => Number(l.amount) > 0)
              .map((l) => ({
                assetType: l.assetType,
                seasonYear: l.seasonYear,
                amount: Number(l.amount),
                round: l.round ? Number(l.round) : null,
                direction: l.direction,
              }))
          : undefined,
    };
    start(async () => {
      const res = await submitTransaction(input);
      if (res.ok) {
        if (res.warnings.length) setNotices(res.warnings);
        router.push(`/transactions/${res.id}`);
      } else {
        setErrors(res.errors);
      }
    });
  }

  return (
    <div className="space-y-4">
      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Not filed</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-0.5 pl-4">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {notices.length > 0 && (
        <Alert variant="warning">
          <AlertTitle>Filed, with something to watch</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-0.5 pl-4">
              {notices.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="space-y-4 p-4">
          {isCommissioner && (
            <FormField id="team" label="Team">
              <Select value={teamId} onChange={(e) => { setTeamId(Number(e.target.value)); setSelected([]); }}>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
            </FormField>
          )}

          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Type
          </div>
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <Button
                key={k.value}
                type="button"
                variant={kind === k.value ? "default" : "outline"}
                size="sm"
                onClick={() => { setKind(k.value); setSelected([]); }}
              >
                {k.label}
              </Button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {kind
              ? KINDS.find((k) => k.value === kind)!.blurb
              : "Choose a type — the rest of the form follows from it."}
          </p>
        </CardContent>
      </Card>

      {kind && kind !== "ADJUSTMENT" && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Players
            </div>
            {eligible.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No players on this roster can be {KINDS.find((k) => k.value === kind)!.label.toLowerCase()}.
              </p>
            ) : (
              <ul className="space-y-1">
                {eligible.map((p) => {
                  const cost = kind === "WAIVER" ? waiverCost(p, season) : kind === "CONDITIONAL_CUT" ? p.salary : 0;
                  return (
                    <li key={p.playerId} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={selected.includes(p.playerId)}
                        onChange={() => toggle(p.playerId)}
                        id={`p${p.playerId}`}
                      />
                      <label htmlFor={`p${p.playerId}`}>
                        <span className="font-medium">{p.name}</span>{" "}
                        <span className="text-muted-foreground">
                          {p.position} · ${p.salary}
                          {p.contractEndSeason ? ` · through ${p.contractEndSeason}` : " · expiring"}
                        </span>
                        {cost > 0 && <span className="ml-2 text-foreground/80">costs ${cost}</span>}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            {hidden > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {hidden} player{hidden === 1 ? "" : "s"} not shown — an unconditional cut ends a
                live contract, and theirs have already expired.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {kind === "WAIVER" && due > 0 && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Buyout — ${due} due
            </div>
            {/* Buyouts may be paid from more than one season's cap. */}
            {payments.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select
                  value={p.seasonYear}
                  onChange={(e) =>
                    setPayments((ps) => ps.map((x, j) => (j === i ? { ...x, seasonYear: Number(e.target.value) } : x)))
                  }
                  className="w-28"
                >
                  {Array.from({ length: PICK_HORIZON + 1 }, (_, i) => season + i).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </Select>
                <Input
                  type="number"
                  min={0}
                  value={p.amount}
                  placeholder="$"
                  className="w-28"
                  onChange={(e) =>
                    setPayments((ps) => ps.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))
                  }
                />
                {payments.length > 1 && (
                  <Button type="button" variant="ghost" size="sm"
                    onClick={() => setPayments((ps) => ps.filter((_, j) => j !== i))}>
                    Remove
                  </Button>
                )}
              </div>
            ))}
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" size="sm"
                onClick={() => setPayments((ps) => [...ps, { seasonYear: season, amount: "" }])}>
                Add a season
              </Button>
              <span className={`text-sm ${paid === due ? "text-muted-foreground" : "text-destructive"}`}>
                ${paid} of ${due} allocated
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {kind === "ADJUSTMENT" && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              What moves
            </div>
            {lines.map((l, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Select value={l.direction} className="w-24"
                  onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, direction: e.target.value as "in" | "out" } : x)))}>
                  <option value="in">Gains</option>
                  <option value="out">Loses</option>
                </Select>
                <Select value={l.assetType} className="w-44"
                  onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, assetType: e.target.value as AssetType } : x)))}>
                  {ASSET_TYPES.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </Select>
                <Input type="number" min={1} value={l.amount} placeholder="Amount" className="w-28"
                  onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                {l.assetType === "ROOKIE_PICK" && (
                  <Input type="number" min={1} max={2} value={l.round} placeholder="Round" className="w-24"
                    onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, round: e.target.value } : x)))} />
                )}
                <Select value={l.seasonYear} className="w-28"
                  onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, seasonYear: Number(e.target.value) } : x)))}>
                  {Array.from({ length: PICK_HORIZON + 1 }, (_, i) => season + i).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </Select>
                {lines.length > 1 && (
                  <Button type="button" variant="ghost" size="sm"
                    onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                    Remove
                  </Button>
                )}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm"
              onClick={() => setLines((ls) => [...ls, { assetType: "CAP_DOLLARS", seasonYear: season, amount: "", round: "", direction: "in" }])}>
              Add a line
            </Button>
          </CardContent>
        </Card>
      )}

      {kind && (
      <Card>
        <CardContent className="space-y-3 p-4">
          <FormField
            id="note"
            label="Note (optional)"
            hint="The log is the record — say what happened and why, for whoever reads this in five years."
          >
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>
          <div className="flex items-center gap-3">
            <Button onClick={submit} loading={pending} disabled={pending}>
              File for review
            </Button>
            <span className="text-sm text-muted-foreground">
              Goes to the commissioner. Nothing changes until it&apos;s approved.
            </span>
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  );
}
