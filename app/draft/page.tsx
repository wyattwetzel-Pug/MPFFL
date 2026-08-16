import type { Metadata } from "next";
import { getSessionOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentSeason } from "@/lib/constants";
import { advanceWindows, getBoard } from "@/lib/draft/board";
import { notifyDraft } from "@/lib/draft/notify";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { OnTheClock } from "@/components/league/on-the-clock";
import { DraftBoard, DraftTotals } from "@/components/league/draft-board";
import { LiveRefresh } from "@/components/league/live-refresh";

export const dynamic = "force-dynamic";

/*
 * What the link looks like when it lands in Messages.
 *
 * Every announcement text carries this URL, so the preview under the photo is
 * read far more often than the page's own title bar. Left to the site defaults
 * it said "MPFFL Fantasy Football League" over a domain — the two facts the
 * recipient already had — while the headshot above it went unexplained.
 *
 * Deliberately read-only: no advanceWindows, no notifyDraft. A link preview is
 * a fetch by Apple, not a visit by an owner, and it must not move the draft.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ pick?: string }>;
}): Promise<Metadata> {
  const season = currentSeason();
  const [{ slots }, { pick }] = await Promise.all([getBoard(season), searchParams]);

  /*
   * An on-the-clock text names the slot it's about, so its preview is that
   * team's turn rather than whatever pick happened to be most recent.
   */
  const slot = Number(pick);
  const mine = Number.isInteger(slot) ? slots.find((s) => s.slot === slot) : undefined;
  if (mine && mine.state !== "waiting") {
    const title = mine.pick
      ? `Pick ${mine.label} — ${mine.teamName}`
      : `${mine.teamName} are on the clock`;
    const description = mine.pick
      ? `${mine.teamName} took ${mine.pick.playerName} at ${mine.label}.`
      : `Pick ${mine.label} in the ${season} MPFFL rookie slow draft.`;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "website",
        // A made pick shows the rookie when we have their portrait; the card is
        // the fallback, and the only option while a slot is still open.
        images: [
          mine.pick?.headshotUrl
            ? { url: mine.pick.headshotUrl }
            : { url: `/api/og/clock?slot=${slot}`, width: 1200, height: 630 },
        ],
      },
      twitter: { card: "summary_large_image", title, description },
    };
  }

  /*
   * The bare link. It used to describe the most recent pick, which is right
   * for an announcement text and wrong for a link somebody shares — "come look
   * at the draft" arrived as a photo of one rookie with his name on it.
   */
  const done = slots.filter((s) => s.pick).length;
  const open = slots.filter((s) => s.state === "open");
  const title = `${season} MPFFL rookie draft`;
  const description =
    done === 0
      ? "The rookie slow draft. 32 picks, twelve hours each."
      : `${done} of ${slots.length} picks made` +
        (open.length === 1
          ? ` · ${open[0].teamName} on the clock at ${open[0].label}`
          : open.length > 1
            ? ` · ${open.length} teams on the clock`
            : "");

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: "/api/og/clock", width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function DraftPage() {
  const season = currentSeason();

  // Loading the board is what advances it, and what sends the texts. No cron
  // to fail at 3am; both are idempotent, so a second visitor sends nothing.
  await advanceWindows(season);
  await notifyDraft(season);

  const [owner, { config, slots, taken }] = await Promise.all([getSessionOwner(), getBoard(season)]);

  const started = !!config?.startedAt;
  const open = slots.filter((s) => s.state === "open");
  const mine = owner ? open.filter((s) => s.teamId === owner.teamId) : [];

  /*
   * What this owner may pick right now.
   *
   * A commissioner gets every open window, their own first — they are the
   * fallback when somebody is unreachable, and that has to hold whether or not
   * their own team happens to be on the clock. It previously read
   * `mine.length > 0 ? mine : open`, which silently took the commissioner
   * power away for exactly as long as they had a pick of their own pending.
   */
  const pickable = owner?.isCommissioner
    ? [...mine, ...open.filter((s) => s.teamId !== owner.teamId)]
    : mine;

  /*
   * Where this owner picks next.
   *
   * An owner who isn't on the clock previously saw exactly what a stranger saw
   * — the board, and no indication of their own stake in it. This is the
   * question they came with.
   */
  const myNext = owner?.teamId
    ? slots.find((s) => s.teamId === owner.teamId && !s.pick)
    : undefined;
  const myRemaining = owner?.teamId
    ? slots.filter((s) => s.teamId === owner.teamId && !s.pick).length
    : 0;
  const away = myNext ? slots.filter((s) => !s.pick && s.slot < myNext.slot).length : 0;

  const rates = await prisma.holdoverRate.findMany();

  // Every active rookie is selectable, not just the ones with a portrait.
  const available = await prisma.player.findMany({
    where: { active: true, rookieYear: { gte: season }, id: { notIn: [...taken] } },
    select: { id: true, name: true, position: true, nflTeam: true, headshotUrl: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title={`${season} rookie draft`} />
        <LiveRefresh />
      </div>

      {/*
        Before it starts, the board is still the useful thing — it's derived
        from the ledger, so it already shows the real order including picks
        acquired by trade. Owners spend the week before a draft working out
        where they pick.
      */}
      {!started && (
        <Alert>
          <AlertTitle>The draft will start Saturday, August 1st</AlertTitle>
          <AlertDescription>
            12 hour selection windows. You&apos;ll get a text when you&apos;re on the clock and
            when picks are made. The draft order below reflects all trades and transactions —
            that we know about.
          </AlertDescription>
        </Alert>
      )}

      {/* Signed out: say what signing in is for, rather than nothing at all. */}
      {!owner && (
        <p className="text-sm text-muted-foreground">
          <Link
            href="/sign-in?next=%2Fdraft"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>{" "}
          to make your pick when your window opens.
        </p>
      )}

      {/* Signed in, not currently picking: their own stake in the board. */}
      {owner?.teamId && pickable.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {myNext
            ? started
              ? `You're up at ${myNext.label}${away > 0 ? ` — ${away} pick${away === 1 ? "" : "s"} away` : " — you're next"}.`
              : `You hold ${myRemaining} pick${myRemaining === 1 ? "" : "s"}, starting at ${myNext.label}.`
            : "You have no picks left in this draft."}
        </p>
      )}

      {pickable.length > 0 && (
        <OnTheClock
          slots={pickable.map((s) => ({
            slot: s.slot,
            label: s.label,
            round: s.round,
            teamName: s.teamName,
            teamId: s.teamId,
            overdue: s.overdue,
            expiresAt: s.expiresAt?.toISOString() ?? null,
            yours: owner?.teamId === s.teamId,
          }))}
          players={available}
          rates={rates.map((r) => ({ pickNumber: r.pickNumber, position: r.position, amount: r.amount }))}
          isCommissioner={!!owner?.isCommissioner}
        />
      )}

      {/*
        Making a pick sits above; the board sits below and never moves. The
        totals carry what the rows can't say for themselves.
      */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          The board
        </h2>
        <DraftTotals slots={slots} />
        <DraftBoard slots={slots} />
      </section>
    </div>
  );
}
