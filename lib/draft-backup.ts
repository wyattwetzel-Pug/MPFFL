/*
 * Draft insurance for long-form editors (born from a lost manual edit,
 * 2026-08-09: a deploy-skewed save 404'd and the reload ate the draft).
 *
 * Plain localStorage envelopes with a timestamp. Client-only by nature;
 * callers write on change (debounced), offer recovery on mount, and clear
 * on a successful publish. Failure to persist (quota, private browsing)
 * degrades silently — the backup is insurance, never a dependency.
 */

export type DraftEnvelope<T> = { value: T; savedAt: number };

export function readDraft<T>(key: string): DraftEnvelope<T> | null {
  try {
    const raw = localStorage.getItem(`mpffl-draft:${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftEnvelope<T>;
    return typeof parsed?.savedAt === "number" ? parsed : null;
  } catch {
    return null;
  }
}

export function writeDraft<T>(key: string, value: T): void {
  try {
    localStorage.setItem(`mpffl-draft:${key}`, JSON.stringify({ value, savedAt: Date.now() }));
  } catch {
    // quota / private mode — insurance only, never an error
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(`mpffl-draft:${key}`);
  } catch {
    // ignore
  }
}
