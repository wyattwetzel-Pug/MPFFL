# Launching MPFFL

This guide assumes you're working with an AI agent (Claude Code or similar)
in this repo. Each step tells you what to ask for and how to check it
worked. Don't skip the checks — "it looks right" is not a verification.

## 0. What you need first
- A GitHub account with this repo (you have it if you're reading this)
- A [Neon](https://neon.tech) account (free tier is fine) — your database
- A [Vercel](https://vercel.com) account — your hosting
- A [Resend](https://resend.com) account — sign-in emails
- Node 22+ installed locally

## 1. Database
1. Create a Neon project called `mpffl`. Copy BOTH connection strings it
   offers: the pooled one and the direct (unpooled) one.
2. In this repo, create a file named `.env` (it is git-ignored — secrets
   never get committed):
   ```
   DATABASE_URL="<pooled connection string>"
   DATABASE_URL_UNPOOLED="<direct connection string>"
   ```
3. Ask your agent to run the schema migration:
   ```
   npx prisma migrate deploy
   npx prisma generate
   ```
   **Check:** `npx prisma db pull --print | head` shows tables like
   `owners`, `teams`, `roster_spots`.

## 2. Your first commissioner
```
npx tsx --env-file=.env scripts/add-owner.ts
```
Follow its prompts to create yourself as a commissioner with your email.
**Check:** the script prints your owner id.

## 3. Seed the rulebook
```
npx tsx --env-file=.env scripts/seed-holdover-rates.ts
npx tsx --env-file=.env scripts/seed-manual.ts
```
The manual arrives as version 1, adapted from the parent league —
**it references their names and history until you edit it.** Editing it at
/manual/edit is one of your first real jobs as commissioner.

## 4. Email sign-in (Resend)
1. In Resend, create an API key. Until you own a domain, you can send from
   Resend's test address — only to your own email.
2. Add to `.env`:
   ```
   RESEND_API_KEY="re_..."
   EMAIL_FROM="MPFFL <onboarding@resend.dev>"
   ```
   When you have a domain, verify it in Resend and change EMAIL_FROM.

## 5. Run it locally
```
npm install
npm run dev
```
**Check:** http://localhost:3000 shows the site; /sign-in emails you a
magic link; clicking it signs you in; /admin shows the commissioner tools.

## 6. Deploy (Vercel)
1. In Vercel: Add New Project → import this GitHub repo. The framework
   preset MUST say Next.js (vercel.json in this repo declares it).
2. Add the same environment variables from your `.env` in the Vercel
   project settings (plus `LEAGUE_MCP_SECRET` — any long random string —
   if you want the AI connector at /mcp).
3. Deploy. **Check:** the Vercel URL loads, and sign-in works end to end.
4. From now on, `git push` to main IS the deploy.

## 7. Enter your league
All through the admin pages, in this order:
1. /admin/owners — teams and owners (each owner signs in with their email)
2. /admin/players/csv — upload a player CSV (name, position, NFL team);
   there is a dry-run preview before anything writes
3. `npx tsx --env-file=.env scripts/import-byes.ts <csv>` — bye weeks
4. /admin/rosters — initial rosters, salaries, contract years
5. /admin/calendar — your league dates (auction, cut-down, trade deadline)
6. /manual/edit — make the constitution yours
7. /admin/rules — rule proposals and voting, when you need them

## 8. Things to know
- **The ledger is sacred.** Every trade, cut, and win is a transaction.
  Nothing is ever edited to change history — corrections are new entries.
  If it isn't in the log, it didn't happen.
- **Privacy & Terms:** /privacy and /tou still carry the parent league's
  text. Have a parent read and adapt them before inviting the league.
- **SMS (Twilio) is present but off.** Draft notifications can text
  people if you ever wire a Twilio account; that's a
  parent-supervised project. Everything works without it.
- **The AI connector** (/mcp) lets anyone in the league ask questions of
  the live database from Claude. It needs `LEAGUE_MCP_SECRET` set.
- The verification suites in `scripts/verify-*.ts` are how you know a
  change didn't break the rules engine. Run them; trust them over vibes.
