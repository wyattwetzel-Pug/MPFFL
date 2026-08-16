"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Confetti } from "@/components/ui/confetti";
import { Countdown } from "@/components/ui/countdown";
import { makeDraftPick } from "@/lib/actions/draft-actions";

/*
 * Making a pick.
 *
 * This is the page a text message lands someone on, often on a phone, often in
 * a hurry — so it opens with the one thing they came to do and nothing else.
 * The board is below; this is above it.
 *
 * The price of holding a player is shown *before* the choice is made, because
 * the choice depends on it: a $60 first-rounder and a $10 second are different
 * decisions and the rate is the whole difference.
 */

export type ClockSlot = {
  slot: number;
  label: string;
  round: number;
  teamName: string;
  teamId: number;
  overdue: boolean;
  expiresAt: string | null;
  yours: boolean;
};

type Player = {
  id: number;
  name: string;
  position: string;
  nflTeam: string;
  headshotUrl: string | null;
};

export function OnTheClock({
  slots,
  players,
  rates,
  isCommissioner,
}: {
  slots: ClockSlot[];
  players: Player[];
  rates: { pickNumber: number; position: string; amount: number }[];
  isCommissioner: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [slot, setSlot] = useState(slots[0]?.slot ?? 0);
  const [q, setQ] = useState("");
  const [chosen, setChosen] = useState<Player | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped on a successful pick; the value is the animation's key, so a second
  // pick restarts it rather than joining one already in flight.
  const [celebrate, setCelebrate] = useState(0);

  const active = slots.find((s) => s.slot === slot) ?? slots[0];

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return players.filter((p) => p.name.toLowerCase().includes(needle)).slice(0, 8);
  }, [q, players]);

  // What it costs to keep them, from the grid — pick number and position.
  const rate = useMemo(() => {
    if (!chosen || !active) return null;
    return rates.find((r) => r.pickNumber === active.slot && r.position === chosen.position)?.amount ?? null;
  }, [chosen, active, rates]);

  const submit = (selection: "HOLDOVER" | "TOP") =>
    start(async () => {
      setError(null);
      const res = await makeDraftPick({ slot: active.slot, playerId: chosen!.id, selection });
      if (res.ok) {
        setChosen(null);
        setQ("");
        setCelebrate((n) => n + 1);
        router.refresh();
      } else setError(res.error);
    });

  if (!active) return null;

  return (
    <>
      <Confetti fire={celebrate} />
    <Card className="border-attention/50">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-bold">
            {active.yours ? "You're on the clock" : `${active.teamName} is on the clock`}
          </span>
          <Badge variant={active.overdue ? "destructive" : "warning"}>
            {active.overdue || !active.expiresAt ? (
              "overdue"
            ) : (
              /*
                No "left" here. Badge is an inline-flex container, so a bare
                text node beside the clock becomes its own flex item and the
                whitespace between them is thrown away — "11:58:51left". The
                word adds nothing next to "is on the clock" anyway.
              */
              <Countdown expiresAt={active.expiresAt} expiredLabel="time's up" />
            )}
          </Badge>
          <span className="text-sm text-muted-foreground">Pick {active.label}</span>
        </div>

        {slots.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {slots.map((s) => (
              <Button
                key={s.slot}
                size="sm"
                variant={s.slot === active.slot ? "default" : "outline"}
                onClick={() => { setSlot(s.slot); setChosen(null); setQ(""); }}
              >
                {s.label} · {s.teamName}
              </Button>
            ))}
          </div>
        )}

        {!active.yours && isCommissioner && (
          <Alert variant="warning">
            <AlertTitle>Picking for {active.teamName}</AlertTitle>
            <AlertDescription>This will be recorded as made on their behalf.</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Not recorded</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!chosen ? (
          <div className="space-y-2">
            {/*
              No autoFocus. On a phone this is opened straight from a text
              message, and focusing on load threw the keyboard up over the page
              before anyone could see whose pick it was or how long was left.
            */}
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Start typing a rookie's name…"
              aria-label="Find a rookie"
            />
            {matches.length > 0 && (
              <ul className="space-y-1">
                {matches.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setChosen(p)}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
                    >
                      <span className="relative size-9 shrink-0 overflow-hidden rounded-full border bg-muted/30">
                        {p.headshotUrl ? (
                          <Image src={p.headshotUrl} alt="" fill sizes="36px" className="object-cover" unoptimized />
                        ) : (
                          <span className="flex h-full items-center justify-center text-xs font-bold text-muted-foreground/50">
                            {p.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                          </span>
                        )}
                      </span>
                      <span>
                        <span className="font-medium">{p.name}</span>{" "}
                        <span className="text-sm text-muted-foreground">
                          {p.position} · {p.nflTeam}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {q.trim() && matches.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nobody by that name is still available.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="relative size-16 shrink-0 overflow-hidden rounded-full border bg-muted/30">
                {chosen.headshotUrl ? (
                  <Image src={chosen.headshotUrl} alt="" fill sizes="64px" className="object-cover" unoptimized />
                ) : (
                  <span className="flex h-full items-center justify-center text-lg font-bold text-muted-foreground/50">
                    {chosen.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                  </span>
                )}
              </span>
              <span>
                <span className="text-lg font-bold">{chosen.name}</span>
                <span className="block text-sm text-muted-foreground">
                  {chosen.position} · {chosen.nflTeam}
                </span>
              </span>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setChosen(null)}>
                Change
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                loading={pending}
                disabled={pending || rate == null}
                onClick={() => submit("HOLDOVER")}
              >
                Hold over{rate != null ? ` for $${rate}` : ""}
              </Button>
              <Button
                variant="outline"
                loading={pending}
                disabled={pending}
                onClick={() => submit("TOP")}
              >
                Top at the auction
              </Button>
            </div>
            {rate == null && (
              <p className="text-sm text-destructive">
                No holdover rate is set for pick {active.label} at {chosen.position}. A
                commissioner needs to add one before this player can be held over.
              </p>
            )}
            {/*
              Not "under contract" — the manual is explicit that holding over
              signs them for the year, and whether they go on a 3-year deal is
              a separate decision made later.
            */}
            <p className="text-xs text-muted-foreground">
              Holding over puts them on your roster at that salary — no contract, which stays
              your call after the auction. Topping keeps the right to top them at the auction
              instead. Neither can be undone.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
    </>
  );
}
