"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  saveRuleProposal,
  deleteRuleProposal,
  setRuleLock,
  setRuleOutcome,
  uploadRuleIcon,
} from "@/lib/actions/rules-actions";
import { readDraft, writeDraft, clearDraft, type DraftEnvelope } from "@/lib/draft-backup";
import { DraftRecoveryBar } from "@/components/ui/draft-recovery";

/*
 * §22 admin. The lock is a setting (autosaves on blur); proposals are
 * submissions (explicit Save). Outcomes are one-tap rulings after lock.
 */

type ProposalRow = {
  id: number;
  title: string;
  body: string;
  displayOrder: number;
  proposedByTeamId: number | null;
  proposedByLabel: string;
  iconUrl: string | null;
  outcome: "PASSED" | "FAILED" | "WITHDRAWN" | null;
  votes: number;
  comments: number;
};

const BLANK = { title: "", body: "", proposedByTeamId: 0, proposedByLabel: "", displayOrder: 0 };
type ProposalDraft = { editing: number | "new"; form: typeof BLANK };

export function RulesAdmin({
  seasonYear, years, locksAt, locked, teams, proposals,
}: {
  seasonYear: number;
  years: number[];
  locksAt: string | null;
  locked: boolean;
  teams: { id: number; name: string }[];
  proposals: ProposalRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState(BLANK);
  const [msg, setMsg] = useState<string | null>(null);

  // Draft insurance for long proposal text — same scheme as the manual editor.
  const draftKey = `rules-proposal-${seasonYear}`;
  const [recovery, setRecovery] = useState<DraftEnvelope<ProposalDraft> | null>(() =>
    typeof window === "undefined" ? null : readDraft<ProposalDraft>(draftKey)
  );
  const patchForm = (next: Partial<typeof BLANK>) => {
    setForm((f) => {
      const merged = { ...f, ...next };
      if (editing != null) writeDraft<ProposalDraft>(draftKey, { editing, form: merged });
      return merged;
    });
  };

  // datetime-local wants local wall time; the value stores as a real instant.
  // Lazy init: computed once on mount, which keeps render pure.
  const [localLock] = useState(() =>
    locksAt
      ? new Date(new Date(locksAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
      : ""
  );

  const openEdit = (p: ProposalRow | null) => {
    if (p == null) {
      setForm({ ...BLANK, displayOrder: proposals.length });
      setEditing("new");
    } else {
      setForm({
        title: p.title, body: p.body,
        proposedByTeamId: p.proposedByTeamId ?? 0,
        proposedByLabel: p.proposedByLabel,
        displayOrder: p.displayOrder,
      });
      setEditing(p.id);
    }
    setMsg(null);
  };

  const save = () =>
    start(async () => {
      const res = await saveRuleProposal(editing === "new" ? null : (editing as number), {
        seasonYear,
        title: form.title,
        body: form.body,
        proposedByTeamId: form.proposedByTeamId || null,
        proposedByLabel:
          form.proposedByLabel.trim() ||
          teams.find((t) => t.id === form.proposedByTeamId)?.name ||
          "Commissioner",
        displayOrder: Number(form.displayOrder) || 0,
      });
      if (res.ok) { clearDraft(draftKey); setEditing(null); router.refresh(); }
      else setMsg(`${res.error} — your text is still here and backed up on this device.`);
    });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-bold">Rule Votes — Admin</h1>
        <Select
          value={seasonYear}
          className="w-28"
          onChange={(e) => router.push(`/admin/rules?year=${e.target.value}`)}
          aria-label="Season"
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </Select>
        <Link href={`/manual/rules/${seasonYear}`} className="ml-auto text-sm underline underline-offset-2">
          view public page →
        </Link>
      </div>

      <Card>
        <CardHeader><CardTitle>Voting deadline</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Votes lock at this moment, server-enforced. Clear it to leave voting open indefinitely.
            Comments never lock.
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="datetime-local"
              defaultValue={localLock}
              className="w-60"
              aria-label="Lock date and time"
              onBlur={(e) =>
                start(async () => {
                  const v = e.target.value;
                  await setRuleLock(seasonYear, v ? new Date(v).toISOString() : null);
                  router.refresh();
                })
              }
            />
            {locksAt && (
              <span className="text-xs text-muted-foreground">
                {locked ? "locked" : "scheduled"}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Proposals · {proposals.length}
            <Button size="sm" onClick={() => openEdit(null)}>+ New proposal</Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {recovery && editing == null && (
            <DraftRecoveryBar
              savedAt={recovery.savedAt}
              onRestore={() => {
                setForm(recovery.value.form);
                setEditing(recovery.value.editing);
                setRecovery(null);
              }}
              onDiscard={() => { clearDraft(draftKey); setRecovery(null); }}
            />
          )}
          {proposals.map((p) => (
            <div key={p.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                {p.iconUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.iconUrl} alt="" className="size-6 rounded" />
                )}
                <b className="text-sm">{p.displayOrder + 1}. {p.title}</b>
                <span className="text-xs text-muted-foreground">
                  by {p.proposedByLabel} · {p.votes} vote{p.votes === 1 ? "" : "s"} · {p.comments} comment{p.comments === 1 ? "" : "s"}
                </span>
                <span className="ml-auto flex items-center gap-1.5">
                  {(["PASSED", "FAILED", "WITHDRAWN"] as const).map((o) => (
                    <button
                      key={o}
                      type="button"
                      disabled={pending}
                      title={`Mark ${o.toLowerCase()} (click again to clear)`}
                      onClick={() =>
                        start(async () => {
                          await setRuleOutcome(p.id, p.outcome === o ? null : o);
                          router.refresh();
                        })
                      }
                      className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                        p.outcome === o ? "border-foreground/60 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {o.toLowerCase()}
                    </button>
                  ))}
                  <label className="cursor-pointer rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground">
                    icon
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={pending}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const fd = new FormData();
                        fd.set("file", f);
                        start(async () => {
                          const res = await uploadRuleIcon(p.id, fd);
                          if (!res.ok) setMsg(res.error);
                          router.refresh();
                        });
                      }}
                    />
                  </label>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>Edit</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    className="text-destructive"
                    onClick={() =>
                      start(async () => {
                        const res = await deleteRuleProposal(p.id);
                        if (!res.ok) setMsg(res.error);
                        router.refresh();
                      })
                    }
                  >
                    Delete
                  </Button>
                </span>
              </div>
            </div>
          ))}
          {msg && <p className="text-xs text-destructive">{msg}</p>}

          {editing != null && (
            <div className="space-y-3 rounded-lg border border-ring p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {editing === "new" ? "New proposal" : "Edit proposal"}
              </p>
              <Input
                value={form.title}
                onChange={(e) => patchForm({ title: e.target.value })}
                placeholder="Title"
                aria-label="Title"
              />
              <Textarea
                rows={6}
                value={form.body}
                onChange={(e) => patchForm({ body: e.target.value })}
                placeholder="The proposal, in full. Plain text; line breaks preserved."
                aria-label="Proposal text"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={form.proposedByTeamId}
                  className="w-56"
                  aria-label="Proposed by team"
                  onChange={(e) => patchForm({ proposedByTeamId: Number(e.target.value) })}
                >
                  <option value={0}>Proposed by (no team)…</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
                <Input
                  value={form.proposedByLabel}
                  onChange={(e) => patchForm({ proposedByLabel: e.target.value })}
                  placeholder="Display name (defaults to team)"
                  className="w-56"
                  aria-label="Proposed by label"
                />
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Order
                  <Input
                    type="number"
                    value={form.displayOrder}
                    onChange={(e) => patchForm({ displayOrder: Number(e.target.value) })}
                    className="w-16"
                    aria-label="Ballot order"
                  />
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" disabled={pending || !form.title.trim() || !form.body.trim()} loading={pending} onClick={save}>
                  Save proposal
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { clearDraft(draftKey); setEditing(null); }}>Cancel</Button>
                {msg && <span className="text-xs text-destructive">{msg}</span>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
