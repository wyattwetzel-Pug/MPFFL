import type { Condition } from "@prisma/client";

/*
 * Conditional terms.
 *
 * Three exist in the league's entire history, and all three sat unresolved
 * until a reconciliation script swept them up — v1 never asked. So this is
 * built to make forgetting hard, not to handle volume.
 */

/** Phrases that mean a deal probably has a term someone will have to judge. */
const TELLS = [
  "conditional",
  "protected",
  "converts",
  "contingent",
  "top-",
  "top ",
  " if ",
  "if he",
  "if they",
  "depending",
  "unless",
];

/**
 * Does this note read like it describes a condition?
 *
 * A nudge at approval, never a block. If the commissioner answers "no"
 * wrongly the term is lost with no second net, so the system does the
 * remembering and the human does the judging. All three historical notes
 * trip this.
 */
export function sniffCondition(note: string | null | undefined): string | null {
  if (!note) return null;
  const haystack = ` ${note.toLowerCase()} `;
  const hit = TELLS.find((t) => haystack.includes(t));
  if (!hit) return null;

  // Hand back the sentence it appeared in, so the prompt can quote the deal
  // rather than assert something about it.
  const sentence = note
    .split(/(?<=[.!?\n])\s+/)
    .find((s) => s.toLowerCase().includes(hit.trim()));
  return (sentence ?? note).trim().slice(0, 240);
}

export const isOpen = (c: Pick<Condition, "resolvedAt">) => c.resolvedAt == null;

/** Overdue first, then soonest — the queue reads as a to-do list. */
export function byUrgency<T extends Pick<Condition, "decideBy" | "id">>(
  a: T,
  b: T,
  now: Date = new Date()
): number {
  const aOver = a.decideBy != null && a.decideBy < now;
  const bOver = b.decideBy != null && b.decideBy < now;
  if (aOver !== bOver) return aOver ? -1 : 1;
  if (a.decideBy && b.decideBy) return a.decideBy.getTime() - b.decideBy.getTime();
  if (a.decideBy) return -1;
  if (b.decideBy) return 1;
  return a.id - b.id;
}
