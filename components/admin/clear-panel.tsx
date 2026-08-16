"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StripDivider } from "@/components/league/asset-strip";
import { runClear, undoClear } from "@/lib/actions/clear-actions";
import type { TeamProposal, ClearStatus } from "@/lib/auction/clear";

/*
 * Review first, then the button.
 *
 * The proposal is the page: every team, who leaves, who stays, and the reason
 * on each line. The confirm step repeats the totals so what's being agreed to
 * is on the button itself. After the clear, the same panel turns into status —
 * one transaction per team, each with its own restore.
 */

function TeamBlock({ team }: { team: TeamProposal }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardContent className="p-3">
      <button
        type="button"
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
        <span className="font-bold">{team.teamName}</span>
        <span className="text-sm text-muted-foreground">
          clears <span className="font-medium text-foreground/80">{team.clears.length}</span>
          {" · "}keeps <span className="font-medium text-foreground/80">{team.keeps.length}</span>
          {" · "}${team.clearedSalary} back to the pool
        </span>
      </button>

      {open && (
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Returns to the pool
            </div>
            <ul className="space-y-0.5 text-sm">
              {team.clears.map((c) => (
                <li key={c.spotId} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{c.playerName}</span>
                  <span className="text-muted-foreground">
                    {c.position} · ${c.salary}
                    {c.designation !== "ACTIVE" ? ` · ${c.designation}` : ""} — {c.reason}
                  </span>
                </li>
              ))}
              {team.clears.length === 0 && <li className="text-muted-foreground">Nobody.</li>}
            </ul>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Stays
            </div>
            <ul className="space-y-0.5 text-sm">
              {team.keeps.map((c) => (
                <li key={c.spotId} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{c.playerName}</span>
                  <span className="text-muted-foreground">
                    {c.position} · ${c.salary} — {c.reason}
                  </span>
                </li>
              ))}
              {team.keeps.length === 0 && <li className="text-muted-foreground">Nobody.</li>}
            </ul>
          </div>
        </div>
      )}
      </CardContent>
    </Card>
  );
}

export function ClearPanel({
  proposal,
  status,
  totals,
  season,
}: {
  proposal: TeamProposal[];
  status: ClearStatus;
  totals: { clears: number; keeps: number; salary: number };
  season: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: "error" | "success" } | null>(null);

  const applied = status.filter((s) => s.status === "APPROVED");
  const done = applied.length > 0;

  const apply = () =>
    start(async () => {
      setMessage(null);
      const res = await runClear();
      if (res.ok) {
        setConfirming(false);
        setMessage({
          text: `${res.cleared} players cleared across ${res.transactions.length} teams. Each team's clear is its own transaction below.`,
          kind: "success",
        });
        router.refresh();
      } else {
        setMessage({ text: res.error, kind: "error" });
      }
    });

  const restore = (teamId: number, teamName: string) =>
    start(async () => {
      setMessage(null);
      const res = await undoClear(teamId);
      setMessage(
        res.ok
          ? { text: `${teamName} restored — ${res.restored} players back on the roster.`, kind: "success" }
          : { text: res.error, kind: "error" }
      );
      router.refresh();
    });

  return (
    <div className="space-y-4">
      {message && (
        <Alert variant={message.kind === "error" ? "destructive" : "success"}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {done && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Applied
          </h2>
          <Card>
            <CardContent className="space-y-1.5 p-4">
              {status.map((s) => (
                <div key={s.transactionId} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="font-medium">{s.teamName}</span>
                  <Link
                    href={`/transactions/${s.transactionId}`}
                    className="text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                  >
                    #{s.transactionId} · {s.players} players
                  </Link>
                  <Badge variant={s.status === "APPROVED" ? "success" : "secondary"}>
                    {s.status === "APPROVED" ? "cleared" : s.status.toLowerCase()}
                  </Badge>
                  {s.status === "APPROVED" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => restore(s.teamId, s.teamName)}
                    >
                      Restore
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="whitespace-nowrap">
              Would clear:{" "}
              <span className="font-medium text-foreground/80">{totals.clears} players</span>
            </span>
            <StripDivider />
            <span className="whitespace-nowrap">
              Stay: <span className="font-medium text-foreground/80">{totals.keeps}</span>
            </span>
            <StripDivider />
            <span className="whitespace-nowrap">
              Salary back to the pool:{" "}
              <span className="font-medium text-foreground/80">${totals.salary}</span>
            </span>
          </p>

          {totals.clears > 0 &&
            (confirming ? (
              <span className="flex items-center gap-2">
                <Button variant="destructive" loading={pending} disabled={pending} onClick={apply}>
                  Clear {totals.clears} players from {proposal.filter((t) => t.clears.length > 0).length} teams
                </Button>
                <Button variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </span>
            ) : (
              <Button variant="destructive" onClick={() => setConfirming(true)}>
                Run the {season} clear…
              </Button>
            ))}
        </div>

        <div className="space-y-1.5">
          {proposal.map((t) => (
            <TeamBlock key={t.teamId} team={t} />
          ))}
        </div>
      </section>
    </div>
  );
}
