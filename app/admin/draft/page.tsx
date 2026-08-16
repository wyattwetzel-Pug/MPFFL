import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { currentSeason } from "@/lib/constants";
import { getBoard } from "@/lib/draft/board";
import { smsEnabled } from "@/lib/sms/send";
import { reachReport } from "@/lib/sms/reach";
import { PageHeader } from "@/components/ui/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DraftControls } from "@/components/admin/draft-controls";

export const dynamic = "force-dynamic";

export default async function AdminDraftPage() {
  const season = currentSeason();

  /*
   * Deliberately does not call advanceWindows or notifyDraft. This page is for
   * looking at the draft, and a commissioner opening it to check on things
   * shouldn't be what texts the league — /draft does that, in the open.
   */
  const [config, { slots }, sent, reach] = await Promise.all([
    prisma.draftConfig.findUnique({ where: { seasonYear: season } }),
    getBoard(season),
    prisma.smsMessage.count({
      where: { triggerType: { startsWith: "draft_" }, status: "sent" },
    }),
    reachReport(),
  ]);

  const rows = await prisma.draftPick.findMany({
    where: { seasonYear: season },
    select: { slot: true, openNotifiedAt: true },
  });
  const notified = new Map(rows.map((r) => [r.slot, r.openNotifiedAt != null]));

  const made = slots.filter((s) => s.state === "filled").length;
  const open = slots
    .filter((s) => s.state === "open")
    .map((s) => ({
      slot: s.slot,
      label: s.label,
      teamName: s.teamName,
      notified: notified.get(s.slot) ?? false,
      overdue: s.overdue,
    }));

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Rookie draft — ${season}`}
        actions={
          <span className="text-sm text-muted-foreground">
            {made} of {slots.length} picks made ·{" "}
            <Link href="/draft" className="underline underline-offset-4 hover:text-primary">
              the board
            </Link>
          </span>
        }
      />

      {!smsEnabled() && (
        <Alert variant="warning">
          <AlertTitle>Texts are switched off</AlertTitle>
          <AlertDescription>
            <code className="rounded bg-muted px-1 py-0.5 text-xs">SMS_KILL_SWITCH</code> is
            set, so the draft will run silently — windows still open on time, but nobody is
            told. See the{" "}
            <Link href="/admin/sms" className="underline underline-offset-4">
              text-message page
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      {/*
        The check worth making *before* pressing start: a team nobody can text
        gets twelve hours of silence and then loses its window.
      */}
      {reach.silentTeams.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>
            {reach.silentTeams.length} team{reach.silentTeams.length === 1 ? "" : "s"} won&apos;t
            be told they&apos;re on the clock
          </AlertTitle>
          <AlertDescription>
            {reach.silentTeams.map((t) => t.teamName).join(", ")} — nobody who owns them has
            consented to texts. Their window will open and close in silence. See the{" "}
            <Link href="/admin/sms" className="underline underline-offset-4">
              text-message page
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      <DraftControls
        season={season}
        started={!!config?.startedAt}
        completed={!!config?.completedAt}
        windowMinutes={config?.pickWindow ?? 720}
        open={open}
      />

      <p className="text-sm text-muted-foreground">
        {sent} draft text{sent === 1 ? "" : "s"} sent so far. Every attempt — sent, skipped or
        failed — is on the{" "}
        <Link href="/admin/sms" className="underline underline-offset-4">
          text-message page
        </Link>
        , including the ones that were never sent.
      </p>
    </div>
  );
}
