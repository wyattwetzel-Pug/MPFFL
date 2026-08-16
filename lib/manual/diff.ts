/*
 * Paragraph-level diff between two manual versions.
 *
 * A rules document changes a clause at a time, so paragraphs are the unit that
 * matches how people actually read the change. Word-level diffing 8,000 words
 * would also be quadratic; there are only ~300 paragraphs.
 */

export type DiffLine = { kind: "added" | "removed" | "same"; text: string };

function paragraphs(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Longest common subsequence over paragraphs, then walked back into a diff. */
export function diffText(before: string, after: string): DiffLine[] {
  const a = paragraphs(before);
  const b = paragraphs(after);

  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: "removed", text: a[i++] });
    } else {
      out.push({ kind: "added", text: b[j++] });
    }
  }
  while (i < a.length) out.push({ kind: "removed", text: a[i++] });
  while (j < b.length) out.push({ kind: "added", text: b[j++] });
  return out;
}

/** Drop unchanged runs, keeping a little context around each edit. */
export function collapseUnchanged(lines: DiffLine[], context = 1): (DiffLine | "gap")[] {
  const keep = new Set<number>();
  lines.forEach((l, i) => {
    if (l.kind === "same") return;
    for (let k = i - context; k <= i + context; k++) {
      if (k >= 0 && k < lines.length) keep.add(k);
    }
  });

  const out: (DiffLine | "gap")[] = [];
  let gapOpen = false;
  lines.forEach((l, i) => {
    if (keep.has(i)) {
      out.push(l);
      gapOpen = false;
    } else if (!gapOpen) {
      out.push("gap");
      gapOpen = true;
    }
  });
  return out;
}

export function diffStats(lines: DiffLine[]) {
  return {
    added: lines.filter((l) => l.kind === "added").length,
    removed: lines.filter((l) => l.kind === "removed").length,
    unchanged: lines.filter((l) => l.kind === "same").length,
  };
}
