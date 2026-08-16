/*
 * §21 — the MCP server's privacy boundary and its tools.
 *
 * Part 1 is the one that matters: a source scan of lib/mcp/queries.ts (the
 * server's only data source) asserting it never touches a war-room table or
 * imports a war-room module. Structural, not configured — if a forbidden
 * accessor ever appears there, this suite fails the build ritual.
 *
 * Part 2 smoke-runs every tool query against the local database.
 *
 *   npx tsx --env-file=.env scripts/verify-mcp.ts
 */
import { readFileSync } from "fs";

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, got?: unknown) => {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} — ${JSON.stringify(got)}`); }
};

async function main() {
  console.log("\nPart 1 — the privacy boundary\n");
  const src = readFileSync("lib/mcp/queries.ts", "utf8") + readFileSync("app/api/mcp/route.ts", "utf8");

  // Forbidden prisma accessors: every war-room table.
  const FORBIDDEN_TABLES = [ "nomination",
  ];
  for (const t of FORBIDDEN_TABLES) {
    check(`never touches prisma.${t}`, !src.includes(`prisma.${t}`));
  }
  // Forbidden module imports: the war room's code.
  for (const m of ["lib/board", "lib/advisor", "@/lib/board", "@/lib/advisor"]) {
    check(`never imports ${m}`, !src.includes(`"${m}`) && !src.includes(`'${m}`));
  }
  // And no raw SQL that could route around the client.
  check("no raw SQL", !/\$queryRaw|\$executeRaw/.test(src));

  console.log("\nPart 2 — the tools answer\n");
  const q = await import("../lib/mcp/queries");

  const snap = await q.leagueSnapshotTable();
  check("league_snapshot: 16 teams", snap.length === 16, snap.length);
  check("league_snapshot: cap math present", snap.every((t) => typeof t.availableAtAuction === "number"));

  const snapName = snap[0]?.team ?? "";
  const roster = await q.teamRoster(String(snapName).slice(0, 5));
  check("team_roster: finds by fragment", "players" in roster && (roster.players?.length ?? 0) > 10, roster);

  const player = await q.playerLookup("Bijan");
  check("player_lookup: Bijan found with history", Array.isArray(player) && player[0].leagueHistory.length > 0);

  const hist = await q.transactionHistory({ limit: 5 });
  check("transaction_history: returns rows", hist.length > 0 && hist[0].moves.length > 0);

  const man = await q.manual();
  check("manual: text present", (man.manualText?.length ?? 0) > 1000, man.manualText?.length);
  check("manual: holdover rates table", man.holdoverRates.length > 0);
  check("manual: no board leakage in text", !/war room|strategy bullet/i.test(man.manualText ?? ""));

  const draft = await q.rookieDraft(2026);
  // Local databases may not carry the draft rows; production does.
  check("rookie_draft: answers (32 slots where seeded)",
    ("picks" in draft && (draft.picks?.length ?? 0) === 32) || "status" in draft, draft);

  const auction = await q.auctionResults(2026);
  check("auction_results: answers (0 wins pre-auction)", auction.picksMade >= 0);

  const cal = await q.leagueCalendar();
  check("league_calendar: answers", Array.isArray(cal.milestones));

  console.log(`\n${pass} passed, ${fail} failed\n`);
  if (fail) process.exitCode = 1;
}

main().catch((e) => { console.error("FAILED:", (e as Error).message); process.exitCode = 1; });
