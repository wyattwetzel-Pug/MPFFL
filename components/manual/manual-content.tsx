import { getHoldoverRates } from "@/lib/manual/queries";
import { DYNAMIC_TABLE_PATTERN } from "@/lib/manual/document";

/*
 * Renders stored manual HTML, replacing [DYNAMIC TABLE: …] placeholders with
 * live data so the prose can never drift from the numbers the league uses.
 * Everything happens on the server — readers get markup, not an editor.
 */

async function DynamicTable({ kind }: { kind: string }) {
  const normalized = kind.toLowerCase().replace(/[_\s]+/g, "-").trim();

  if (normalized.includes("holdover")) {
    const { positions, rows } = await getHoldoverRates();
    if (rows.length === 0) return null;
    return (
      <div className="table-scroll my-6 rounded-lg border">
        <table>
          <caption className="sr-only">Rookie holdover rates by pick and position</caption>
          <thead>
            <tr>
              <th scope="col">Pick</th>
              {positions.map((p) => (
                <th key={p} scope="col" className="text-center">
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ pickNumber, amounts }) => (
              <tr key={pickNumber}>
                <th scope="row" className="font-medium">
                  {pickNumber}
                </th>
                {positions.map((p) => (
                  <td key={p} className="text-center">
                    {amounts[p] != null ? `$${amounts[p]}` : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Unknown placeholder: say so rather than silently rendering nothing.
  return (
    <p className="my-4 rounded-md border border-warning/50 px-3 py-2 text-sm text-warning">
      Unknown dynamic table: “{kind}”
    </p>
  );
}

/*
 * A table can't scroll itself — only a wrapper can — and the manual's stored
 * HTML carries raw <table> elements from the editor, one of them with an inline
 * `min-width: 1125px`. On a phone that dragged the entire page sideways.
 *
 * Done here rather than in the render pipeline so it applies to all 32 stored
 * versions, not just ones published from now on.
 */
function wrapTables(html: string): string {
  return html
    .replace(/<table/gi, '<div class="table-scroll"><table')
    .replace(/<\/table>/gi, "</table></div>");
}

export async function ManualContent({ html }: { html: string }) {
  // Split on the placeholder, keeping the captured name so we know what to render.
  const parts = html.split(new RegExp(`(${DYNAMIC_TABLE_PATTERN.source})`, "gi"));

  const nodes: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    const match = part.match(new RegExp(`^${DYNAMIC_TABLE_PATTERN.source}$`, "i"));
    if (match) {
      nodes.push(<DynamicTable key={i} kind={match[1]} />);
      i++; // skip the capture group that split() also emits
      continue;
    }
    nodes.push(<div key={i} dangerouslySetInnerHTML={{ __html: wrapTables(part) }} />);
  }

  return <div className="manual-prose">{nodes}</div>;
}
