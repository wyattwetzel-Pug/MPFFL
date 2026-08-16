"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Countdown } from "@/components/ui/countdown";

/**
 * Styleguide only — the real deadline comes from a draft slot's `expiresAt`.
 *
 * The targets are set after mount rather than during render: a countdown needs
 * a real future instant, and reading the clock while rendering is exactly the
 * impurity that makes a server-rendered page disagree with itself.
 */
export function CountdownDemo() {
  // Lazy initialiser: runs once, on the client, on first render — so the clock
  // is read exactly once and never during a server render.
  const [targets] = useState(() => {
    const now = Date.now();
    return [11 * 3600e3 + 23 * 60e3, 47 * 60e3, 45e3].map((ms) =>
      new Date(now + ms).toISOString()
    );
  });

  return (
    <div className="flex flex-wrap items-center gap-3">
      {targets.map((t, i) => (
        <Badge key={t} variant={i === 2 ? "destructive" : "warning"}>
          <Countdown expiresAt={t} />
        </Badge>
      ))}
    </div>
  );
}
