"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  recordAuctionWin,
  undoAuctionWin,
  refileAuctionWin,
} from "@/lib/actions/auction-actions";
import { openNomination, closeNomination } from "@/lib/actions/auction-actions";

/*
 * The auction room — v1's three columns, kept on purpose.
 *
 * Won Players | Team Info | League Snapshot, under a commissioner entry bar
 * that refocuses the player box after every submit so the whole auction can be
 * driven without touching the mouse. The tables run dense: this page lives on
 * a laptop at the front of a room, and fitting more rows beats fitting bigger
 * ones.
 */

type Team = { id: number; name: string; abbreviation: string };
type Money = { teamId: number; allocation: number; committed: number; toSpend: number };
type RosterRow = {
  playerId: number; name: string; position: string; nflTeam: string;
  salary: number; contractEndSeason: number | null; designation: string; isBackToBack: boolean;
};
type Win = {
  transactionId: number; playerId: number; playerName: string; position: string;
  nflTeam: string; bid: number; teamId: number; topped: boolean; at: string;
};
type PoolPlayer = { id: number; name: string; position: string; nflTeam: string };
type Right = { kind: "NAMED" | "AUTOMATIC"; teamId: number; teamName: string };

const POSITIONS = ["QB", "RB", "WR", "TE", "K"] as const;

/** v1's traffic light for money: comfortable, thin, gone. */
const moneyTone = (n: number) =>
  n < 0 ? "text-destructive" : n < 50 ? "text-attention" : "text-success";

/** The dense-table cell, named once. */
const cell = "px-1.5 py-0.5 text-xs";

