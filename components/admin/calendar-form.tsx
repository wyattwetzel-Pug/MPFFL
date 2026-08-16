"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { SettingCard, FormRow } from "@/components/ui/setting-card";
import { setMilestone } from "@/lib/actions/calendar-actions";
import type { MilestoneKey } from "@prisma/client";

/*
 * Setting the league calendar.
 *
 * A milestone nobody has set shows an *empty* field with its fallback as a
 * hint. Pre-filling the fallback — which is what this form did first — makes a
 * guess indistinguishable from a decision, which is exactly what the badge
 * exists to prevent.
 *
 * Saving happens on blur. These are settings: each field is independent,
 * atomic and reversible, so there is no half-finished state to protect. Forms
 * that create a ledger entry keep an explicit submit, because a half-filed
 * trade must not be able to exist.
 */
export type Row = {
  key: MilestoneKey;
  label: string;
  rule: string;
  /** Empty when falling back — the fallback lives in the hint instead. */
  value: string;
  fallbackLabel: string;
  setLabel: string | null;
  source: "set" | "fallback";
  note: string | null;
  derived: boolean;
  timeMatters: boolean;
};

function MilestoneRow({ row }: { row: Row }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(row.value);
  const [note, setNote] = useState(row.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const commit = (nextValue: string | null, nextNote: string) => {
    // Nothing changed, nothing to write.
    if ((nextValue ?? "") === row.value && nextNote === (row.note ?? "")) return;
    start(async () => {
      setError(null);
      const res = await setMilestone(row.key, nextValue || null, nextNote);
      if (!res.ok) return setError(res.error);
      setSaved(true);
      router.refresh();
    });
  };

  if (row.derived) {
    return (
      <SettingCard
        title={row.label}
        status={{ label: "by rule", variant: "outline" }}
        description={row.rule}
        footer={row.fallbackLabel}
      />
    );
  }

  return (
    <SettingCard
      title={row.label}
      status={
        row.source === "set"
          ? { label: "set", variant: "success" }
          : { label: "not set", variant: "warning" }
      }
      description={row.rule}
      footer={
        error ? (
          <span className="text-destructive">{error}</span>
        ) : pending ? (
          "Saving…"
        ) : saved ? (
          "Saved"
        ) : row.source === "set" ? (
          row.setLabel
        ) : null
      }
    >
      <FormRow>
        <FormField
          id={`${row.key}-at`}
          label={row.timeMatters ? "Date and time" : "Date"}
          hint={row.source === "set" ? undefined : `Falls back to ${row.fallbackLabel}`}
          className="w-64"
        >
          <Input
            type={row.timeMatters ? "datetime-local" : "date"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => commit(value, note)}
          />
        </FormField>

        <FormField id={`${row.key}-note`} label="Note" className="min-w-72 flex-1">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => commit(value, note)}
          />
        </FormField>

        {row.source === "set" && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-7"
            disabled={pending}
            onClick={() => { setValue(""); setNote(""); commit(null, ""); }}
          >
            Clear
          </Button>
        )}
      </FormRow>
    </SettingCard>
  );
}

export function CalendarForm({ rows, season }: { rows: Row[]; season: number }) {
  return (
    <div className="space-y-3">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Dates for the {season} league year, saved as you go. Anything left blank falls back to
        an approximate date — set the real ones before the auction. Next March 1st these start
        empty again, and {season}&apos;s dates stay on the record.
      </p>
      {rows.map((r) => (
        <MilestoneRow key={r.key} row={r} />
      ))}
    </div>
  );
}
