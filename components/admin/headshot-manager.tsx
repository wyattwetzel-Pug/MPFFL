"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { uploadHeadshot, importLegacyHeadshots } from "@/lib/actions/headshot-actions";

/*
 * Managing player portraits.
 *
 * A gallery rather than a form, because the question being asked is "who still
 * needs one" — which a list of names can't answer and a wall of faces can at a
 * glance.
 */
export type PlayerCard = {
  id: number;
  name: string;
  position: string;
  nflTeam: string;
  headshotUrl: string | null;
  legacy: boolean;
};

function Card({ player }: { player: PlayerCard }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onFile = (file: File | undefined) => {
    if (!file) return;
    // Checked here as well as on the server: past the platform's body limit
    // the request never arrives, and the page just dies with no explanation.
    if (file.size > 4.4 * 1024 * 1024) {
      setError(`${(file.size / 1024 / 1024).toFixed(1)}MB is too big — keep it under 4MB.`);
      return;
    }
    start(async () => {
      setError(null);
      try {
        const res = await uploadHeadshot(player.id, file);
        if (res.ok) router.refresh();
        else setError(res.error);
      } catch {
        setError("Upload failed. If the file is large, try a smaller one.");
      }
    });
  };

  return (
    <div className="space-y-1.5">
      <label className="group block cursor-pointer">
        <div className="relative aspect-square overflow-hidden rounded-full border bg-muted/30">
          {player.headshotUrl ? (
            <Image
              src={player.headshotUrl}
              alt={player.name}
              fill
              sizes="160px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full items-center justify-center text-2xl font-bold text-muted-foreground/40">
              {player.name
                .split(" ")
                .map((w) => w[0])
                .slice(0, 2)
                .join("")}
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100">
            {pending ? "Uploading…" : player.headshotUrl ? "Replace" : "Upload"}
          </div>
        </div>
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={pending}
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </label>
      <div className="text-center">
        <div className="truncate text-sm font-medium">{player.name}</div>
        <div className="text-xs text-muted-foreground">
          {player.position} · {player.nflTeam}
        </div>
        {player.legacy && (
          <Badge variant="warning" className="mt-1">
            old store
          </Badge>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}

export function HeadshotManager({
  players,
  legacyCount,
}: {
  players: PlayerCard[];
  legacyCount: number;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  const shown = players.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="space-y-4">
      {legacyCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-attention/40 bg-attention/5 px-3 py-2 text-sm">
          <span>
            {/* These work today and stop working when the old project goes. */}
            <strong>{legacyCount}</strong> portraits still live in the old project&apos;s store.
            They&apos;ll break when it&apos;s retired.
          </span>
          <Button
            size="sm"
            variant="outline"
            loading={pending}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await importLegacyHeadshots();
                setNote(res.ok ? `Copied ${res.copied}${res.failed ? `, ${res.failed} failed` : ""}.` : res.error);
                router.refresh();
              })
            }
          >
            Copy them here
          </Button>
          {note && <span className="text-muted-foreground">{note}</span>}
        </div>
      )}

      <Input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Find a player…"
        aria-label="Find a player"
      />

      <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        {shown.slice(0, 120).map((p) => (
          <Card key={p.id} player={p} />
        ))}
      </div>
      {shown.length > 120 && (
        <p className="text-sm text-muted-foreground">
          Showing 120 of {shown.length}. Narrow the search to see the rest.
        </p>
      )}
    </div>
  );
}
