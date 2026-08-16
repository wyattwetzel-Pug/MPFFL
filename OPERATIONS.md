# Operations

## Build, run, verify
```bash
npm run dev                                      # local dev server
npm run build                                    # before every deploy
npx eslint <files>
npx tsx --env-file=.env scripts/<name>.ts        # scripts against your db
```

## Deploy
Connect the repo to Vercel once (SETUP.md §6). After that, **pushing to
main is the deploy** — Vercel builds and ships automatically in ~40s.

## Verification suites
```bash
npx tsx --env-file=.env scripts/verify-ledger.ts        # derivation + lifecycle
npx tsx --env-file=.env scripts/verify-validation.ts    # trade/transaction rules
npx tsx --env-file=.env scripts/test-transaction-path.ts
npx tsx --env-file=.env scripts/verify-commitment.ts    # whose salary counts when
npx tsx --env-file=.env scripts/verify-draft.ts         # rookie slow draft (writes+reverts; never on a live draft)
npx tsx --env-file=.env scripts/verify-auction.ts
npx tsx --env-file=.env scripts/verify-clear.ts         # pre-auction clear
npx tsx --env-file=.env scripts/verify-declarations.ts  # holdovers/toppers (applies+reverts a clear)
npx tsx --env-file=.env scripts/verify-rules.ts         # rules voting
npx tsx --env-file=.env scripts/verify-mcp.ts           # AI connector privacy boundary
npx tsx scripts/verify-practice-squad.ts                # no database needed
npx tsx scripts/verify-tz.ts                            # no database needed
```
Run them after touching derivation, validation, or lifecycle code. Several
write real rows and put them back — read each script's header before
pointing it at a database you care about.

## Script conventions
- Idempotent: a second run says "nothing to do", never duplicates.
- Dry run by default, `--apply` to write.
- Look rows up by business key (names), never by numeric id.

## Environment
`.env` is git-ignored and holds all secrets: `DATABASE_URL`,
`DATABASE_URL_UNPOOLED`, `RESEND_API_KEY`, `EMAIL_FROM`, and optionally
`LEAGUE_MCP_SECRET` (AI connector) and the Twilio trio (SMS, off by
default). Production values live in Vercel's project settings, never in
files.

## Gotchas inherited from the parent league (all real)
- Migrations need `DATABASE_URL_UNPOOLED` — poolers can't hold the locks.
- Vercel's framework preset must be Next.js (vercel.json declares it).
- Never consume a magic-link token on GET — link previewers will eat it.
  (The sign-in flow already does this right; keep it that way.)
- The league runs on a wall-clock timezone; the server runs UTC. Anything
  with a wall-clock meaning goes through `lib/tz.ts` — check its
  `LEAGUE_TIMEZONE` matches where your league lives.
- Vercel's Node disallows CJS `require()` of ESM — a dependency chain that
  does this dies only in production. If a page 500s in prod but works
  locally, suspect this first.
- Vercel Blob uploads only work in the deployed runtime (OIDC), not from
  local scripts.
- A `"use server"` file may export only async functions.
