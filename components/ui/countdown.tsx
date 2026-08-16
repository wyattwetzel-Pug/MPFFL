"use client";

import { useEffect, useState } from "react";

/*
 * A deadline, counting down.
 *
 * Digital-clock shape — 11:22:58, or 47:12 inside the last hour — rather than
 * "11h 22m left". Two reasons. It is unmistakably *running*, which "11h 22m"
 * is not: the first version of this hid seconds above an hour on the grounds
 * that a ticking digit at eleven hours carries no information, and the result
 * was a timer nobody could tell was live. And it stays short enough to sit in
 * a badge next to a team name on a phone.
 *
 * `tabular-nums` is load-bearing. Without it the digits are proportional, the
 * badge changes width every second, and the row twitches.
 */

/** The text alone, so anything can render the same string. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

export function Countdown({
  /** ISO instant the clock runs out. */
  expiresAt,
  /** Rendered once the deadline passes, in place of the count. */
  expiredLabel = "time's up",
  className,
}: {
  expiresAt: string;
  expiredLabel?: string;
  className?: string;
}) {
  const target = new Date(expiresAt).getTime();
  const [text, setText] = useState(() => {
    const ms = target - Date.now();
    return ms <= 0 ? expiredLabel : formatRemaining(ms);
  });

  useEffect(() => {
    const tick = () => {
      const ms = target - Date.now();
      setText(ms <= 0 ? expiredLabel : formatRemaining(ms));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target, expiredLabel]);

  return (
    // The server renders this too, and its value is stale by however long the
    // response took — a guaranteed mismatch at second granularity, and not one
    // worth warning about.
    <span className={`tabular-nums ${className ?? ""}`} suppressHydrationWarning>
      {text}
    </span>
  );
}
