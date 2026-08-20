# MPFFL Roadmap & Decision Log

Newest at the bottom. Record decisions when they're made — this file is the
league's memory of *why*, the way the ledger is its memory of *what*.

## 2026-08 — The fork
Forked from the parent league's engine as a hard fork: no shared code, no
upstream. The war-room features that were personal to the parent league's
commissioner were removed before the fork. Everything else — rosters,
ledger, trades, auction, draft, manual, rules voting — is generic and ours.

## 2026-08-19 — Legacy tab
Added a "Legacy" nav tab (between Transactions and Manual) showing all-time
standings imported from the parent league's spreadsheet, frozen at the fork.
It's a static data file (`lib/legacy/standings.ts`), not a ledger derivation —
this history predates the ledger and nothing here should ever recompute it.
Each row's team name links to `/teams/[slug]`; rows were matched to current
teams by owner name (e.g. "Ludda" → Ludvig Nordland → Buuls) since two
historically separate rows (Lucca K, Griffen) now share one merged team.

## Next
- [ ] Launch (SETUP.md)
- [ ] Enter teams, owners, players, rosters
- [ ] Adapt the manual to MPFFL's rule variations
- [ ] First season calendar
