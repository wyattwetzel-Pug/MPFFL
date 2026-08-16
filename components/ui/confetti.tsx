"use client";

import { useEffect, useState } from "react";

/*
 * A small celebration, in league colours.
 *
 * v1 threw confetti at every pick and it was too much. This is the version
 * that earns it: sixty pines thrown outward from a point, tumbling end over
 * end, across about three seconds. Big enough to feel like something happened,
 * short enough that nobody has to wait for it to finish.
 *
 * The piece is a simplified conifer rather than the full logo. At 14px the
 * real mark's needle detail and the MPFFL wordmark under it turn to mush —
 * the silhouette is the part that reads at this size.
 *
 * Nothing renders for anyone who has asked for reduced motion. A celebration
 * is the most skippable thing on the page.
 */

const PIECES = 60;

/** Deterministic per index, so the same trigger doesn't re-randomise on re-render. */
function piece(i: number) {
  // A cheap hash — spread without pulling in randomness that would differ
  // between the server pass and the client one.
  const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  /*
   * A full circle of angles, nudged so the spread isn't a perfect starburst —
   * evenly spaced spokes look mechanical. Distance varies too, so the pieces
   * arrive at the edge at different moments.
   */
  const angle = (i / PIECES) * Math.PI * 2 + (r(1) - 0.5) * 0.7;
  // A wide range of distances so the pieces don't arrive as one ring.
  const distance = 140 + r(2) * 340;
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance * 0.85,
    size: 12 + r(3) * 16,
    // A short stagger reads as one throw; a long one reads as a drip.
    delay: r(4) * 0.22,
    duration: 1.9 + r(5) * 1.2,
    drop: 180 + r(6) * 260,
    // Several full flips per piece over the flight, at its own rate.
    tumble: 0.5 + r(7) * 0.7,
    // Mostly green, some white — the league's two.
    white: r(8) > 0.6,
  };
}

function Tree({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size * 1.3} viewBox="0 0 20 26" fill="none" aria-hidden>
      <path
        d="M10 0 L15 8 L12.5 8 L17 15 L13.5 15 L19 22 L11 22 L11 26 L9 26 L9 22 L1 22 L6.5 15 L3 15 L7.5 8 L5 8 Z"
        fill={color}
      />
    </svg>
  );
}

export function Confetti({ fire }: { fire: number }) {
  const [reduced, setReduced] = useState(true);

  // Read the preference after mount — matchMedia doesn't exist on the server,
  // and defaulting to "reduced" means the fallback is the quiet one.
  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  if (fire === 0 || reduced) return null;

  return (
    <div
      key={fire}
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-screen overflow-hidden"
    >
      {Array.from({ length: PIECES }, (_, i) => {
        const p = piece(i);
        return (
          <span
            key={i}
            className="absolute animate-confetti-burst"
            style={
              {
                // Every piece starts at the same point and is thrown from it.
                left: "50%",
                top: "42%",
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.duration}s`,
                "--confetti-x": `${p.x}px`,
                "--confetti-y": `${p.y}px`,
                "--confetti-drop": `${p.drop}px`,
              } as React.CSSProperties
            }
          >
            <span
              className="block animate-confetti-tumble"
              style={{ animationDuration: `${p.tumble}s` }}
            >
              <Tree color={p.white ? "var(--card-foreground)" : "var(--success)"} size={p.size} />
            </span>
          </span>
        );
      })}
    </div>
  );
}