export function AuctionRoom({
  teams, money, rosters, wins, pool, rights, viewerTeamId, isCommissioner,
}: {
  teams: Team[];
  money: Money[];
  rosters: { teamId: number; rows: RosterRow[] }[];
  wins: Win[];
  pool: PoolPlayer[];
  rights: Record<number, Right[]>;
  viewerTeamId: number | null;
  isCommissioner: boolean;
}) {
  const teamOf = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const moneyOf = useMemo(() => new Map(money.map((m) => [m.teamId, m])), [money]);

  const [selectedTeamId, setSelectedTeamId] = useState(viewerTeamId ?? teams[0]?.id ?? 0);
  const roster = rosters.find((r) => r.teamId === selectedTeamId)?.rows ?? [];
  const strip = moneyOf.get(selectedTeamId);

  return (
    <div className="space-y-4">
      {isCommissioner && <EntryBar teams={teams} pool={pool} rights={rights} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ---- Won Players ---- */}
        <Card>
          <CardContent className="p-2">
            <WonTable
              wins={wins}
              teamOf={teamOf}
              viewerTeamId={viewerTeamId}
              isCommissioner={isCommissioner}
              teams={teams}
            />
          </CardContent>
        </Card>

        {/* ---- Team Info ---- */}
        <Card>
          <CardContent className="space-y-3 p-3">
            <div className="flex items-center justify-between gap-2">
              <Select
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(Number(e.target.value))}
                className={selectedTeamId === viewerTeamId ? "font-bold text-attention" : ""}
                aria-label="Team to inspect"
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
              <Link
                href={`/transactions?team=${encodeURIComponent(teamOf.get(selectedTeamId)?.abbreviation ?? "")}`}
                className="shrink-0 text-xs text-primary underline-offset-4 hover:underline"
              >
                Ledger
              </Link>
            </div>

            {strip && (
              <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
                <span className="whitespace-nowrap text-muted-foreground">
                  To Spend @Auction{" "}
                  <span className={`font-semibold ${moneyTone(strip.toSpend)}`}>${strip.toSpend}</span>
                </span>
                <span className="whitespace-nowrap text-muted-foreground">
                  Rostered Salary <span className="font-semibold text-foreground">${strip.committed}</span>
                </span>
                <span className="whitespace-nowrap text-muted-foreground">
                  Adjusted Salary Cap <span className="font-semibold text-foreground">${strip.allocation}</span>
                </span>
              </p>
            )}

            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50 text-muted-foreground">
                  <th className={`${cell} text-left font-semibold`}>Player</th>
                  <th className={`${cell} text-center font-semibold`}>Pos</th>
                  <th className={`${cell} text-center font-semibold`}>$</th>
                  <th className={`${cell} text-center font-semibold`}>Contract</th>
                  <th className={`${cell} text-center font-semibold`}>NFL</th>
                </tr>
              </thead>
              <tbody>
                {roster.length === 0 ? (
                  <tr><td colSpan={5} className={`${cell} py-2 text-center text-muted-foreground`}>Empty roster</td></tr>
                ) : (
                  [...roster]
                    .sort((a, b) =>
                      POSITIONS.indexOf(a.position as never) - POSITIONS.indexOf(b.position as never) ||
                      b.salary - a.salary
                    )
                    .map((r) => (
                      <tr key={r.playerId} className="border-b last:border-0 hover:bg-muted/30">
                        <td className={`${cell} font-medium`}>{r.name}</td>
                        <td className={`${cell} text-center`}>{r.position}</td>
                        <td className={`${cell} text-center tabular-nums`}>${r.salary}</td>
                        <td className={`${cell} text-center`}>
                          {r.contractEndSeason ?? "—"}{r.isBackToBack ? "*" : ""}
                        </td>
                        <td className={`${cell} text-center text-muted-foreground`}>{r.nflTeam}</td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* ---- League Snapshot ---- */}
        <Card>
          <CardContent className="p-2">
            <div className="mb-1 text-center text-sm font-bold">League Snapshot</div>
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50 text-muted-foreground">
                  <th className={`${cell} text-left font-semibold`}>Team</th>
                  <th className={`${cell} text-center font-semibold`}>Remaining</th>
                  {POSITIONS.map((p) => (
                    <th key={p} className={`${cell} text-center font-semibold`}>{p}</th>
                  ))}
                  <th className={`${cell} text-center font-semibold`}>Total</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t) => {
                  const rows = rosters.find((r) => r.teamId === t.id)?.rows ?? [];
                  const m = moneyOf.get(t.id)!;
                  const mine = t.id === viewerTeamId;
                  return (
                    <tr key={t.id} className={`border-b last:border-0 hover:bg-muted/30 ${mine ? "font-bold text-attention" : ""}`}>
                      <td className={`${cell} whitespace-nowrap`}>{t.abbreviation}</td>
                      <td className={`${cell} text-center tabular-nums font-semibold ${moneyTone(m.toSpend)}`}>
                        ${m.toSpend}
                      </td>
                      {POSITIONS.map((p) => (
                        <td key={p} className={`${cell} text-center tabular-nums`}>
                          {rows.filter((r) => r.position === p).length}
                        </td>
                      ))}
                      <td className={`${cell} text-center tabular-nums`}>{rows.length}</td>
                    </tr>
                  );
                })}
                <tr className="border-t bg-muted/30 font-semibold">
                  <td className={cell}>Totals</td>
                  <td className={`${cell} text-center tabular-nums`}>
                    ${money.reduce((s, m) => s + m.toSpend, 0)}
                  </td>
                  {POSITIONS.map((p) => (
                    <td key={p} className={`${cell} text-center tabular-nums`}>
                      {rosters.reduce((s, r) => s + r.rows.filter((x) => x.position === p).length, 0)}
                    </td>
                  ))}
                  <td className={`${cell} text-center tabular-nums`}>
                    {rosters.reduce((s, r) => s + r.rows.length, 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function EntryBar({ teams, pool, rights }: {
  teams: Team[];
  pool: PoolPlayer[];
  rights: Record<number, Right[]>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const playerBox = useRef<HTMLInputElement>(null);

  const [q, setQ] = useState("");
  const [player, setPlayer] = useState<PoolPlayer | null>(null);
  const [bid, setBid] = useState("");
  const [teamId, setTeamId] = useState(0);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [active, setActive] = useState(0);
  // Render-time reset (React's sanctioned pattern) — the highlight goes back
  // to the top whenever the query changes.
  const [lastQ, setLastQ] = useState(q);
  if (lastQ !== q) { setLastQ(q); setActive(0); }
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle || player) return [];
    return pool.filter((p) => p.name.toLowerCase().includes(needle)).slice(0, 8);
  }, [q, pool, player]);

  const held = player ? rights[player.id] ?? [] : [];
  const bidN = Number(bid);
  const ready = player && Number.isInteger(bidN) && bidN >= 1 && teamId > 0;

  const reset = () => {
    setPlayer(null); setQ(""); setBid(""); setTeamId(0); setNote("");
    // The whole auction is driven from this box; every submit hands it back.
    playerBox.current?.focus();
  };

  /*
   * Selecting a player IS the nomination — bidding has opened in the room, and
   * other live views fire from this signal. Clearing
   * the selection (wrong player, re-nomination) closes it; the recorded win
   * closes it server-side. Fire-and-forget: the auction never waits on it.
   */
  const nominate = (p: PoolPlayer) => {
    setPlayer(p);
    openNomination(p.id).catch(() => {});
  };
  const unnominate = () => {
    setPlayer(null);
    closeNomination().catch(() => {});
  };

  const file = (topped?: { byTeamId: number }) =>
    start(async () => {
      setError(null);
      const res = await recordAuctionWin({
        playerId: player!.id, teamId, bid: bidN, note: note || undefined, topped,
      });
      if (res.ok) { reset(); router.refresh(); }
      else setError(res.error);
    });

  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Not recorded</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-start gap-2">
          <div className="relative w-full min-w-56 lg:max-w-xs lg:flex-1">
            <Input
              ref={playerBox}
              autoFocus
              value={player ? player.name : q}
              onChange={(e) => { if (player) unnominate(); setQ(e.target.value); }}
              onKeyDown={(e) => {
                // Arrows walk the suggestions, Enter nominates — the whole
                // auction is typed, so the mouse should never be required.
                if (!matches.length) return;
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                if (e.key === "Enter" && matches[active]) { e.preventDefault(); nominate(matches[active]); setQ(""); }
                if (e.key === "Escape") setQ("");
              }}
              placeholder="Player…"
              aria-label="Player won"
            />
            {matches.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
                {matches.map((p, i) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={`w-full rounded px-2 py-1 text-left text-sm ${i === active ? "bg-accent" : ""}`}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => { nominate(p); setQ(""); }}
                    >
                      <span className="font-medium">{p.name}</span>{" "}
                      <span className="text-muted-foreground">{p.position} · {p.nflTeam}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Input
            type="number" min={1} value={bid} placeholder="$"
            className="w-20" aria-label="Winning bid"
            onChange={(e) => setBid(e.target.value)}
          />

          <Select
            value={teamId} className="w-56 shrink-0" aria-label="Winning team"
            onChange={(e) => setTeamId(Number(e.target.value))}
          >
            <option value={0}>Team…</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>

          <Input
            value={note} placeholder="Note (optional)" className="min-w-32 flex-1"
            aria-label="Note" onChange={(e) => setNote(e.target.value)}
          />

          <Button onClick={() => file()} loading={pending} disabled={pending || !ready}>
            Record win
          </Button>
        </div>

        {/*
          The warning that used to live in people's heads: the player being
          entered is somebody's to top. One click files it at +$1 — for a
          named right, consuming it in the same transaction.
        */}
        {player && held.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {held.map((r) => (
              <span key={r.teamId} className="flex items-center gap-2 rounded-md border border-attention/50 bg-attention/10 px-2 py-1 text-xs">
                <span>
                  <strong>{r.teamName}</strong>{" "}
                  {r.kind === "NAMED" ? "holds a topper on him" : "may top — expiring contract"}
                </span>
                <Button
                  size="sm" variant="outline" disabled={pending || !ready}
                  onClick={() => file({ byTeamId: r.teamId })}
                >
                  Topped · ${Number.isInteger(bidN) && bidN >= 1 ? bidN + 1 : "?"}
                </Button>
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

type SortKey = "at" | "player" | "position" | "nfl" | "bid" | "team";

function WonTable({ wins, teamOf, viewerTeamId, isCommissioner, teams }: {
  wins: Win[];
  teamOf: Map<number, Team>;
  viewerTeamId: number | null;
  isCommissioner: boolean;
  teams: Team[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "at", dir: -1 });
  const [editing, setEditing] = useState<number | null>(null);
  const [editBid, setEditBid] = useState("");
  const [editTeam, setEditTeam] = useState(0);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const v = (w: Win): string | number => {
      switch (sort.key) {
        case "player": return w.playerName;
        case "position": return w.position;
        case "nfl": return w.nflTeam;
        case "bid": return w.bid;
        case "team": return teamOf.get(w.teamId)?.abbreviation ?? "";
        case "at": return w.at;
      }
    };
    return [...wins].sort((a, b) => {
      const x = v(a), y = v(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [wins, sort, teamOf]);

  const header = (key: SortKey, label: string, align = "text-center") => (
    <th className={`${cell} ${align} cursor-pointer select-none font-semibold`}
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
      {label}{sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
    </th>
  );

  const save = (w: Win) =>
    start(async () => {
      setError(null);
      const res = await refileAuctionWin(w.transactionId, {
        bid: Number(editBid), teamId: editTeam,
      });
      if (res.ok) { setEditing(null); router.refresh(); }
      else setError(res.error);
    });

  const remove = (w: Win) =>
    start(async () => {
      setError(null);
      const res = await undoAuctionWin(w.transactionId);
      if (res.ok) { setConfirming(null); router.refresh(); }
      else setError(res.error);
    });

  return (
    <div>
      {error && <p className="px-2 pb-1 text-xs text-destructive">{error}</p>}
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50 text-muted-foreground">
            {header("player", "Player", "text-left")}
            {header("position", "Pos")}
            {header("nfl", "NFL")}
            {header("bid", "$")}
            {header("team", "Team", "text-left")}
            {isCommissioner && <th className={`${cell} text-right font-semibold`} />}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={isCommissioner ? 6 : 5} className={`${cell} py-3 text-center text-muted-foreground`}>
                No wins yet — the auction starts here.
              </td>
            </tr>
          ) : (
            sorted.map((w) => {
              const mine = w.teamId === viewerTeamId;
              const isEditing = editing === w.transactionId;
              return (
                <tr key={w.transactionId}
                    className={`border-b last:border-0 hover:bg-muted/30 ${mine ? "font-bold text-attention" : ""}`}>
                  <td className={`${cell} font-medium`}>
                    {w.playerName}
                    {w.topped && <span className="ml-1 text-[10px] text-muted-foreground">topped</span>}
                  </td>
                  <td className={`${cell} text-center`}>{w.position}</td>
                  <td className={`${cell} text-center text-muted-foreground`}>{w.nflTeam}</td>
                  <td className={`${cell} text-center tabular-nums`}>
                    {isEditing ? (
                      <Input type="number" min={1} value={editBid} className="h-6 w-16 text-xs"
                             onChange={(e) => setEditBid(e.target.value)} aria-label="Corrected bid" />
                    ) : (
                      `$${w.bid}`
                    )}
                  </td>
                  <td className={cell}>
                    {isEditing ? (
                      <Select value={editTeam} className="h-6 w-24 text-xs"
                              onChange={(e) => setEditTeam(Number(e.target.value))} aria-label="Corrected team">
                        {teams.map((t) => <option key={t.id} value={t.id}>{t.abbreviation}</option>)}
                      </Select>
                    ) : (
                      teamOf.get(w.teamId)?.abbreviation ?? "?"
                    )}
                  </td>
                  {isCommissioner && (
                    <td className={`${cell} text-right`}>
                      {isEditing ? (
                        <span className="inline-flex gap-1">
                          <button type="button" disabled={pending} onClick={() => save(w)}
                                  className="text-success hover:opacity-80" aria-label="Save correction">
                            <Check className="size-3.5" />
                          </button>
                          <button type="button" onClick={() => setEditing(null)}
                                  className="text-muted-foreground hover:opacity-80" aria-label="Cancel">
                            <X className="size-3.5" />
                          </button>
                        </span>
                      ) : confirming === w.transactionId ? (
                        <span className="inline-flex items-center gap-1 text-[10px]">
                          undo?
                          <button type="button" disabled={pending} onClick={() => remove(w)}
                                  className="text-destructive hover:opacity-80" aria-label={`Undo ${w.playerName}`}>
                            <Check className="size-3.5" />
                          </button>
                          <button type="button" onClick={() => setConfirming(null)}
                                  className="text-muted-foreground hover:opacity-80" aria-label="Keep it">
                            <X className="size-3.5" />
                          </button>
                        </span>
                      ) : (
                        <span className="inline-flex gap-1.5">
                          <button type="button"
                                  onClick={() => { setEditing(w.transactionId); setEditBid(String(w.bid)); setEditTeam(w.teamId); setConfirming(null); }}
                                  className="text-muted-foreground transition-colors hover:text-primary" aria-label={`Correct ${w.playerName}`}>
                            <Pencil className="size-3.5" />
                          </button>
                          <button type="button"
                                  onClick={() => { setConfirming(w.transactionId); setEditing(null); }}
                                  className="text-muted-foreground transition-colors hover:text-destructive" aria-label={`Undo ${w.playerName}`}>
                            <Trash2 className="size-3.5" />
                          </button>
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
