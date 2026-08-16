# Architecture

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind v4 ·
Prisma 7 with the `@prisma/adapter-pg` driver adapter and `prisma.config.ts` ·
Neon Postgres · Vercel · Resend for magic-link auth · TipTap 3 for the manual.

## The decision everything else follows from

**Asset balances are derived on read, never stored.** There is no assets table,
and that absence is the design.

The previous generation's failure wasn't too much automation — it was storing balances alongside an
event log, so the two drifted. The evidence: in the parent league's first system, 47 of 85 fix scripts targeted
assets, and it shipped a `compare-rosters-ledger` endpoint whose only purpose
was detecting drift it couldn't prevent.

Deriving makes that entire class of bug structurally impossible. It also makes
lifecycle reversal free: derivation is gated on transaction status, so moving a
transaction backwards simply stops its entries counting. There is no unwind
logic because there is nothing to unwind.

## Module map

| File | Role |
|---|---|
| `lib/ledger/derive.ts` | `deriveAssets()`. Status-gated on `APPROVED`/`COMPLETED`. |
| `lib/ledger/queries.ts` | Read paths. `import "server-only"` — scripts cannot import this. |
| `lib/ledger/validate.ts` | Pure validation over derived assets. No I/O. |
| `lib/ledger/snapshot.ts` | `leagueSnapshot()` — what every team holds. Plus `waiverCost()`. |
| `lib/ledger/transition.ts` | Lifecycle rules. Deliberately free of `next/cache` and auth. |
| `lib/actions/*.ts` | `"use server"` wrappers: auth check, `revalidatePath`, delegate. |

## Invariants

- **Entries are never mutated or deleted** to change an outcome. Status changes
  and new entries are how the world changes.
- **Contingent entries don't count until settled**: `if (e.isContingent &&
  !e.resolvedAt) continue;`. An unresolved term is a promise, not a holding.
  A term resolved against its holder conveys nothing.
- **Validation and display read the same derivation.** If a form computes what a
  team holds by its own route, the two can disagree — which is the bug class
  this architecture exists to eliminate. Client-side checks are a courtesy; the
  server action is the authority.
- **Framework-free where it matters.** Business rules that live inside
  `"use server"` files importing `next/cache` can only be reached through a
  browser session, which makes the most consequential code the hardest to test.
  Keep rules in plain modules; keep auth and cache invalidation in the wrapper.
- **Entries carry provenance.** Rookie picks know their origin team; future
  assets link to the transaction that produced them.

## League rules encoded in the system

- Base cap allocation $500; **ceiling $600** on total allocation.
- **Contracts are immutable.** They travel with a traded player unchanged, and
  end only by expiry, cut, or waiver buyout.
- **Contracted dollars count the season in question and every year beyond it.**
  A deal through 2026 is live for the 2026 season and returns at the 2027
  auction — `contractEndSeason >= season`, which is what `snapshot.ts` computes.
  Everything else — uncontracted players and contracts that ended *before* the
  season — resolves at the August auction. `Available = allocation − contracted`.
  (This line previously read "only deals running *past* the season", which would
  have sent 60 players with 2026 contracts back to the pool a year early.)
- Cap checks compare against **contracted** dollars, not total roster spend. A
  team over its allocation on expiring salary is over nothing. This is why no
  calendar heuristic is needed anywhere.
- Waiver buyout = salary × seasons still to run, payable from more than one
  season's cap.
- A conditional cut costs one conditional cut plus the player's salary. An
  unconditional cut costs one unconditional cut and ends a **live** contract.
- Commissioners get no validation exemption. To record something that would
  breach the cap, first record the adjustment granting the cap — which is itself
  in the log.
