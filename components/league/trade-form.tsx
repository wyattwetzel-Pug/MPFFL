"use client";

import { useCallback, useEffect, useMemo, useReducer, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { submitTrade, type TradeAsset } from "@/lib/actions/submit-trade";
import { checkTradeShape } from "@/lib/trade-shape";
import { PICK_HORIZON, type TeamAssets } from "@/lib/ledger/derive";
import { validateProposal, blocking, warnings, type ProposedEntry, type TeamSnapshot } from "@/lib/ledger/validate";
import type { AssetType } from "@prisma/client";

/*
 * Filing a trade, between however many teams the deal names.
 *
 * Three ideas carry this form. First, asset types are a property of the
 * *deal*, not of each side — "this is a player-for-pick trade" is one
 * decision, so the toggles are shared and each selected type opens a module
 * with a column per team. Nothing reconfigures in place; modules appear and
 * leave.
 *
 * Second, every item is a *leg*: sender, recipient, asset — which is exactly
 * what the ledger stores. With two teams the recipient is the only other team,
 * so nothing is shown or asked and the form is precisely its old two-sided
 * self. From the third team on, each item's row grows a small "→ team" select,
 * prefilled with the first other team. Adding stays one click; correcting a
 * recipient is one change, made where the item is listed.
 *
 * Third, the running summary calls the same `checkTradeShape` and
 * `validateProposal` the server calls, over the same derived holdings. Two
 * implementations of "is this legal" is precisely how a form and its ledger
 * start disagreeing.
 *
 * v1 wrote all of this twice — `user*` and `partner*` state for every asset
 * type, 1,722 lines — and still couldn't file the three-team deal that
 * prompted this rewrite.
 */

export type TradePlayer = {
  playerId: number;
  name: string;
  position: string;
  salary: number;
  contractEndSeason: number | null;
  /** Which season an uncontracted salary belongs to — see lib/ledger/commitment. */
  acquiredForSeason: number | null;
};

export type TradeTeam = {
  id: number;
  name: string;
  players: TradePlayer[];
  /** Derived holdings per season, serialisable for the client. */
  seasons: TeamAssets[];
  /** Multi-year salary per season. */
  contracted: [number, number][];
  /** Every dollar owed per season, holdovers included, for the cap check. */
  committed: [number, number][];
};

/*
 * "NAMED_TOPPER" is not an AssetType — it's a TOPPER_HOLDOVER with a player
 * attached. The form keeps them in separate modules because they're separate
 * things to an owner: one is spendable on anybody, the other is that rookie's
 * and nobody else's.
 */
type Group = "PLAYER" | "ROOKIE_PICK" | "NAMED_TOPPER" | AssetType;

const COUNTABLE: {
  value: AssetType;
  label: string;
  held: keyof TeamAssets;
  money?: boolean;
  guaranteed: boolean;
}[] = [
  { value: "CAP_DOLLARS", label: "Cap $", held: "capDollars", money: true, guaranteed: true },
  { value: "PS_SPOT", label: "PS spots", held: "psSpots", guaranteed: true },
  { value: "CONDITIONAL_CUT", label: "Cond. cuts", held: "conditionalCuts", guaranteed: true },
  // Awarded only to teams that miss the playoffs, so they can't be traded
  // ahead — nobody knows yet who will hold one.
  { value: "UNCONDITIONAL_CUT", label: "Uncond. cuts", held: "unconditionalCuts", guaranteed: false },
  { value: "TOPPER_HOLDOVER", label: "Topper / Holdover", held: "topperHoldovers", guaranteed: false },
];

/** One leg in the making: what moves, and to whom. */
type Item = TradeAsset & { key: string; label: string; toTeamId: number };

/** Items keyed by the team sending them. */
type State = Record<number, Item[]>;

type Action =
  | { kind: "add"; senderId: number; item: Item }
  | { kind: "remove"; senderId: number; key: string }
  | { kind: "retarget"; senderId: number; key: string; toTeamId: number }
  | { kind: "dropGroup"; group: Group }
  | { kind: "dropTeam"; teamId: number }
  | { kind: "clear" };

const groupOf = (i: Item): Group =>
  i.assetType === "TOPPER_HOLDOVER" && i.playerId != null ? "NAMED_TOPPER" : i.assetType;

function reducer(state: State, action: Action): State {
  switch (action.kind) {
    case "add": {
      const mine = state[action.senderId] ?? [];
      if (mine.some((i) => i.key === action.item.key)) return state;
      return { ...state, [action.senderId]: [...mine, action.item] };
    }
    case "remove":
      return {
        ...state,
        [action.senderId]: (state[action.senderId] ?? []).filter((i) => i.key !== action.key),
      };
    case "retarget":
      return {
        ...state,
        [action.senderId]: (state[action.senderId] ?? []).map((i) =>
          i.key === action.key ? { ...i, toTeamId: action.toTeamId } : i
        ),
      };
    case "dropGroup": {
      // Turning a type off takes its pieces with it, so the summary can never
      // reflect something no longer on screen.
      const next: State = {};
      for (const [id, items] of Object.entries(state))
        next[Number(id)] = items.filter((i) => groupOf(i) !== action.group);
      return next;
    }
    case "dropTeam": {
      // A team leaving the deal takes its legs with it, in both directions —
      // an item aimed at a team no longer present would misstate the deal.
      const next: State = {};
      for (const [id, items] of Object.entries(state)) {
        if (Number(id) === action.teamId) continue;
        next[Number(id)] = items.filter((i) => i.toTeamId !== action.teamId);
      }
      return next;
    }
    case "clear":
      return {};
  }
}

/*
 * Countable items get generated keys so the same asset type can ride two legs
 * — $3 of cap to one team and $17 to another was the deal that forced this.
 * Players, picks and named toppers keep natural keys: the dedup on `add` is
 * what stops the same player being offered twice by one sender.
 */
let seq = 0;
const freshKey = (prefix: string) => `${prefix}#${++seq}`;

const yearsFor = (guaranteed: boolean, season: number) =>
  guaranteed ? Array.from({ length: PICK_HORIZON + 1 }, (_, i) => season + i) : [season];

/** One team's contribution within a module: what's chosen, and how to add more. */
function TeamColumn({
  team,
  others,
  items,
  children,
  dispatch,
}: {
  team: TradeTeam;
  /** The rest of the deal — recipients an item can be aimed at. */
  others: TradeTeam[];
  items: Item[];
  children: React.ReactNode;
  dispatch: React.Dispatch<Action>;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-bold">{team.name} sends</div>
      {children}
      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((i) => (
            <li key={i.key} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-2 py-1 text-sm">
              <span className="min-w-0">{i.label}</span>
              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                {others.length > 1 ? (
                  /*
                   * Only when the recipient is a real question. With two teams
                   * in the deal there is exactly one place this can go, and a
                   * control repeating that would be noise.
                   */
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    →
                    <Select
                      value={i.toTeamId}
                      className="h-7 w-36 text-xs"
                      aria-label={`Recipient of ${i.label}`}
                      onChange={(e) =>
                        dispatch({ kind: "retarget", senderId: team.id, key: i.key, toTeamId: Number(e.target.value) })
                      }
                    >
                      {others.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </Select>
                  </label>
                ) : (
                  <span className="text-xs text-muted-foreground">→ {others[0]?.name}</span>
                )}
                <button
                  type="button"
                  onClick={() => dispatch({ kind: "remove", senderId: team.id, key: i.key })}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                  aria-label={`Remove ${i.label}`}
                >
                  <X className="size-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PlayerPicker({ team, others, items, dispatch, season }: {
  team: TradeTeam; others: TradeTeam[]; items: Item[]; dispatch: React.Dispatch<Action>; season: number;
}) {
  const [q, setQ] = useState("");
  const taken = new Set(items.map((i) => i.key));
  const matches = team.players.filter(
    (p) => !taken.has(`PLAYER:${p.playerId}`) && p.name.toLowerCase().includes(q.trim().toLowerCase())
  );
  return (
    <TeamColumn team={team} others={others} items={items} dispatch={dispatch}>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a player…" />
      <ul className="max-h-56 space-y-0.5 overflow-y-auto">
        {matches.slice(0, 40).map((p) => (
          <li key={p.playerId}>
            <button
              type="button"
              className="w-full rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-accent"
              onClick={() =>
                dispatch({
                  kind: "add", senderId: team.id,
                  item: {
                    key: `PLAYER:${p.playerId}`, assetType: "PLAYER", seasonYear: season,
                    amount: p.salary, playerId: p.playerId, toTeamId: others[0].id,
                    label: `${p.name} (${p.position}) $${p.salary}${p.contractEndSeason ? ` through ${p.contractEndSeason}` : ""}`,
                  },
                })
              }
            >
              <span className="font-medium">{p.name}</span>{" "}
              <span className="text-muted-foreground">
                {p.position} · ${p.salary}
                {p.contractEndSeason ? ` · through ${p.contractEndSeason}` : " · expiring"}
              </span>
            </button>
          </li>
        ))}
        {matches.length === 0 && <li className="px-2 py-1 text-sm text-muted-foreground">No match.</li>}
      </ul>
    </TeamColumn>
  );
}

function PickPicker({ team, others, items, dispatch }: {
  team: TradeTeam; others: TradeTeam[]; items: Item[]; dispatch: React.Dispatch<Action>;
}) {
  const taken = new Set(items.map((i) => i.key));
  const held = team.seasons.flatMap((a) =>
    a.rookiePicks.map((p) => ({ ...p, seasonYear: a.seasonYear }))
  );
  return (
    <TeamColumn team={team} others={others} items={items} dispatch={dispatch}>
      <div className="flex flex-wrap gap-1.5">
        {held.map((p) => {
          const key = `ROOKIE_PICK:${p.seasonYear}:${p.round}:${p.pickNumber ?? "x"}:${p.originTeamId ?? "own"}`;
          if (taken.has(key)) return null;
          const label =
            p.pickNumber != null
              ? `${p.seasonYear} ${p.round}.${String(p.pickNumber).padStart(2, "0")}`
              : `${p.seasonYear} ${p.round === 1 ? "1st" : "2nd"}`;
          return (
            <button
              key={key}
              type="button"
              className="rounded-md border px-2 py-1 text-sm transition-colors hover:bg-accent"
              onClick={() =>
                dispatch({
                  kind: "add", senderId: team.id,
                  item: {
                    key, assetType: "ROOKIE_PICK", seasonYear: p.seasonYear, amount: 1,
                    round: p.round, pickNumber: p.pickNumber, originTeamId: p.originTeamId,
                    toTeamId: others[0].id, label,
                  },
                })
              }
            >
              {label}
            </button>
          );
        })}
        {held.length === 0 && <span className="text-sm text-muted-foreground">No picks.</span>}
      </div>
    </TeamColumn>
  );
}

/*
 * Toppers on named players.
 *
 * Listed rather than counted, for the same reason they're listed everywhere
 * else: the asset is *which* player. A quantity box would be meaningless — you
 * hold the topper on Jeanty or you don't.
 */
function TopperPicker({ team, others, items, dispatch }: {
  team: TradeTeam; others: TradeTeam[]; items: Item[]; dispatch: React.Dispatch<Action>;
}) {
  const taken = new Set(items.map((i) => i.key));
  const held = team.seasons.flatMap((a) =>
    a.namedToppers.map((t) => ({ ...t, seasonYear: a.seasonYear }))
  );
  return (
    <TeamColumn team={team} others={others} items={items} dispatch={dispatch}>
      <div className="flex flex-wrap gap-1.5">
        {held.map((t) => {
          const key = `NAMED_TOPPER:${t.seasonYear}:${t.playerId}`;
          if (taken.has(key)) return null;
          const name = t.playerName ?? `Player #${t.playerId}`;
          const label = `${t.seasonYear} topper on ${name}`;
          return (
            <button
              key={key}
              type="button"
              className="rounded-md border px-2 py-1 text-sm transition-colors hover:bg-accent"
              onClick={() =>
                dispatch({
                  kind: "add", senderId: team.id,
                  item: {
                    key, assetType: "TOPPER_HOLDOVER", seasonYear: t.seasonYear,
                    amount: 1, playerId: t.playerId, toTeamId: others[0].id, label,
                  },
                })
              }
            >
              {name}
            </button>
          );
        })}
        {held.length === 0 && (
          <span className="text-sm text-muted-foreground">No topped rookies.</span>
        )}
      </div>
    </TeamColumn>
  );
}

function CountablePicker({ team, others, items, dispatch, spec, season, onPending }: {
  team: TradeTeam; others: TradeTeam[]; items: Item[]; dispatch: React.Dispatch<Action>;
  spec: (typeof COUNTABLE)[number]; season: number;
  /** Tells the form an amount is typed here but not yet added — see below. */
  onPending: (key: string, message: string | null) => void;
}) {
  const [amount, setAmount] = useState("");
  const [year, setYear] = useState(season);
  /*
   * The recipient is chosen where the amount is typed, not discovered on the
   * row afterwards. A player is picked from a visible list, so the row that
   * appears — with its "→ team" — is already under your eyes; an amount is
   * typed into a box, and a destination that only materialises after Add
   * reads as no way to choose one at all. Which is exactly how it was
   * reported. The row's select stays, for corrections.
   */
  const [toId, setToId] = useState(0);
  const recipient = others.find((o) => o.id === toId) ?? others[0];
  const [slip, setSlip] = useState<string | null>(null);

  /*
   * A typed amount that was never Added is invisible to the proposal, and a
   * filled-in row reads as included — the owner built a whole three-team deal
   * that way and got told a team "sends and receives nothing" with $17
   * sitting right there in the box. So an un-added amount becomes a blocking
   * message naming this box, and the File button stays off until it's either
   * added or cleared.
   */
  const pendingKey = `${team.id}:${spec.value}`;
  useEffect(() => {
    const n = Number(amount);
    onPending(
      pendingKey,
      amount.trim() && Number.isFinite(n) && n > 0
        ? `${team.name} has ${spec.money ? `$${n}` : n} of ${spec.label} typed but not added — press Add (or Enter) to include it, or clear the box.`
        : null
    );
    return () => onPending(pendingKey, null);
  }, [amount, pendingKey, team.name, spec.money, spec.label, onPending]);
  const years = yearsFor(spec.guaranteed, season);
  const holdings = team.seasons.find((a) => a.seasonYear === year);
  const have = (holdings?.[spec.held] as number) ?? 0;
  // What this module has already spoken for, so two adds can't overshoot.
  const already = items
    .filter((i) => i.assetType === spec.value && i.seasonYear === year)
    .reduce((sum, i) => sum + i.amount, 0);

  function add() {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return;
    if (n + already > have) {
      setSlip(`${team.name} holds ${spec.money ? `$${have}` : have} in ${year}${already ? `, and $${already} is already in this trade` : ""}.`);
      return;
    }
    setSlip(null);
    dispatch({
      kind: "add", senderId: team.id,
      item: {
        // Generated key: the same type and year may ride two legs to two
        // different teams, which a natural key would collapse into one.
        key: freshKey(`${spec.value}:${year}`),
        assetType: spec.value, seasonYear: year, amount: n, toTeamId: recipient.id,
        label: spec.money ? `$${n} of ${year} cap` : `${n} ${spec.label.toLowerCase()} (${year})`,
      },
    });
    setAmount("");
  }

  return (
    <TeamColumn team={team} others={others} items={items} dispatch={dispatch}>
      <div className="flex flex-wrap items-center gap-2">
        <Input type="number" min={1} value={amount} placeholder={spec.money ? "$" : "How many"}
          className="w-28" onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Select value={year} className="w-28" onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </Select>
        {others.length > 1 && (
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            →
            <Select
              value={recipient.id}
              className="w-40"
              aria-label={`Recipient of ${team.name}'s ${spec.label}`}
              onChange={(e) => setToId(Number(e.target.value))}
            >
              {others.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </label>
        )}
        <span className="text-xs text-muted-foreground">holds {spec.money ? `$${have}` : have}</span>
        <Button type="button" variant="outline" size="sm" onClick={add}>Add</Button>
      </div>
      {slip && <p className="text-sm text-destructive">{slip}</p>}
    </TeamColumn>
  );
}

/** Module column count by team count — static strings, so Tailwind sees them. */
const GRID: Record<number, string> = {
  2: "grid gap-4 lg:grid-cols-2",
  3: "grid gap-4 lg:grid-cols-3",
};
const gridFor = (n: number) => GRID[n] ?? "grid gap-4 lg:grid-cols-2 xl:grid-cols-4";

export function TradeForm({ teams, defaultTeamId, isCommissioner, season }: {
  teams: TradeTeam[]; defaultTeamId: number | null; isCommissioner: boolean; season: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  /*
   * The teams in the deal, in slot order: the filer's team, the team they're
   * trading with, then any added. Slots hold 0 until chosen; only chosen
   * teams participate.
   */
  const [slots, setSlots] = useState<number[]>([defaultTeamId ?? teams[0]?.id ?? 0, 0]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [state, dispatch] = useReducer(reducer, {});
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [pendingAdds, setPendingAdds] = useState<Record<string, string>>({});

  const onPending = useCallback((key: string, message: string | null) => {
    setPendingAdds((p) => {
      if (message === null) {
        if (!(key in p)) return p;
        const next = { ...p };
        delete next[key];
        return next;
      }
      return p[key] === message ? p : { ...p, [key]: message };
    });
  }, []);

  const chosen = useMemo(
    () => slots.filter((id) => id > 0).map((id) => teams.find((t) => t.id === id)!).filter(Boolean),
    [slots, teams]
  );
  const ready = chosen.length >= 2;

  const setSlot = (index: number, teamId: number) => {
    setSlots((s) => {
      const leaving = s[index];
      if (leaving > 0) dispatch({ kind: "dropTeam", teamId: leaving });
      const next = [...s];
      next[index] = teamId;
      return next;
    });
  };

  const removeSlot = (index: number) => {
    setSlots((s) => {
      const leaving = s[index];
      if (leaving > 0) dispatch({ kind: "dropTeam", teamId: leaving });
      return s.filter((_, i) => i !== index);
    });
  };

  const entries: ProposedEntry[] = useMemo(
    () =>
      chosen.flatMap((team) =>
        (state[team.id] ?? []).map((i) => ({
          assetType: i.assetType, seasonYear: i.seasonYear, amount: i.amount,
          round: i.round ?? null, pickNumber: i.pickNumber ?? null,
          originTeamId: i.originTeamId ?? null, playerId: i.playerId ?? null,
          fromTeamId: team.id, toTeamId: i.toTeamId,
        }))
      ),
    [chosen, state]
  );

  /*
   * The same checks the server runs, over the same derived holdings — so what
   * the form says is legal and what the action accepts cannot drift. Shape
   * first (is this a coherent deal between these teams), then legality (do
   * they hold what they're sending).
   */
  const findings = useMemo(() => {
    if (entries.length === 0) return { blocks: [] as string[], warns: [] as string[] };
    const shape = checkTradeShape(
      chosen.map((t) => t.id),
      entries.map((e) => ({ fromTeamId: e.fromTeamId!, toTeamId: e.toTeamId!, playerId: e.playerId })),
      (id) => teams.find((t) => t.id === id)?.name ?? `Team #${id}`
    );
    const snapshot = new Map<number, TeamSnapshot>(
      teams.map((t) => [
        t.id,
        {
          teamId: t.id,
          teamName: t.name,
          assets: new Map(t.seasons.map((a) => [a.seasonYear, a])),
          roster: new Map(
            t.players.map((p) => [
              p.playerId,
              {
                name: p.name,
                salary: p.salary,
                contractEndSeason: p.contractEndSeason,
                acquiredForSeason: p.acquiredForSeason,
              },
            ])
          ),
          contracted: new Map(t.contracted),
          committed: new Map(t.committed),
        },
      ])
    );
    const f = validateProposal(entries, snapshot, season);
    return {
      blocks: [...shape, ...blocking(f).map((b) => b.message)],
      warns: warnings(f).map((w) => w.message),
    };
  }, [entries, chosen, teams, season]);

  // Typed-but-unadded amounts block alongside everything else.
  const allBlocks = [...findings.blocks, ...Object.values(pendingAdds)];

  const available = COUNTABLE.filter(
    (c) => chosen.some((t) => t.seasons.some((a) => (a[c.held] as number) > 0))
  );

  // Only offered when somebody in this trade actually holds one — an empty
  // module is a question nobody asked.
  const hasNamedToppers = chosen.some((t) => t.seasons.some((a) => a.namedToppers.length > 0));

  const toggle = (g: Group) =>
    setGroups((gs) => {
      if (gs.includes(g)) { dispatch({ kind: "dropGroup", group: g }); return gs.filter((x) => x !== g); }
      return [...gs, g];
    });

  function submit() {
    setErrors([]);
    start(async () => {
      const res = await submitTrade({
        teamIds: chosen.map((t) => t.id),
        // Display-only fields don't cross the wire; the server reads salary
        // and contract off the roster regardless.
        legs: chosen.flatMap((team) =>
          (state[team.id] ?? []).map((i) => ({
            assetType: i.assetType, seasonYear: i.seasonYear, amount: i.amount,
            round: i.round ?? null, pickNumber: i.pickNumber ?? null,
            originTeamId: i.originTeamId ?? null, playerId: i.playerId ?? null,
            fromTeamId: team.id, toTeamId: i.toTeamId,
          }))
        ),
        note,
      });
      if (res.ok) router.push(`/transactions/${res.id}`);
      else setErrors(res.errors);
    });
  }

  const modules: { group: Group; title: string; spec?: (typeof COUNTABLE)[number] }[] = [
    { group: "PLAYER", title: "Players" },
    { group: "ROOKIE_PICK", title: "Rookie picks" },
    ...(hasNamedToppers ? [{ group: "NAMED_TOPPER" as Group, title: "Topped Rookies" }] : []),
    ...available.map((c) => ({ group: c.value as Group, title: c.label, spec: c })),
  ];

  const unchosen = teams.filter((t) => !slots.includes(t.id));

  return (
    <div className="space-y-4">
      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Not filed</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-0.5 pl-4">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          {isCommissioner ? (
            <FormField id="team-0" label="Team" className="min-w-56">
              <Select value={slots[0]} onChange={(e) => setSlot(0, Number(e.target.value))}>
                {teams.filter((t) => t.id === slots[0] || !slots.includes(t.id)).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
            </FormField>
          ) : (
            <div className="min-w-56">
              <div className="mb-1 text-sm font-medium">Team</div>
              <div className="py-2 text-base font-bold">
                {teams.find((t) => t.id === slots[0])?.name}
              </div>
            </div>
          )}

          <FormField id="team-1" label="Trading with" className="min-w-56">
            <Select value={slots[1]} onChange={(e) => setSlot(1, Number(e.target.value))}>
              <option value={0}>Choose a team…</option>
              {teams.filter((t) => t.id === slots[1] || !slots.includes(t.id)).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </FormField>

          {slots.slice(2).map((id, i) => (
            <FormField key={i + 2} id={`team-${i + 2}`} label={`And with`} className="min-w-56">
              <span className="flex items-center gap-1.5">
                <Select value={id} onChange={(e) => setSlot(i + 2, Number(e.target.value))}>
                  <option value={0}>Choose a team…</option>
                  {teams.filter((t) => t.id === id || !slots.includes(t.id)).map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </Select>
                <button
                  type="button"
                  onClick={() => removeSlot(i + 2)}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                  aria-label="Remove this team from the trade"
                >
                  <X className="size-4" />
                </button>
              </span>
            </FormField>
          ))}

          {/*
            Only once the second team is chosen: a three-team deal is a rarity
            and the button should never crowd the case everyone actually files.
          */}
          {ready && unchosen.length > 0 && slots.every((id) => id > 0) && (
            <Button type="button" variant="ghost" size="sm" className="mb-1"
              onClick={() => setSlots((s) => [...s, 0])}>
              <Plus className="size-4" /> Add a team
            </Button>
          )}
        </CardContent>
      </Card>

      {ready && (
        <>
          <Card>
            <CardContent className="space-y-2 p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                This trade involves
              </div>
              {/* Types belong to the deal, not to a side — one decision, not two. */}
              <div className="flex flex-wrap gap-2">
                {modules.map((m) => (
                  <Button key={m.group} type="button" size="sm"
                    variant={groups.includes(m.group) ? "default" : "outline"}
                    onClick={() => toggle(m.group)}>
                    {m.title}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {modules.filter((m) => groups.includes(m.group)).map((m) => (
            <Card key={m.group}>
              <CardContent className="space-y-3 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {m.title}
                </div>
                <div className={gridFor(chosen.length)}>
                  {chosen.map((team) => {
                    const others = chosen.filter((t) => t.id !== team.id);
                    const items = (state[team.id] ?? []).filter((i) => groupOf(i) === m.group);
                    if (m.group === "PLAYER")
                      return <PlayerPicker key={team.id} team={team} others={others} items={items} dispatch={dispatch} season={season} />;
                    if (m.group === "ROOKIE_PICK")
                      return <PickPicker key={team.id} team={team} others={others} items={items} dispatch={dispatch} />;
                    if (m.group === "NAMED_TOPPER")
                      return <TopperPicker key={team.id} team={team} others={others} items={items} dispatch={dispatch} />;
                    return <CountablePicker key={team.id} team={team} others={others} items={items}
                      dispatch={dispatch} spec={m.spec!} season={season} onPending={onPending} />;
                  })}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Only problems get a callout. "Nothing is wrong" is already said
              by the File button being enabled. */}
          {allBlocks.length > 0 && (
            <Alert variant="destructive">
              <AlertTitle>This can&apos;t be filed yet</AlertTitle>
              <AlertDescription>
                <ul className="list-disc space-y-0.5 pl-4">
                  {allBlocks.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          {findings.warns.length > 0 && (
            <Alert variant="warning">
              <AlertTitle>Worth knowing</AlertTitle>
              <AlertDescription>
                <ul className="list-disc space-y-0.5 pl-4">
                  {findings.warns.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Nothing below the toggles until a type is chosen: the page stays
              quiet, then answers each press with the module it opened. */}
          {groups.length > 0 && (
          <Card>
            <CardContent className="space-y-3 p-4">
              <FormField id="note" label="Note (optional)">
                <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
              </FormField>
              <div className="flex items-center gap-3">
                <Button onClick={submit} loading={pending} disabled={pending || allBlocks.length > 0}>
                  File for review
                </Button>
                <span className="text-sm text-muted-foreground">
                  Goes to the commissioner. Nothing changes until it&apos;s approved.
                </span>
              </div>
            </CardContent>
          </Card>
          )}
        </>
      )}
    </div>
  );
}
