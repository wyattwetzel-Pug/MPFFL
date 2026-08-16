import { requireOwner } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/*
 * §21 — the resource page for the league MCP server. Signed-in owners only:
 * this page carries the shared connector secret, which is why the connector
 * link lives here and nowhere else.
 */
export default async function McpPage() {
  await requireOwner();
  const key = process.env.LEAGUE_MCP_SECRET;
  const url = key ? `https://REPLACE-WITH-YOUR-DOMAIN.example/api/mcp?key=${key}` : null;

  const tools: [string, string][] = [
    ["league_snapshot", "Every team's cap, contracted dollars, auction money, cut assets, T/H rights, rookie picks"],
    ["team_roster", "Any team's full roster with contracts, salaries and back-to-back flags"],
    ["player_lookup", "Any player: who owns him, his contract, his entire MPFFL history"],
    ["transaction_history", "The full transaction log, filterable by team, player or type"],
    ["league_manual", "The complete manual plus the holdover-rates table — settle rules arguments instantly"],
    ["rookie_draft", "Draft order and picks for any season"],
    ["auction_results", "Auction results in hammer order — updates live during the room"],
    ["league_calendar", "Auction date, cut-down, trade deadline and other milestones"],
  ];

  const examples = [
    "How much can Burke spend at the auction, and how many roster spots does he need to fill?",
    "Show me every trade Cook has ever made.",
    "What does the manual say about conditional cuts?",
    "Who owns Bijan Robinson and when does his contract end?",
    "What did QBs go for at this year's auction so far?",
    "When is the trade deadline this season?",
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">MPFFL × your AI</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The league now has an MCP server: connect Claude (or any MCP-capable
          assistant) to REPLACE-WITH-YOUR-DOMAIN.example and ask it anything about the league. It reads
          the same live data the site does — rosters, cap math, the transaction
          log, the manual, the draft, the auction. Read-only: trades and
          transactions are still filed here on the site.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Connect it</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {url ? (
            <>
              <p>Your connector link (don&apos;t share outside the league — it&apos;s the key):</p>
              <code className="block overflow-x-auto rounded bg-muted p-2 text-xs">{url}</code>
              <ol className="list-decimal space-y-1.5 pl-5">
                <li>
                  <b>Claude (web or desktop):</b> Settings → Connectors → <i>Add custom connector</i> →
                  paste the link above → Add. Then just ask questions in any chat.
                </li>
                <li>
                  <b>Other MCP clients:</b> it&apos;s a standard streamable-HTTP MCP server at that URL —
                  paste it wherever your tool asks for a remote MCP server.
                </li>
              </ol>
            </>
          ) : (
            <p className="text-attention">The connector key isn&apos;t configured yet — ask Mike.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>What it knows</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1.5 text-sm">
            {tools.map(([name, desc]) => (
              <p key={name}>
                <code className="rounded bg-muted px-1 py-0.5 text-xs">{name}</code>{" "}
                <span className="text-muted-foreground">— {desc}</span>
              </p>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Things to ask it</CardTitle></CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {examples.map((e) => <li key={e}>&ldquo;{e}&rdquo;</li>)}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            It answers from the live database, so &ldquo;can that team afford the trade&rdquo;
            uses the same math the site enforces. If it says something that
            contradicts the site, the site wins — and tell Mike.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
