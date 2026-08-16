"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { SettingCard, FormRow } from "@/components/ui/setting-card";
import { resolveCondition } from "@/lib/actions/condition-actions";
import type { AssetType, ConditionOutcome } from "@prisma/client";

export type ConditionRow = {
  id: number;
  transactionId: number;
  description: string;
  decideBy: string | null;
  overdue: boolean;
  filed: string;
  teams: { id: number; name: string }[];
  seasons: number[];
  resolvedLabel: string | null;
  resolutionTransactionId: number | null;
};

/*
 * Settling a condition.
 *
 * Two of the three answers need nothing but a note. "Replaced" needs to say
 * what conveys instead, and that's the case where a picker belongs — but only
 * here, at the moment somebody actually knows the answer. Asking for both
 * branches back at submission is what made this feel unbuildable.
 */
function Row({ row }: { row: ConditionRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [toTeamId, setToTeamId] = useState(0);
  const [assetType, setAssetType] = useState<AssetType>("ROOKIE_PICK");
  const [seasonYear, setSeasonYear] = useState(row.seasons[0] ?? new Date().getFullYear());
  const [round, setRound] = useState("1");
  const [amount, setAmount] = useState("1");

  const settle = (outcome: ConditionOutcome) =>
    start(async () => {
      setError(null);
      const other = row.teams.find((t) => t.id !== toTeamId);
      const res = await resolveCondition({
        conditionId: row.id,
        outcome,
        note,
        replacement:
          outcome === "REPLACED" && toTeamId && other
            ? {
                // Whoever isn't receiving it is sending it.
                fromTeamId: other.id,
                toTeamId,
                assets: [
                  {
                    assetType,
                    seasonYear,
                    amount: Number(amount) || 1,
                    round: assetType === "ROOKIE_PICK" ? Number(round) || 1 : null,
                    pickNumber: null,
                    originTeamId: null,
                    playerId: null,
                  },
                ],
              }
            : undefined,
      });
      if (res.ok) router.refresh();
      else setError(res.error);
    });

  return (
    <SettingCard
      title={row.description}
      status={
        row.overdue
          ? { label: "overdue", variant: "destructive" }
          : row.decideBy
            ? { label: `decide by ${row.decideBy}`, variant: "warning" }
            : { label: "open", variant: "warning" }
      }
      description={`${row.teams.map((t) => t.name).join(" ↔ ")} · filed ${row.filed}`}
      footer={
        error ? (
          <span className="text-destructive">{error}</span>
        ) : (
          <Link href={`/transactions/${row.transactionId}`} className="underline-offset-4 hover:text-primary hover:underline">
            Transaction #{row.transactionId}
          </Link>
        )
      }
    >
      <FormRow>
        <FormField id={`c${row.id}-note`} label="What happened" className="min-w-72 flex-1">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why it settled this way" />
        </FormField>
      </FormRow>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending || !note.trim()} onClick={() => settle("CONVEYED")}>
          Conveyed as filed
        </Button>
        <Button size="sm" variant="outline" disabled={pending || !note.trim()} onClick={() => settle("NOT_MET")}>
          Did not convey
        </Button>
        <Button size="sm" variant={replacing ? "default" : "ghost"}
          disabled={pending} onClick={() => setReplacing((r) => !r)}>
          Something else conveyed…
        </Button>
      </div>

      {/* The one outcome that needs a picker — and only here, at the moment
          somebody actually knows the answer. */}
      {replacing && (
        <div className="space-y-2 rounded-md border p-3">
          <FormRow>
            <FormField id={`c${row.id}-to`} label="Goes to" className="w-56">
              <Select value={toTeamId} onChange={(e) => setToTeamId(Number(e.target.value))}>
                <option value={0}>Choose a team…</option>
                {row.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </FormField>
            <FormField id={`c${row.id}-type`} label="Asset" className="w-48">
              <Select value={assetType} onChange={(e) => setAssetType(e.target.value as AssetType)}>
                <option value="ROOKIE_PICK">Rookie pick</option>
                <option value="CAP_DOLLARS">Cap dollars</option>
                <option value="PS_SPOT">PS spot</option>
                <option value="CONDITIONAL_CUT">Conditional cut</option>
              </Select>
            </FormField>
            {assetType === "ROOKIE_PICK" && (
              <FormField id={`c${row.id}-round`} label="Round" className="w-24">
                <Select value={round} onChange={(e) => setRound(e.target.value)}>
                  <option value="1">1st</option>
                  <option value="2">2nd</option>
                </Select>
              </FormField>
            )}
            {assetType !== "ROOKIE_PICK" && (
              <FormField id={`c${row.id}-amt`} label="Amount" className="w-28">
                <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
              </FormField>
            )}
            <FormField id={`c${row.id}-year`} label="Season" className="w-28">
              <Select value={seasonYear} onChange={(e) => setSeasonYear(Number(e.target.value))}>
                {row.seasons.map((y) => <option key={y} value={y}>{y}</option>)}
              </Select>
            </FormField>
          </FormRow>
          <Button size="sm" disabled={pending || !note.trim() || !toTeamId}
            onClick={() => settle("REPLACED")}>
            Record what conveyed
          </Button>
        </div>
      )}
    </SettingCard>
  );
}

export function ConditionList({ rows }: { rows: ConditionRow[] }) {
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <Row key={r.id} row={r} />
      ))}
    </div>
  );
}
