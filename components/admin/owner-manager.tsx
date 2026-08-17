"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserPlus, ShieldPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { SettingCard, FormRow } from "@/components/ui/setting-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import {
  addOwnerToTeam,
  attachOwner,
  detachOwner,
  setOwnerActive,
} from "@/lib/actions/owner-actions";
import { createTeam } from "@/lib/actions/team-actions";

/*
 * Owners, and which team they belong to.
 *
 * Two different verbs, kept visibly apart because they are different
 * decisions. **Detach** takes somebody off a team and leaves them in the
 * league — what a mid-season hand-over looks like. **Remove from league** is
 * being out: sign-in stops working immediately, everywhere.
 *
 * Neither deletes anything. An owner has filed transactions, made draft picks
 * and granted consent, and all of it points back at their row.
 *
 * Reassigning a team is those two steps in order — detach the old owner, add
 * the new one — rather than a single "replace" that hides which half failed.
 */

export type OwnerRow = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  active: boolean;
  isCommissioner: boolean;
  isSelf: boolean;
  policies: boolean;
  sms: boolean;
};

export type TeamRow = { id: number; name: string; slug: string; owners: OwnerRow[] };

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  return { pending, error, setError, run };
}

function OwnerLine({ owner, teams }: { owner: OwnerRow; teams: TeamRow[] }) {
  const { pending, error, run } = useAction();
  const [confirming, setConfirming] = useState<null | "detach" | "deactivate">(null);
  const [attachTo, setAttachTo] = useState("");
  const onTeam = teams.some((t) => t.owners.some((o) => o.id === owner.id));

  return (
    <div className="border-t py-2.5 first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{owner.name}</span>
        {owner.isSelf && <Badge variant="outline">you</Badge>}
        {owner.isCommissioner && <Badge variant="secondary">commissioner</Badge>}
        {!owner.active && <Badge variant="destructive">out of the league</Badge>}
        {owner.active && !owner.policies && <Badge variant="warning">policies not accepted</Badge>}
        <span className="text-sm text-muted-foreground">{owner.email}</span>
        {owner.phone && <span className="text-sm text-muted-foreground">{owner.phone}</span>}

        <span className="ml-auto flex flex-wrap items-center gap-2">
          {onTeam && (
            <Button size="sm" variant="ghost" disabled={pending}
              onClick={() => setConfirming(confirming === "detach" ? null : "detach")}>
              Detach
            </Button>
          )}
          {owner.active ? (
            <Button size="sm" variant="ghost" disabled={pending || owner.isSelf}
              onClick={() => setConfirming(confirming === "deactivate" ? null : "deactivate")}>
              Remove from league
            </Button>
          ) : (
            <Button size="sm" variant="outline" loading={pending}
              onClick={() => run(() => setOwnerActive(owner.id, true))}>
              Bring back
            </Button>
          )}
        </span>
      </div>

      {/*
        Both of these are reversible — the owner row survives either way — but
        they are not obvious from the button alone, and one of them signs
        somebody out of a live session. Say what happens before it happens.
      */}
      {confirming === "detach" && (
        <Alert className="mt-2">
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>
              Take {owner.name} off this team? They stay in the league and can still sign in —
              this is the first half of a hand-over.
            </span>
            <Button size="sm" loading={pending}
              onClick={() => run(() => detachOwner(owner.id))}>
              Detach
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>Cancel</Button>
          </AlertDescription>
        </Alert>
      )}

      {confirming === "deactivate" && (
        <Alert variant="warning" className="mt-2">
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>
              Remove {owner.name}{" "}from the league? They&apos;re signed out everywhere
              immediately and can&apos;t sign back in. Everything they&apos;ve filed stays in the
              log, and you can bring them back.
            </span>
            <Button size="sm" variant="destructive" loading={pending}
              onClick={() => run(() => setOwnerActive(owner.id, false))}>
              Remove
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>Cancel</Button>
          </AlertDescription>
        </Alert>
      )}

      {!onTeam && owner.active && (
        <FormRow className="mt-2">
          <FormField id={`attach-${owner.id}`} label="Put on a team" className="w-64">
            <Select value={attachTo} onChange={(e) => setAttachTo(e.target.value)}>
              <option value="">Choose a team…</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </FormField>
          <Button className="mt-7" size="sm" variant="outline" loading={pending}
            disabled={pending || !attachTo}
            onClick={() => run(() => attachOwner(owner.id, Number(attachTo)))}>
            Attach
          </Button>
        </FormRow>
      )}

      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  );
}

