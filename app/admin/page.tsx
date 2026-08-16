import Link from "next/link";
import {
  ClipboardList,
  DollarSign,
  Hourglass,
  Image,
  MessageSquare,
  CalendarDays,
  Users,
  Upload,
  BookOpen,
  Palette,
  Timer,
  Send,
  BarChart3, Gavel } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { deliveryStatus } from "@/lib/delivery-status";

const tools = [
  {
    href: "/admin/rosters",
    Icon: ClipboardList,
    title: "Edit Rosters",
    desc: "Add, edit, cut, and remove players from team rosters.",
  },
  {
    title: "Conditions",
    desc:
      "Terms that couldn't be settled when a trade was filed. Every one in league history sat forgotten until someone went looking.",
    badge: true,
    href: "/admin/conditions",
    Icon: Hourglass,
  },
  {
    title: "Text Messages",
    desc: "Twilio status, who can be texted, recent sends, and a test message.",
    href: "/admin/sms",
    Icon: MessageSquare,
  },
  {
    href: "/admin/draft",
    Icon: Timer,
    title: "Rookie Draft",
    desc: "Start the slow draft, set the pick window, and see who's on the clock.",
  },
  {
    href: "/admin/auction-prep",
    Icon: Gavel,
    title: "Auction Prep",
    desc: "The pre-auction roster clear: who returns to the pool, who stays, and the button that does it.",
  },
  {
    href: "/admin/owners",
    Icon: Users,
    title: "Owners",
    desc: "Who owns which team. Add an owner, hand a team over, or take somebody out of the league.",
  },
  {
    href: "/admin/holdover-rates",
    Icon: DollarSign,
    title: "Holdover Rates",
    desc: "What a rookie costs to hold over, by pick and position.",
  },
  {
    title: "League Calendar",
    desc:
      "Set the auction, cut-down, trade deadline and settlement dates. Unset dates fall back to approximations.",
    href: "/admin/calendar",
    Icon: CalendarDays,
  },
  {
    href: "/admin/headshots",
    Icon: Image,
    title: "Headshots",
    desc: "Player portraits for the draft board and rosters.",
  },
  {
    href: "/admin/players",
    Icon: Users,
    title: "Manage Players",
    desc: "Create, edit, and deactivate players in the player database.",
  },
  {
    href: "/admin/players/csv",
    Icon: Upload,
    title: "CSV Player Update",
    desc: "Upload a CSV to update NFL teams/positions and add new players, with a dry-run preview.",
  },
  {
    href: "/manual/edit",
    Icon: BookOpen,
    title: "Edit Manual",
    desc: "Revise the league manual. Publishing creates a new version; the history is never lost.",
  },
  {
    href: "/admin/rules",
    Icon: BookOpen,
    title: "Rule Votes",
    desc: "Propose rule changes with attribution, set the voting deadline, and declare outcomes after the lock.",
  },
  {
    href: "/admin/stats",
    Icon: BarChart3,
    title: "Usage",
    desc: "Who has signed in, when they were last here, and which pages get looked at.",
  },
  {
    href: "/styleguide",
    Icon: Palette,
    title: "Styleguide",
    desc: "The living design system — every component and pattern on the site.",
  },
];

export default async function AdminHome() {
  // Surfaced on the index because a queue nobody visits is a queue that
  // forgets — which is exactly what happened to all three of these before.
  const [openConditions, delivery] = await Promise.all([
    prisma.condition.count({ where: { resolvedAt: null } }),
    deliveryStatus(),
  ]);

  return (
    <div className="space-y-4">
      {/*
        How mail and texts are going out, stated on the page people already
        open. Both channels fail silently — a sandbox sender or a kill switch
        looks exactly like everything working — and both have already caught
        us out once.
      */}
      {delivery.email.sandbox && (
        <Alert variant="destructive">
          <AlertTitle>Sign-in email only reaches you</AlertTitle>
          <AlertDescription>
            <code className="rounded bg-muted px-1 py-0.5 text-xs">EMAIL_FROM</code> isn&apos;t
            set, so magic links send from Resend&apos;s shared sandbox address. Everyone
            else&apos;s link is accepted and then dropped. Set it to a verified sender.
          </AlertDescription>
        </Alert>
      )}

    <div className="grid gap-4 sm:grid-cols-2">
      {/*
        Delivery sits in the grid rather than in a banner: it's a thing you go
        and look at, like the others, and a bar across the top of a page
        somebody opens twenty times a day stops being read.
      */}
      <Link href="/admin/sms">
        <Card className="h-full transition-colors hover:bg-accent/50">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <Send className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              Delivery
              {delivery.email.sandbox && <Badge variant="destructive">email sandboxed</Badge>}
              {delivery.sms.silentTeams > 0 && (
                <Badge variant="destructive">
                  {delivery.sms.silentTeams} team
                  {delivery.sms.silentTeams === 1 ? "" : "s"} unreachable
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>Email</span>
                <Badge variant={delivery.email.sandbox ? "destructive" : "success"}>
                  {delivery.email.sandbox ? "sandbox sender" : "live"}
                </Badge>
                <span>{delivery.email.from}</span>
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>Texts</span>
                <Badge
                  variant={
                    delivery.sms.mode === "live"
                      ? "success"
                      : delivery.sms.mode === "test"
                        ? "warning"
                        : "destructive"
                  }
                >
                  {delivery.sms.mode === "live"
                    ? "live"
                    : delivery.sms.mode === "test"
                      ? "test mode"
                      : "switched off"}
                </Badge>
                <span>
                  {delivery.sms.mode === "test" && delivery.sms.testNumber
                    ? `all to ${delivery.sms.testNumber}`
                    : `${delivery.sms.reachable} of ${delivery.sms.total} owners reachable`}
                </span>
              </span>
            </CardDescription>
          </CardHeader>
        </Card>
      </Link>

      {tools.map((t) => (
        <Link key={t.href} href={t.href}>
          <Card className="h-full transition-colors hover:bg-accent/50">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {/* A line icon per module: eight cards of identical text are
                    read by position, which is fragile the moment one moves. */}
                <t.Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                {t.title}
                {t.badge && openConditions > 0 && (
                  <Badge variant="warning">{openConditions} outstanding</Badge>
                )}
              </CardTitle>
              <CardDescription>{t.desc}</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      ))}
    </div>
    </div>
  );
}
