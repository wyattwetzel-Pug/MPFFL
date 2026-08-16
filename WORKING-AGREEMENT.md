# Working agreement

How to build on this codebase with an AI agent. These rules came from a
year of real use in the parent league — every one of them was learned the
hard way. Follow them and your agent makes the site better; skip them and
you'll spend weekends un-breaking your league.

## No data loss
The transaction log is sacred: **if it isn't in the log, it didn't
happen.** Entries are never edited or deleted to change an outcome —
corrections are recorded as new transactions. Your league's history is the
product; the code just displays it.

## The process, per feature
1. Write down what you want and why (a few sentences is fine).
2. Let the agent ask questions — answer the ones where different answers
   mean different builds.
3. The agent studies the code and writes a plan into PLAN.md.
4. You read the plan. Actually read it.
5. Green light. Then it builds.

Skipping to 5 has never once been the right call.

## Verify, don't trust
After every deploy, check the result on the live site. When a claim is
about data, demand a script: `16 passed, 0 failed` is proof, "it looks
right" is a feeling. The `scripts/verify-*.ts` suites exist for exactly
this — run them after touching the ledger, validation, or lifecycle code.

## Build from the styleguide
/styleguide is the design system and it is the source, not a gallery.
New UI reaches for an existing component; if none fits, add one THERE and
use it everywhere. One-off styles are how a site quietly becomes a mess.

## Settings autosave; submissions don't
A setting is atomic and reversible — it saves on blur. A submission (a
trade, a cut, anything that writes ledger entries) must be complete and
coherent before it exists, so it keeps an explicit submit button.

## Precision matters
This league moves real (pretend) money. A wrong number is worse than a
late one. When a figure could be read two ways, label it so it can't.