function AddTeam() {
  const { pending, error, run } = useAction();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [abbreviation, setAbbreviation] = useState("");

  if (!open) {
    return (
      <Button variant="outline" size="lg" onClick={() => setOpen(true)}>
        <ShieldPlus /> Add a Team
      </Button>
    );
  }

  return (
    <SettingCard
      title="Add a team"
      description="Just the team itself — add an owner to it below once it exists."
    >
      <FormRow>
        <FormField id="add-team-name" label="Team name" className="w-56">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField
          id="add-team-abbreviation"
          label="Owner name(s), as displayed"
          hint='e.g. "Drew & Erik" — shown next to the team name everywhere.'
          className="w-56"
        >
          <Input value={abbreviation} onChange={(e) => setAbbreviation(e.target.value)} />
        </FormField>
      </FormRow>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" loading={pending} disabled={pending || !name || !abbreviation}
          onClick={() =>
            run(async () => {
              const res = await createTeam({ name, abbreviation });
              if (res.ok) {
                setName(""); setAbbreviation(""); setOpen(false);
              }
              return res;
            })
          }>
          Add
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </SettingCard>
  );
}

function AddOwner({ teams }: { teams: TeamRow[] }) {
  const { pending, error, run } = useAction();
  const [open, setOpen] = useState(false);
  const [teamId, setTeamId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  if (!open) {
    return (
      <Button variant="success" size="lg" onClick={() => setOpen(true)}>
        <UserPlus /> Add an Owner
      </Button>
    );
  }

  return (
    <SettingCard
      title="Add an owner"
      description="A new person, or someone already in the league who hasn't got a team. They accept the policies themselves the first time they sign in."
    >
      <FormRow>
        <FormField id="add-team" label="Team" className="w-56">
          <Select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">Choose a team…</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        </FormField>
        <FormField id="add-name" label="Name" className="w-48">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
      </FormRow>
      <FormRow>
        <FormField id="add-email" label="Sign-in email" className="w-64">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        <FormField
          id="add-phone"
          label="Mobile"
          hint="Optional. Ten digits for a US number, or + and the country code."
          className="w-56"
        >
          <Input value={phone} placeholder="(650) 555-0123" onChange={(e) => setPhone(e.target.value)} />
        </FormField>
      </FormRow>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" loading={pending} disabled={pending || !teamId || !name || !email}
          onClick={() =>
            run(async () => {
              const res = await addOwnerToTeam({ teamId: Number(teamId), name, email, phone });
              if (res.ok) {
                setName(""); setEmail(""); setPhone(""); setTeamId(""); setOpen(false);
              }
              return res;
            })
          }>
          Add
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </SettingCard>
  );
}

export function OwnerManager({
  teams,
  unattached,
}: {
  teams: TeamRow[];
  unattached: OwnerRow[];
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <AddTeam />
        <AddOwner teams={teams} />
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Teams
        </h2>
        <div className="space-y-3">
          {teams.map((t) => (
            <SettingCard
              key={t.id}
              title={
                <Link href={`/teams/${t.slug}`} className="underline-offset-4 hover:text-primary hover:underline">
                  {t.name}
                </Link>
              }
              status={
                t.owners.length === 0
                  ? { label: "no owner", variant: "warning" as const }
                  : undefined
              }
            >
              {t.owners.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nobody owns this team. Add an owner above, or attach one from below.
                </p>
              ) : (
                t.owners.map((o) => <OwnerLine key={o.id} owner={o} teams={teams} />)
              )}
            </SettingCard>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Not on a team
        </h2>
        {unattached.length === 0 ? (
          <EmptyState
            title="Everyone has a team"
            description="People appear here after being detached from one, and while they're out of the league."
          />
        ) : (
          <SettingCard title="Owners without a team">
            {unattached.map((o) => (
              <OwnerLine key={o.id} owner={o} teams={teams} />
            ))}
          </SettingCard>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Nothing here deletes anybody. An owner has filed transactions, made draft picks and
        granted consent, and every one of those records points back at them — so leaving the
        league is a flag, not a deletion, and their history stays exactly where it is. Each
        change is written to the transaction log as a note, because &ldquo;when did the team
        change hands&rdquo; has no other answer.
      </p>
    </div>
  );
}
