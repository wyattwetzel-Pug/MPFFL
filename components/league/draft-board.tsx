import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { StripDivider } from "@/components/league/asset-strip";
import { Countdown } from "@/components/ui/countdown";
import type { Slot } from "@/lib/draft/board";

/*
 * The draft, as one list, always 1 through 32.
 *
 * It was briefly two lists, then one with a newest-first toggle. Both were
 * wrong for the same reason: a draft board is a fixed thing people navigate by
 * position. Re-sorting it moves 1.06 to the top and everything a reader had
 * located moves with it — so you lose your place on the page you came to for
 * one specific row. Slot order never moves. The totals above say what has
 * happened; the rows say where.
 */

function Portrait({ name, url }: { name: string; url: string | null }) {
  return (
    <span className="relative size-10 shrink-0 overflow-hidden rounded-full border bg-muted/30">
      {url ? (
        <Image src={url} alt="" fill sizes="40px" className="object-cover" unoptimized />
      ) : (
        <span className="flex h-full items-center justify-center text-xs font-bold text-muted-foreground/50">
          {name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
        </span>
      )}
    </span>
  );
}

/** "3m ago" while it matters, a date once it doesn't. */
function when(at: Date): string {
  const mins = Math.floor((Date.now() - at.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return at.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function DraftTotals({ slots }: { slots: Slot[] }) {
  const made = slots.filter((s) => s.pick);
  const held = made.filter((s) => s.pick!.selection === "HOLDOVER");
  const committed = held.reduce((sum, s) => sum + (s.pick!.holdoverAmount ?? 0), 0);
  const open = slots.filter((s) => s.state === "open").length;

  /*
   * Same labelled-strip idiom as the rosters page: every figure carries its own
   * label, because "3 · 2 · 1 · $98" means nothing on its own. Committed is the
   * figure people actually want — a holdover shrinks that team's auction budget
   * before bidding opens.
   */
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
      <span className="whitespace-nowrap">
        Picks made:{" "}
        <span className="font-medium text-foreground/80">
          {made.length} of {slots.length}
        </span>
      </span>
      <StripDivider />
      <span className="whitespace-nowrap">
        Held over: <span className="font-medium text-foreground/80">{held.length}</span>
      </span>
      <span className="whitespace-nowrap">
        Committed: <span className="font-medium text-foreground/80">${committed}</span>
      </span>
      <StripDivider />
      <span className="whitespace-nowrap">
        Topping at auction:{" "}
        <span className="font-medium text-foreground/80">{made.length - held.length}</span>
      </span>
      {open > 0 && (
        <>
          <StripDivider />
          <span className="whitespace-nowrap">
            On the clock: <span className="font-medium text-foreground/80">{open}</span>
          </span>
        </>
      )}
    </p>
  );
}

export function DraftBoard({ slots }: { slots: Slot[] }) {
  const rows = [...slots].sort((a, b) => a.slot - b.slot);

  return (
    <div className="space-y-1.5">
      {rows.map((s) => (
        <Card key={s.slot} className={s.state === "open" ? "border-attention/50" : undefined}>
          <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
            <span className="w-12 shrink-0 font-bold tabular-nums">{s.label}</span>

            {s.pick ? (
              <>
                <Portrait name={s.pick.playerName} url={s.pick.headshotUrl} />
                <span className="min-w-0">
                  <span className="font-medium">{s.pick.playerName}</span>{" "}
                  <span className="text-sm text-muted-foreground">
                    {s.pick.position} · {s.pick.nflTeam}
                  </span>
                </span>
                <Badge variant={s.pick.selection === "HOLDOVER" ? "success" : "secondary"}>
                  {s.pick.selection === "HOLDOVER"
                    ? `held over $${s.pick.holdoverAmount}`
                    : "topping at auction"}
                </Badge>
              </>
            ) : (
              /*
               * Only the open slot says anything. "not yet" on every unopened
               * slot was 32 identical lines before a draft starts, and during
               * one the amber border and the badge already carry the contrast —
               * the empty space says it better than a label.
               */
              /*
               * The clock itself, not the words "on the clock" — the row
               * already says that with its amber border and its badge, and
               * what an owner scanning the board wants to know is how long is
               * left, which nothing here used to tell them.
               */
              s.state === "open" &&
              (s.expiresAt && !s.overdue ? (
                <span className="text-sm font-medium text-attention">
                  <Countdown expiresAt={s.expiresAt.toISOString()} /> left
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">on the clock</span>
              ))
            )}

            {/*
              min-w-0 plus truncate is what actually lets a flex child shrink.
              the longest team name in the league was wrapping to
              three lines on a phone and shoving the whole row out of shape.
            */}
            <span className="ml-auto flex min-w-0 items-baseline justify-end gap-x-1.5 text-right text-sm">
              <Link
                href={`/teams/${s.teamSlug}`}
                className="min-w-0 truncate font-medium underline-offset-4 hover:text-primary hover:underline"
              >
                {s.teamName}
              </Link>
              {s.originTeamName && (
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                  via {s.originTeamName}
                </span>
              )}
              {s.pick && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {when(s.pick.pickedAt)}
                </span>
              )}
              {s.state === "open" && (
                <Badge variant={s.overdue ? "destructive" : "warning"} className="shrink-0">
                  {s.overdue ? "overdue" : "open"}
                </Badge>
              )}
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
