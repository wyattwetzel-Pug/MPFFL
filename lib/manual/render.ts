/*
 * Server-side rendering for manual documents.
 *
 * Readers never run TipTap: the document is converted to sanitized HTML here,
 * stored, and shipped as plain markup. (v1 shipped the whole editor to every
 * visitor and rendered in the browser.)
 */
import { generateHTML, generateJSON } from "@tiptap/html/server";
import sanitizeHtml from "sanitize-html";
import { MANUAL_EXTENSIONS, extractToc, type TocEntry } from "./document.ts";

/**
 * Give each rendered heading the id extractToc generated for it, so the table
 * of contents and the anchors are guaranteed to match and every rule is
 * linkable — useful when citing a rule in an argument.
 */
function addHeadingIds(html: string, toc: TocEntry[]): string {
  let i = 0;
  return html.replace(/<h([1-6])(\s[^>]*)?>/g, (match, level, attrs = "") => {
    const entry = toc[i++];
    return entry ? `<h${level}${attrs} id="${entry.id}">` : match;
  });
}

/** TipTap document → sanitized, anchored HTML. */
export function renderDocToHtml(doc: unknown): string {
  const raw = generateHTML(doc as never, MANUAL_EXTENSIONS);
  const withIds = addHeadingIds(raw, extractToc(doc));

  // Only commissioners can edit, but stored XSS is a bad way to discover a
  // gap. sanitize-html is pure JS — the previous sanitizer rode on jsdom,
  // whose dependency chain can't load under Vercel's Node flags
  // (--no-experimental-require-module); every manual publish 500'd on it.
  return sanitizeHtml(withIds, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "h1", "h2", "img", "u", "s", "figure", "figcaption", "colgroup", "col", "mark",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "width", "height", "title"],
      th: ["colspan", "rowspan", "colwidth", "style"],
      td: ["colspan", "rowspan", "colwidth", "style"],
      col: ["span", "colwidth", "style"],
      table: ["style"],
      "*": ["id", "class"],
    },
    // TipTap expresses column widths as inline styles; only layout-ish
    // properties survive.
    allowedStyles: {
      "*": {
        "min-width": [/^[\d.]+(px|%)$/],
        width: [/^[\d.]+(px|%)$/],
        "text-align": [/^(left|right|center|justify)$/],
      },
    },
    allowedSchemes: ["http", "https", "mailto"],
  });
}

/** HTML → TipTap document, for v1 versions that predate the rich editor. */
export function htmlToDoc(html: string): unknown {
  return generateJSON(html, MANUAL_EXTENSIONS);
}
