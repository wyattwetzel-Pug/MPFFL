"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/ui/form-field";
import { SettingCard, FormRow } from "@/components/ui/setting-card";
import { setConsent, updateOwnerContact, updateOwnerEmail, renameTeam } from "@/lib/actions/team-actions";
import type { ConsentKind } from "@prisma/client";

/*
 * A team's settings, shown to whoever is looking.
 *
 * One page, not a separate edit screen: the modules that appear depend on who
 * is signed in. Your own consent is a live checkbox; a co-owner's is a badge
 * you can read but not touch, because consent that someone else can grant for
 * you isn't consent.
 */

export type OwnerView = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  isSelf: boolean;
  privacy: boolean;
  tou: boolean;
  sms: boolean;
};

const CONSENTS: { kind: ConsentKind; label: string; detail: React.ReactNode }[] = [
  {
    kind: "PRIVACY",
    label: "Privacy Policy",
    detail: <>I&apos;ve read the <Link href="/privacy" className="text-primary underline-offset-4 hover:underline">Privacy Policy</Link>.</>,
  },
  {
    kind: "TOU",
    label: "Terms of Use",
    detail: <>I agree to the <Link href="/tou" className="text-primary underline-offset-4 hover:underline">Terms of Use</Link>.</>,
  },
  {
    kind: "SMS",
    label: "Text messages",
    detail: (
      <>
        Text me league notifications — draft picks, transactions, and when I&apos;m on the
        clock. Message and data rates may apply. Reply <strong>STOP</strong> to any message to
        opt out, or untick this box.
      </>
    ),
  },
];

function ConsentRow({ owner, canRevoke }: { owner: OwnerView; canRevoke: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const value = (k: ConsentKind) =>
    k === "PRIVACY" ? owner.privacy : k === "TOU" ? owner.tou : owner.sms;

  const toggle = (kind: ConsentKind, granted: boolean) =>
    start(async () => {
      setError(null);
      const res = await setConsent({ ownerId: owner.id, kind, granted });
      if (res.ok) router.refresh();
      else setError(res.error);
    });

  return (
    <div className="space-y-2">
      {CONSENTS.map((c) => {
        const on = value(c.kind);
        // Your own: a live checkbox. Someone else's: state you can read, and
        // revoke only if you're the commissioner honouring an opt-out.
        if (owner.isSelf)
          return (
            <label key={c.kind} className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={on}
                disabled={pending}
                onChange={(e) => toggle(c.kind, e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">{c.label}</span> — {c.detail}
              </span>
            </label>
          );
        return (
          <div key={c.kind} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{c.label}</span>
            <Badge variant={on ? "success" : "secondary"}>{on ? "agreed" : "not agreed"}</Badge>
            {on && canRevoke && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => toggle(c.kind, false)}>
                Revoke
              </Button>
            )}
          </div>
        );
      })}
      {!owner.isSelf && canRevoke && (
        <p className="text-xs text-muted-foreground">
          You can revoke on someone&apos;s behalf to honour an opt-out, but consent has to come
          from them.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function ContactFields({ owner }: { owner: OwnerView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(owner.name);
  const [phone, setPhone] = useState(owner.phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const commit = () => {
    if (name === owner.name && phone === (owner.phone ?? "")) return;
    start(async () => {
      setError(null);
      const res = await updateOwnerContact({ ownerId: owner.id, name, phone });
      if (res.ok) { setSaved(true); router.refresh(); }
      else setError(res.error);
    });
  };

  return (
    <>
      <FormRow>
        <FormField id={`o${owner.id}-name`} label="Name" className="w-56">
          <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={commit} />
        </FormField>
        <FormField
          id={`o${owner.id}-phone`}
          label="Mobile"
          hint="Only used for the texts you opt into below."
          className="w-56"
        >
          <Input value={phone} placeholder="(650) 555-0123" onChange={(e) => setPhone(e.target.value)} onBlur={commit} />
        </FormField>
      </FormRow>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : pending ? (
        <p className="text-xs text-muted-foreground">Saving…</p>
      ) : saved ? (
        <p className="text-xs text-muted-foreground">Saved</p>
      ) : null}

      <EmailField owner={owner} />
    </>
  );
}

/*
 * Email gets a button, while name and mobile save on blur.
 *
 * Not an inconsistency. A mistyped mobile costs you texts until you notice; a
 * mistyped email costs you the account, because there is no password behind it
 * and the next sign-in link goes somewhere you can't read. An explicit press is
 * the difference between changing a setting and changing the lock.
 */
function EmailField({ owner }: { owner: OwnerView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState(owner.email);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const changed = email.trim().toLowerCase() !== owner.email.toLowerCase();

  const commit = () => {
    if (!changed) return;
    start(async () => {
      setError(null);
      const res = await updateOwnerEmail({ ownerId: owner.id, email });
      if (res.ok) {
        setEmail(res.email);
        setSaved(true);
        router.refresh();
      } else setError(res.error);
    });
  };

  return (
    <>
      <FormRow>
        <FormField
          id={`o${owner.id}-email`}
          label="Sign-in email"
          hint={
            owner.isSelf
              ? "Where your sign-in link is sent. Change it and the next one goes to the new address."
              : "Where their sign-in link is sent."
          }
          className="w-72"
        >
          <Input
            type="email"
            value={email}
            autoComplete="email"
            onChange={(e) => {
              setEmail(e.target.value);
              setSaved(false);
            }}
          />
        </FormField>
        <Button
          className="mt-7"
          size="sm"
          variant="outline"
          loading={pending}
          disabled={pending || !changed}
          onClick={commit}
        >
          Change
        </Button>
      </FormRow>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : saved ? (
        <p className="text-xs text-muted-foreground">
          Saved. Any sign-in link already sent to the old address no longer works.
        </p>
      ) : null}
    </>
  );
}

export function TeamSettings({
  teamId,
  teamName,
  owners,
  canRename,
  isCommissioner,
}: {
  teamId: number;
  teamName: string;
  owners: OwnerView[];
  canRename: boolean;
  isCommissioner: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(teamName);
  const [error, setError] = useState<string | null>(null);

  const rename = () => {
    if (name.trim() === teamName) return;
    start(async () => {
      setError(null);
      const res = await renameTeam(teamId, name);
      if (res.ok) router.replace(`/teams/${res.slug}`);
      else setError(res.error);
    });
  };

  return (
    <div className="space-y-3">
      {canRename && (
        <SettingCard
          title="Team name"
          description="The team's web address changes with its name, so older links will stop working."
          footer={error ? <span className="text-destructive">{error}</span> : undefined}
        >
          <FormRow>
            <FormField id="team-name" label="Name" className="w-72">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <Button className="mt-7" size="sm" loading={pending}
              disabled={pending || name.trim() === teamName} onClick={rename}>
              Rename
            </Button>
          </FormRow>
        </SettingCard>
      )}

      {owners.map((o) => (
        <SettingCard
          key={o.id}
          title={o.name}
          status={o.isSelf ? { label: "you", variant: "outline" } : undefined}
          description={o.isSelf ? "Your details and what you've agreed to." : undefined}
        >
          {(o.isSelf || isCommissioner) && <ContactFields owner={o} />}
          <ConsentRow owner={o} canRevoke={isCommissioner} />
        </SettingCard>
      ))}
    </div>
  );
}
