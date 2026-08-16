/*
 * Exercises lib/ledger/validate.ts against the live 2026 ledger.
 *
 * Every scenario is built from real teams and real holdings, so a rule that
 * only works on invented data fails here.
 */
import { prisma } from "../lib/prisma";
import { COUNTED_STATUSES, SEED_SEASON, deriveAssets } from "../lib/ledger/derive";
import { validateProposal, blocking, warnings, type ProposedEntry, type TeamSnapshot } from "../lib/ledger/validate";
import { committedFor, contractedFor } from "../lib/ledger/commitment.ts";
import { currentSeason } from "../lib/constants";

const SEASON = currentSeason();
let pass = 0, fail = 0;

function check(name: string, ok: boolean, detail = "") {
  console.log(`   ${ok ? "✔" : "✘"} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
  if (ok) pass++;
  else fail++;
}

async function snapshots(): Promise<Map<number, TeamSnapshot>> {
  const teams = await prisma.team.findMany({ select: { id: true, name: true } });
  const ids = teams.map((t) => t.id);
  const entries = await prisma.ledgerEntry.findMany({
    where: {
      transaction: { status: { in: COUNTED_STATUSES } },
      OR: [{ transaction: { isHistorical: false } }, { seasonYear: { gt: SEED_SEASON } }],
    },
    select: {
      seasonYear: true, isContingent: true, resolvedAt: true, assetType: true,
      fromTeamId: true, toTeamId: true, amount: true, round: true,
      pickNumber: true, originTeamId: true, playerId: true, label: true,
    },
  });
  const spots = await prisma.rosterSpot.findMany({
    where: { cutAt: null },
    select: { teamId: true, playerId: true, salary: true, contractEndSeason: true,
              acquiredForSeason: true, player: { select: { name: true } } },
  });

  const out = new Map<number, TeamSnapshot>();
  for (const t of teams) {
    const assets = new Map<number, ReturnType<typeof deriveAssets> extends Map<number, infer V> ? V : never>();
    for (const season of [SEASON, SEASON + 1, SEASON + 2]) {
      const d = deriveAssets(entries, season, ids).get(t.id);
      if (d) assets.set(season, d);
    }
    const mine = spots.filter((s) => s.teamId === t.id);
    out.set(t.id, {
      teamId: t.id,
      teamName: t.name,
      assets,
      roster: new Map(mine.map((s) => [s.playerId, {
        name: s.player.name, salary: s.salary, contractEndSeason: s.contractEndSeason,
        acquiredForSeason: s.acquiredForSeason,
      }])),
      contracted: new Map([[SEASON, mine.filter((s) => s.contractEndSeason != null)
        .reduce((sum, s) => sum + s.salary, 0)]]),
      committed: new Map([[SEASON, committedFor(mine, SEASON)]]),
    });
  }
  return out;
}

async function main() {
  const teams = await snapshots();
  const byName = (n: string) => [...teams.values()].find((t) => t.teamName === n)!;
  const run = (e: ProposedEntry[]) => validateProposal(e, teams, SEASON);

  const teams2 = [...teams.values()].sort((a, b) => (a.assets.get(SEASON)?.capDollars ?? 0) - (b.assets.get(SEASON)?.capDollars ?? 0));
  const hp = teams2[0]; const sbe = teams2[teams2.length - 1]; // thinnest and fattest allocations

  console.log(`Validation rules, ${SEASON} ledger\n`);

  console.log("Cap ceiling:");
  {
    // $538 + $70 = $608, past the $600 ceiling.
    const f = run([{ assetType: "CAP_DOLLARS", seasonYear: SEASON, amount: 70,
                     fromTeamId: hp.teamId, toTeamId: sbe.teamId }]);
    check("a trade past $600 blocks", blocking(f).some((x) => x.teamId === sbe.teamId),
          JSON.stringify(f.map((x) => x.message)));
  }
  {
    const f = run([{ assetType: "CAP_DOLLARS", seasonYear: SEASON, amount: 40,
                     fromTeamId: hp.teamId, toTeamId: sbe.teamId }]);
    check("a trade landing under it does not", !blocking(f).some((x) => x.teamId === sbe.teamId),
          JSON.stringify(f.map((x) => x.message)));
  }

  console.log("\nAssets a team doesn't hold:");
  {
    const f = run([{ assetType: "PS_SPOT", seasonYear: SEASON, amount: 9,
                     fromTeamId: hp.teamId, toTeamId: sbe.teamId }]);
    check("sending 9 PS spots blocks", blocking(f).length > 0, JSON.stringify(f.map((x) => x.message)));
  }
  {
    const f = run([{ assetType: "UNCONDITIONAL_CUT", seasonYear: SEASON, amount: 1,
                     fromTeamId: hp.teamId, toTeamId: sbe.teamId }]);
    const has = hp.assets.get(SEASON)!.unconditionalCuts;
    check(`sending an unconditional cut they don't have blocks (holds ${has})`,
          has === 0 ? blocking(f).length > 0 : true);
  }
  {
    const f = run([{ assetType: "ROOKIE_PICK", seasonYear: SEASON, amount: 1, round: 1,
                     pickNumber: 1, fromTeamId: hp.teamId, toTeamId: sbe.teamId }]);
    check("sending a pick they don't hold blocks", blocking(f).length > 0);
  }
  {
    const held = sbe.assets.get(SEASON)!.rookiePicks[0];
    const f = held
      ? run([{ assetType: "ROOKIE_PICK", seasonYear: SEASON, amount: 1, round: held.round,
               pickNumber: held.pickNumber, originTeamId: held.originTeamId,
               fromTeamId: sbe.teamId, toTeamId: hp.teamId }])
      : [];
    check("sending a pick they do hold passes", blocking(f).length === 0,
          JSON.stringify(f.map((x) => x.message)));
  }

  console.log("\nPlayers:");
  {
    const mine = [...sbe.roster.keys()][0];
    const f = run([{ assetType: "PLAYER", seasonYear: SEASON, amount: 1, playerId: mine,
                     fromTeamId: hp.teamId, toTeamId: sbe.teamId }]);
    check("moving a player off the wrong roster blocks", blocking(f).length > 0);
  }
  {
    const mine = [...hp.roster.keys()][0];
    const f = run([{ assetType: "PLAYER", seasonYear: SEASON, amount: hp.roster.get(mine)!.salary,
                     playerId: mine, fromTeamId: hp.teamId, toTeamId: sbe.teamId }]);
    check("moving their own player passes", blocking(f).length === 0,
          JSON.stringify(f.map((x) => x.message)));
  }

  console.log("\nFuture seasons warn rather than block:");
  {
    const f = run([{ assetType: "PS_SPOT", seasonYear: SEASON + 1, amount: 9,
                     fromTeamId: hp.teamId, toTeamId: sbe.teamId }]);
    check("a 2027 overdraw warns, never blocks",
          warnings(f).length > 0 && blocking(f).length === 0,
          JSON.stringify(f.map((x) => `${x.level}: ${x.message}`)));
  }

  console.log("\nPlayoff-dependent assets:");
  {
    const f = run([{ assetType: "TOPPER_HOLDOVER", seasonYear: SEASON + 1, amount: 1,
                     fromTeamId: sbe.teamId, toTeamId: hp.teamId }]);
    check("a future topper blocks, it isn't a warning",
          blocking(f).length > 0, JSON.stringify(f.map((x) => `${x.level}: ${x.message}`)));
  }
  {
    const f = run([{ assetType: "UNCONDITIONAL_CUT", seasonYear: SEASON + 2, amount: 1,
                     fromTeamId: sbe.teamId, toTeamId: hp.teamId }]);
    check("a future unconditional cut blocks", blocking(f).length > 0);
  }
  {
    const f = run([{ assetType: "CONDITIONAL_CUT", seasonYear: SEASON + 2, amount: 1,
                     fromTeamId: sbe.teamId, toTeamId: hp.teamId }]);
    check("a future conditional cut does not — it's guaranteed",
          blocking(f).length === 0, JSON.stringify(f.map((x) => x.message)));
  }

  console.log("\nContracted salary, not roster spend:");
  {
    // Every team carries expiring salary above its allocation right now; that
    // is normal before the auction and must not read as a violation.
    const f = run([{ assetType: "CAP_DOLLARS", seasonYear: SEASON, amount: 1,
                     fromTeamId: sbe.teamId, toTeamId: hp.teamId }]);
    check("expiring salary above allocation is not a violation",
          !blocking(f).some((x) => x.message.includes("would commit")),
          JSON.stringify(f.map((x) => x.message)));
  }

  /*
   * Holdovers don't exist in the ledger yet — the draft is mid-flight and the
   * auction is a fortnight away — so these run against a snapshot built by
   * hand. The arithmetic is the point, and it has to be right before the first
   * one lands, not after somebody trades on a wrong number.
   */
  console.log("\nHoldover salary counts against the cap:");
  {
    const A = 9001, B = 9002;
    const money = (teamId: number, amount: number) => ({
      seasonYear: SEASON, assetType: "CAP_DOLLARS" as const, amount,
      fromTeamId: null, toTeamId: teamId, isContingent: false, resolvedAt: null,
      round: null, pickNumber: null, originTeamId: null, playerId: null, label: null,
    });
    const assets = deriveAssets([money(A, 500), money(B, 500)] as never, SEASON, [A, B]);

    /** salary, contract end, season the salary belongs to. */
    const spot = (name: string, salary: number, end: number | null, acquired: number | null) =>
      [name, { name, salary, contractEndSeason: end, acquiredForSeason: acquired }] as const;

    const build = (id: number, rows: ReturnType<typeof spot>[]): TeamSnapshot => {
      const roster = new Map(rows.map((r, i) => [i + 1, r[1]]));
      const all = [...roster.values()];
      return {
        teamId: id, teamName: `Team ${id}`,
        assets: new Map([[SEASON, assets.get(id)!]]),
        roster,
        contracted: new Map([[SEASON, contractedFor(all, SEASON)]]),
        committed: new Map([[SEASON, committedFor(all, SEASON)]]),
      };
    };

    // $480 of contracts, plus a rookie held over for $60 — $540 against $500.
    const overByHoldover = build(A, [
      spot("Contracted", 480, SEASON + 1, null),
      spot("Held over", 60, null, SEASON),
    ]);
    const pair = new Map<number, TeamSnapshot>([[A, overByHoldover], [B, build(B, [])]]);

    // Moving a dollar makes the validator price the whole roster for the season.
    const nudge = [{ assetType: "CAP_DOLLARS" as const, seasonYear: SEASON, amount: 1,
                     fromTeamId: B, toTeamId: A }];
    const f = validateProposal(nudge, pair, SEASON);
    check("a $60 holdover is real money against the cap",
          blocking(f).some((x) => x.message.includes("$540")),
          JSON.stringify(f.map((x) => x.message)));

    // The same roster read the old way: $480, comfortably inside $500.
    check("`contracted` alone would have called that legal",
          (overByHoldover.contracted.get(SEASON) ?? 0) === 480, 
          String(overByHoldover.contracted.get(SEASON)));

    // Trading the holdover away frees exactly his salary.
    const away = [{ assetType: "PLAYER" as const, seasonYear: SEASON, amount: 60,
                    playerId: 2, fromTeamId: A, toTeamId: B }];
    check("trading a holdover away frees his salary",
          validateProposal(away, pair, SEASON).filter((x) => x.teamId === A &&
            x.message.includes("would commit")).length === 0,
          JSON.stringify(validateProposal(away, pair, SEASON).map((x) => x.message)));

    // And arriving, he is priced from the sender's spot, not from the entry.
    const sender = build(B, [spot("Held over", 60, null, SEASON)]);
    const receiver = build(A, [spot("Contracted", 480, SEASON + 1, null)]);
    const toward = new Map<number, TeamSnapshot>([[A, receiver], [B, sender]]);
    const arriving = [{ assetType: "PLAYER" as const, seasonYear: SEASON, amount: 60,
                        playerId: 1, fromTeamId: B, toTeamId: A }];
    check("an arriving holdover brings his salary with him",
          blocking(validateProposal(arriving, toward, SEASON)).some((x) => x.message.includes("$540")),
          JSON.stringify(validateProposal(arriving, toward, SEASON).map((x) => x.message)));

    // A player whose salary belonged to last season is about to expire into
    // the pool; acquiring him commits nothing to this one.
    const expiring = build(B, [spot("Last year's win", 60, null, SEASON - 1)]);
    const toward2 = new Map<number, TeamSnapshot>([[A, receiver], [B, expiring]]);
    check("an expiring salary arriving commits nothing this season",
          validateProposal(arriving, toward2, SEASON).filter((x) =>
            x.message.includes("would commit")).length === 0,
          JSON.stringify(validateProposal(arriving, toward2, SEASON).map((x) => x.message)));
  }

  console.log("\nThree teams, one proposal — the Pickens shape:");
  {
    /*
     * D sends $3 cap to N; N sends $17 cap to C and a $40 player to D; C sends
     * an unconditional cut to N. Cap moves twice in one deal — item identity
     * has to be per-leg, and every team's arithmetic has to come out right.
     */
    const D = 9101, N = 9102, C = 9103;
    const grant = (teamId: number, assetType: string, amount: number) => ({
      seasonYear: SEASON, assetType, amount, fromTeamId: null, toTeamId: teamId,
      isContingent: false, resolvedAt: null, round: null, pickNumber: null,
      originTeamId: null, playerId: null, label: null,
    });
    const assets = deriveAssets(
      [grant(D, "CAP_DOLLARS", 500), grant(N, "CAP_DOLLARS", 500),
       grant(C, "CAP_DOLLARS", 500), grant(C, "UNCONDITIONAL_CUT", 1)] as never,
      SEASON, [D, N, C]
    );
    const team = (id: number, roster: [number, { name: string; salary: number; contractEndSeason: number | null; acquiredForSeason: number | null }][]): TeamSnapshot => ({
      teamId: id, teamName: `T${id}`,
      assets: new Map([[SEASON, assets.get(id)!]]),
      roster: new Map(roster),
      contracted: new Map([[SEASON, contractedFor(roster.map(r => r[1]), SEASON)]]),
      committed: new Map([[SEASON, committedFor(roster.map(r => r[1]), SEASON)]]),
    });
    const trio = new Map<number, TeamSnapshot>([
      [D, team(D, [])],
      [N, team(N, [[900, { name: "George Pickens", salary: 40, contractEndSeason: SEASON + 1, acquiredForSeason: null }]])],
      [C, team(C, [])],
    ]);
    const deal: ProposedEntry[] = [
      { assetType: "CAP_DOLLARS", seasonYear: SEASON, amount: 3, fromTeamId: D, toTeamId: N },
      { assetType: "CAP_DOLLARS", seasonYear: SEASON, amount: 17, fromTeamId: N, toTeamId: C },
      { assetType: "UNCONDITIONAL_CUT", seasonYear: SEASON, amount: 1, fromTeamId: C, toTeamId: N },
      { assetType: "PLAYER", seasonYear: SEASON, amount: 40, playerId: 900, fromTeamId: N, toTeamId: D },
    ];
    const f = validateProposal(deal, trio, SEASON);
    check("the full deal validates clean", blocking(f).length === 0,
          JSON.stringify(f.map((x) => x.message)));

    // Break one holding and only that team's leg should fail: C without a cut.
    const noCut = new Map(trio);
    noCut.set(C, { ...trio.get(C)!, assets: new Map([[SEASON, { ...assets.get(C)!, unconditionalCuts: 0 }]]) });
    const f2 = validateProposal(deal, noCut, SEASON);
    check("a missing holding blames the right team",
          blocking(f2).length === 1 && blocking(f2)[0].teamId === C,
          JSON.stringify(blocking(f2).map((x) => x.message)));

    // The hub's cap: N nets −$17 +$3 = $486 allocation, gains nothing salary-wise
    // by shipping Pickens out. D gains $40 of salary against $497 — fine. Now
    // shrink D's allocation so the arriving player breaches it.
    const poorD = new Map(trio);
    poorD.set(D, { ...trio.get(D)!, assets: new Map([[SEASON, { ...assets.get(D)!, capDollars: 30 }]]) });
    const f3 = validateProposal(deal, poorD, SEASON);
    check("an arriving player can breach the receiver's cap mid-deal",
          blocking(f3).some((x) => x.teamId === D && x.message.includes("would commit")),
          JSON.stringify(blocking(f3).map((x) => x.message)));
  }

  // --- Auction-day 2026 regressions ---
  {
    const snap = await snapshots();
    const teams = [...snap.values()];

    // A named topper is tradeable by whoever the ledger says holds it —
    // the submit path once dropped the playerId and validation blocked it.
    const holder = teams.find((t) => (t.assets.get(SEASON)?.namedToppers.length ?? 0) > 0);
    if (holder) {
      const named = holder.assets.get(SEASON)!.namedToppers[0];
      const other = teams.find((t) => t.teamId !== holder.teamId)!;
      const good = validateProposal(
        [{ assetType: "TOPPER_HOLDOVER", seasonYear: SEASON, amount: 1, playerId: named.playerId,
           fromTeamId: holder.teamId, toTeamId: other.teamId }],
        snap, SEASON
      );
      check("a held named topper trades cleanly", blocking(good).length === 0,
            JSON.stringify(blocking(good).map((x) => x.message)));
      const bad = validateProposal(
        [{ assetType: "TOPPER_HOLDOVER", seasonYear: SEASON, amount: 1, playerId: -1,
           fromTeamId: holder.teamId, toTeamId: other.teamId }],
        snap, SEASON
      );
      check("a topper on a player they don't hold blocks", blocking(bad).length === 1,
            JSON.stringify(bad.map((x) => x.message)));
    } else {
      console.log("  (no named toppers in this database — topper checks skipped)");
    }

    // Future cap dollars derive from the $500 base rule, so sending them is
    // legal up to the balance — the form once blocked at "holds $0".
    const [A, B] = teams;
    const capOk = validateProposal(
      [{ assetType: "CAP_DOLLARS", seasonYear: SEASON + 1, amount: 50,
         fromTeamId: A.teamId, toTeamId: B.teamId }],
      snap, SEASON
    );
    check("sending future cap within the $500 base passes",
          !blocking(capOk).some((x) => x.teamId === A.teamId),
          JSON.stringify(blocking(capOk).map((x) => x.message)));
    const capOver = validateProposal(
      [{ assetType: "CAP_DOLLARS", seasonYear: SEASON + 1, amount: 900,
         fromTeamId: A.teamId, toTeamId: B.teamId }],
      snap, SEASON
    );
    // Future-year conflicts warn rather than block (§10.1 disposition 5) —
    // the owner has a season to trade their way out.
    check("overdrafting the future base warns, politely",
          blocking(capOver).length === 0 &&
            capOver.some((x) => x.teamId === A.teamId && /holds 500/.test(x.message)),
          JSON.stringify(capOver.map((x) => `${x.level}: ${x.message}`)));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
