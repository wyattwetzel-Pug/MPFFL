"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { submitDeclaration, retractDeclaration } from "@/lib/actions/declare-actions";

/*
 * §16.9 — one screen, two rights. Every submit is a ledger write, so
 * everything here keeps an explicit two-step confirm (working agreement:
 * submissions never autosave). Holdovers say "public, instant"; tops say
 * "secret" — the difference is the point of the page.
 */

type Player = {
  playerId: number;
  name: string;
  position: string;
  salary: number;
  b2b: boolean;
  holdPrice: number | null;
  declared: { transactionId: number; kind: "HOLD" | "TOP"; price: number | null } | null;
};

type Filed = {
  transactionId: number;
  playerName: string;
  position: string;
  kind: "HOLD" | "TOP";
  price: number | null;
  filedAt: string;
};

export function DeclarationsView({
  season, teamId, teamName, teams, eligibility, filed,
}: {
  season: number;
  teamId: number;
  teamName: string;
  /** Non-null only for commissioners — the team switcher. */
  teams: { id: number; name: string }[] | null;
  eligibility: {
    expiring: Player[];
    compTargets: Player[];
    thUnused: number;
    allocation: number;
    committed: number;
  } | null;
  filed: Filed[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<{ playerId: number; kind: "HOLD" | "TOP" } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = (playerId: number, kind: "HOLD" | "TOP") =>
    start(async () => {
      setError(null);
      const res = await submitDeclaration(teamId, playerId, kind);
      if (!res.ok) setError(res.error);
      setConfirm(null);
      router.refresh();
    });

  const withdraw = (transactionId: number) =>
    start(async () => {
      setError(null);
      const res = await retractDeclaration(transactionId);
      if (!res.ok) setError(res.error);
      router.refresh();
    });

  const DeclareButtons = ({ p, comp }: { p: Player; comp: boolean }) => {
    if (p.declared) {
      return (
        <span className="text-xs text-muted-foreground">
          {p.declared.kind === "HOLD" ? `held at $${p.declared.price}` : "top filed"}
        </span>
      );
    }
    const confirming = confirm?.playerId === p.playerId ? confirm.kind : null;
    if (confirming) {
      return (
        <span className="flex items-center gap-1.5">
          <Button size="sm" variant="destructive" disabled={pending} loading={pending}
            onClick={() => act(p.playerId, confirming)}>
            Confirm {confirming === "HOLD" ? `$${p.holdPrice} — public, instant` : "secret top"}
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirm(null)}>
            Cancel
          </Button>
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5">
        {p.holdPrice != null && (
          <Button size="sm" variant="outline" disabled={pending}
            onClick={() => setConfirm({ playerId: p.playerId, kind: "HOLD" })}>
            Hold over — ${p.holdPrice}
          </Button>
        )}
        {p.b2b && <span className="text-xs text-muted-foreground">B2B — topper only, nothing to file</span>}
        {comp && (
          <Button size="sm" variant="outline" disabled={pending}
            onClick={() => setConfirm({ playerId: p.playerId, kind: "TOP" })}>
            Secret top
          </Button>
        )}
      </span>
    );
  };

  const Row = ({ p, comp }: { p: Player; comp: boolean }) => (
    <div className="flex flex-wrap items-center gap-2 border-b border-border/60 py-1.5 last:border-0">
      <span className="min-w-0 flex-1 truncate text-sm">
        {p.name}{" "}
        <span className="text-xs text-muted-foreground">
          {p.position} · was ${p.salary}
        </span>
      </span>
      <DeclareButtons p={p} comp={comp} />
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <PageHeader title={`${season} Declarations`} />
        {teams && (
          <Select
            value={teamId}
            className="w-56"
            aria-label="Team"
            onChange={(e) => router.push(`/declarations?team=${e.target.value}`)}
          >
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        <b className="text-foreground">{teamName}</b>
        {eligibility && (
          <>
            {" · "}${eligibility.committed} committed of ${eligibility.allocation} — $
            {eligibility.allocation - eligibility.committed} to spend at auction
          </>
        )}
      </p>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!eligibility || (eligibility.expiring.length === 0 && eligibility.compTargets.length === 0 && filed.length === 0) ? (
        <Alert>
          <AlertDescription>
            Nothing to declare yet — declarations open once the pre-auction roster clear has run for your team.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {eligibility.expiring.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Coming off contract — your holdover right</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-2 text-xs text-muted-foreground">
                  Holding over is <b>public and instant</b>: the player rejoins your roster at the
                  price shown and your auction money drops immediately. Not holding? Your automatic
                  +$1 topper works in the room — there is nothing to file.
                </p>
                {eligibility.expiring.map((p) => <Row key={p.playerId} p={p} comp={false} />)}
              </CardContent>
            </Card>
          )}

          {(eligibility.compTargets.length > 0 && (eligibility.thUnused > 0 || eligibility.compTargets.some((p) => p.declared))) && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Compensatory T/H — {eligibility.thUnused} unused
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-2 text-xs text-muted-foreground">
                  Spend a T/H right on a player from your cleared roster: hold him over (public,
                  instant, at the price shown) or file a <b>secret top</b> — recorded now, revealed
                  only when bidding on him ends. Either way the right is consumed.
                </p>
                {eligibility.compTargets.map((p) => <Row key={p.playerId} p={p} comp />)}
              </CardContent>
            </Card>
          )}

          {filed.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Filed</CardTitle></CardHeader>
              <CardContent>
                {filed.map((d) => (
                  <div key={d.transactionId} className="flex flex-wrap items-center gap-2 border-b border-border/60 py-1.5 text-sm last:border-0">
                    <span className="min-w-0 flex-1 truncate">
                      {d.kind === "HOLD" ? (
                        <>Holdover — {d.playerName} at ${d.price}</>
                      ) : (
                        <>Secret top — {d.playerName}</>
                      )}{" "}
                      <span className="text-xs text-muted-foreground">{d.position}</span>
                    </span>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => withdraw(d.transactionId)}>
                      Withdraw
                    </Button>
                  </div>
                ))}
                <p className="mt-2 text-xs text-muted-foreground">
                  Withdrawing is allowed until the auction starts and undoes everything — the
                  roster spot, the money, the spent right.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
