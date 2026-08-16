"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/*
 * Keeps a server-rendered page current without turning it into a live app.
 *
 * A slow draft moves a few times an hour, so polling once a minute is plenty —
 * and the page says how stale it is, which is the part that actually matters.
 * Without that, someone stares at a board wondering whether nothing has
 * happened or whether the page simply stopped listening.
 *
 * Skips the poll while the tab is hidden. A phone left open on this page
 * overnight shouldn't spend the night refetching a draft nobody is watching.
 */
export function LiveRefresh({ everyMs = 60_000 }: { everyMs?: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // Set after mount: reading the clock during render would differ between the
  // server pass and the client one.
  const [last, setLast] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);

  const refresh = useCallback(() => {
    start(() => {
      router.refresh();
      setLast(Date.now());
    });
  }, [router]);

  useEffect(() => setLast(Date.now()), []);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, everyMs);
    return () => clearInterval(poll);
  }, [everyMs, refresh]);

  const seconds = last != null && now != null ? Math.floor((now - last) / 1000) : null;
  const label =
    seconds == null || seconds < 5
      ? "up to date"
      : seconds < 60
        ? `updated ${seconds}s ago`
        : `updated ${Math.floor(seconds / 60)}m ago`;

  return (
    <span className="flex items-center gap-2 text-sm text-muted-foreground">
      <span aria-live="polite">{pending ? "checking…" : label}</span>
      <Button variant="ghost" size="sm" onClick={refresh} disabled={pending}>
        Refresh
      </Button>
    </span>
  );
}
