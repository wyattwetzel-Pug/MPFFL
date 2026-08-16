/*
 * §21 — the league MCP server. Read-only league data for all sixteen owners:
 * point Claude (or any MCP client) at
 *
 *   https://REPLACE-WITH-YOUR-DOMAIN.example/api/mcp?key=<league secret>
 *
 * Every tool reads through lib/mcp/queries.ts, which is the privacy
 * boundary. No write tools by league ruling — transactions are filed on the
 * site. The shared secret gates access; rotate it by changing the
 * LEAGUE_MCP_SECRET env var.
 */
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  leagueSnapshotTable,
  teamRoster,
  playerLookup,
  transactionHistory,
  manual,
  rookieDraft,
  auctionResults,
  leagueCalendar,
} from "@/lib/mcp/queries";

export const maxDuration = 60;

const text = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v, null, 1) }] });

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "league_snapshot",
      {
        description: "The whole league at a glance: every team's cap allocation, contracted dollars, money available at the auction, roster counts, cut assets, topper/holdover rights, and rookie picks.",
        inputSchema: {},
      },
      async () => text(await leagueSnapshotTable())
    );
    server.registerTool(
      "team_roster",
      {
        description: "One team's full roster: players, positions, NFL teams, salaries, contract end seasons, back-to-back flags, IR/PS designations.",
        inputSchema: { team: z.string().describe("Team name or a distinctive part of it, e.g. a word from the team's name") },
      },
      async ({ team }) => text(await teamRoster(team))
    );
    server.registerTool(
      "player_lookup",
      {
        description: "Find a player: position, NFL team, who owns him in MPFFL, his contract, and his full league history (every stint, salary and team).",
        inputSchema: { name: z.string().describe("Player name or part of it") },
      },
      async ({ name }) => text(await playerLookup(name))
    );
    server.registerTool(
      "transaction_history",
      {
        description: "The league's approved transaction log — trades, cuts, auction wins, holdovers — newest first. Filter by team, player, or type. Read-only: transactions are filed on REPLACE-WITH-YOUR-DOMAIN.example itself.",
        inputSchema: {
        team: z.string().optional().describe("Only transactions involving this team"),
        player: z.string().optional().describe("Only transactions involving this player"),
        type: z.string().optional().describe("Transaction type, e.g. TRADE, AUCTION_WIN, CONDITIONAL_CUT"),
        limit: z.number().int().min(1).max(100).optional().describe("Max results, default 25"),
      },
      },
      async (args) => text(await transactionHistory(args))
    );
    server.registerTool(
      "league_manual",
      {
        description: "The full MPFFL manual (latest published version) as text, plus the rookie holdover-rates table. Use this to answer any rules question.",
        inputSchema: {},
      },
      async () => text(await manual())
    );
    server.registerTool(
      "rookie_draft",
      {
        description: "The rookie draft for a season: slot order, selections as they're made, holdover amounts.",
        inputSchema: { season: z.number().int().optional().describe("Season year, defaults to the current league year") },
      },
      async ({ season }) => text(await rookieDraft(season))
    );
    server.registerTool(
      "auction_results",
      {
        description: "Auction results for a season, in hammer order — live during the auction as players are won.",
        inputSchema: { season: z.number().int().optional().describe("Season year, defaults to the current league year") },
      },
      async ({ season }) => text(await auctionResults(season))
    );
    server.registerTool(
      "league_calendar",
      {
        description: "Dates that matter: auction date, roster cut-down, trade deadline and other league milestones.",
        inputSchema: {},
      },
      async () => text(await leagueCalendar())
    );
  },
  { serverInfo: { name: "mpffl-og", version: "1.0.0" } }
);

/*
 * The gate: one shared league secret in the URL. Bearer-header auth would be
 * cleaner but claude.ai's connector UI can't set custom headers; a secret URL
 * is the friction level sixteen league-mates will actually tolerate.
 *
 * A missing/wrong key answers 404, NOT 401: Claude's connector treats a 401
 * as "this server wants OAuth" and tries to register a client, which dead-
 * ends in a baffling "couldn't register with MPFFL's sign-in service" error
 * (field-reported by an owner whose paste dropped the ?key=). A 404 fails
 * plainly and doesn't advertise the endpoint.
 */
function guarded(req: Request) {
  const secret = process.env.LEAGUE_MCP_SECRET;
  const key = new URL(req.url).searchParams.get("key");
  if (!secret || key !== secret) {
    return new Response(
      "Not found. If you're connecting an AI client: copy the COMPLETE connector link (including everything after the ?) from REPLACE-WITH-YOUR-DOMAIN.example/mcp.",
      { status: 404 }
    );
  }
  return handler(req);
}

export { guarded as GET, guarded as POST, guarded as DELETE };
