"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SettingCard, FormRow } from "@/components/ui/setting-card";
import { resendOnTheClock, setPickWindow, startDraft } from "@/lib/actions/draft-actions";

/*
 * Running the draft.
 *
 * Starting it is the one control here that reaches outside the building: the
 * first window opens and that team gets a text. So it asks first — and says
 * what it's about to do, rather than "are you sure?", which tells nobody
 * anything.
 *
 * The window length autosaves on blur; it's a setting, independent and
 * reversible. Starting the draft doesn't, because it isn't.
 */

export function DraftControls({
  season,
  started,
  completed,
  windowMinutes,
  open,
}: {
  season: number;
  started: boolean;
  completed: boolean;
  windowMinutes: number;
  open: { slot: number; label: string; teamName: string; notified: boolean; overdue: boolean }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(String(windowMinutes));
  const [saved, setSaved] = useState(false);

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.ok) router.refresh();
      else setError(res.error);
    });

  const saveWindow = () => {
    const value = Number(minutes);
    if (value === windowMinutes) return;
    start(async () => {
      const res = await setPickWindow(value);
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else setError(res.error);
    });
  };

  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Not done</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <SettingCard
        title={`${season} rookie draft`}
        status={
          completed
            ? { label: "complete", variant: "secondary" }
            : started
              ? { label: "running", variant: "success" }
              : { label: "not started", variant: "warning" }
        }
        description="Starting the draft opens the first window and texts that team. Every window after it opens on its own — when the one before it is filled, or when its clock runs out."
      >
        {!started && !confirming && (
          <Button onClick={() => setConfirming(true)}>Start the draft</Button>
        )}
        {!started && confirming && (
          <FormRow>
            <Button loading={pending} disabled={pending} onClick={() => run(() => startDraft())}>
              Yes — open pick 1.01 and text them
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
              Cancel
            </Button>
          </FormRow>
        )}
        {started && !completed && (
          <p className="text-sm text-muted-foreground">
            Running since the first window opened. It closes itself when all 32 picks are in.
          </p>
        )}
      </SettingCard>

      <SettingCard
        title="Pick window"
        status={saved ? { label: "saved", variant: "success" } : undefined}
        description="Minutes a team has once their window opens. The league has always used 720 — twelve hours. Changing it applies to windows that open from now on."
      >
        <FormRow>
          <Input
            type="number"
            min={15}
            step={15}
            value={minutes}
            onChange={(e) => {
              setMinutes(e.target.value);
              setSaved(false);
            }}
            onBlur={saveWindow}
            className="w-28"
            aria-label="Pick window in minutes"
          />
          <span className="self-center text-sm text-muted-foreground">
            minutes ({(Number(minutes) / 60).toFixed(1).replace(/\.0$/, "")} hours)
          </span>
        </FormRow>
      </SettingCard>

      {open.length > 0 && (
        <SettingCard
          title="On the clock"
          description="Everyone whose window is open. Several can be open at once — that's what keeps the draft moving when somebody is unreachable."
        >
          <div className="space-y-2">
            {open.map((s) => (
              <FormRow key={s.slot} className="items-center">
                <span className="w-14 font-bold tabular-nums">{s.label}</span>
                <span className="min-w-40 text-sm">{s.teamName}</span>
                <span className="text-sm text-muted-foreground">
                  {s.overdue ? "overdue" : "open"}
                  {s.notified ? " · texted" : " · not texted yet"}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  disabled={pending}
                  onClick={() => run(() => resendOnTheClock(s.slot))}
                >
                  Text them again
                </Button>
              </FormRow>
            ))}
          </div>
        </SettingCard>
      )}
    </div>
  );
}
