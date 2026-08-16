/*
 * Manual document pipeline — shared by the server renderer, the editor, and
 * the migration script, so all three agree on what a manual document is.
 *
 * The TipTap document (`doc`) is the source of truth. HTML is derived from it
 * and sanitized, then stored alongside as a render cache. Never edit the HTML.
 *
 * This module stays isomorphic so the editor can share the extension list;
 * rendering lives in ./render.ts, which is server-only.
 */
import { StarterKit } from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";

/** StarterKit v3 already bundles link, underline, lists, headings and marks. */
export const MANUAL_EXTENSIONS = [
  StarterKit,
  Image,
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
];

export type TocEntry = { id: string; text: string; level: number };

/** Placeholder the prose uses to embed live data, e.g. the holdover rates. */
export const DYNAMIC_TABLE_PATTERN = /\[DYNAMIC[_\s]TABLE:\s*([^\]]+)\]/gi;

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80) || "section"
  );
}

/**
 * Walk the document for headings so the table of contents and the rendered
 * anchors are generated from the same data — they can't disagree.
 */
export function extractToc(doc: unknown): TocEntry[] {
  const entries: TocEntry[] = [];
  const seen = new Map<string, number>();

  const textOf = (node: any): string =>
    node.type === "text"
      ? (node.text ?? "")
      : (node.content ?? []).map(textOf).join("");

  const walk = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "heading") {
      const text = textOf(node).trim();
      if (text) {
        const base = slugify(text);
        // Duplicate headings ("Overview" twice) still need unique anchors.
        const n = (seen.get(base) ?? 0) + 1;
        seen.set(base, n);
        entries.push({
          id: n === 1 ? base : `${base}-${n}`,
          text,
          level: node.attrs?.level ?? 2,
        });
      }
    }
    (node.content ?? []).forEach(walk);
  };

  walk(doc);
  return entries;
}

/** Plain text, for search indexes and change summaries. */
export function docToPlainText(doc: unknown): string {
  const parts: string[] = [];
  const walk = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "text" && node.text) parts.push(node.text);
    if (node.type === "paragraph" || node.type === "heading") parts.push("\n");
    (node.content ?? []).forEach(walk);
  };
  walk(doc);
  return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
}

export function wordCount(doc: unknown): number {
  return docToPlainText(doc).split(/\s+/).filter(Boolean).length;
}
