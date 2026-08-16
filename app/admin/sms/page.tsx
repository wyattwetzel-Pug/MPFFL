import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { SettingCard } from "@/components/ui/setting-card";
import { LIMITS, smsEnabled } from "@/lib/sms/send";
import { assertNoLiteralDomains, TEMPLATES } from "@/lib/sms/templates";
import { SmsTest } from "@/components/admin/sms-test";
import { reachReport } from "@/lib/sms/reach";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const dynamic = "force-dynamic";

/*
 * Does the SMS pipe work?
 *
 * Built first, before anything sends for real, so the answer to "is it wired
 * up" is a page rather than a text message you hope arrives.
 */
async function twilioReachable() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return { ok: false, detail: "Credentials not set" };
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
      headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64") },
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, detail: `Twilio replied ${res.status}` };
    const acct = (await res.json()) as { friendly_name?: string; status?: string };
    return { ok: true, detail: `${acct.friendly_name} · ${acct.status}` };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

export default async function SmsPage() {
  const [auth, recent, reach] = await Promise.all([
    twilioReachable(),
    prisma.smsMessage.findMany({
      orderBy: { id: "desc" },
      take: 20,
      include: { owner: { select: { name: true } } },
    }),
    reachReport(),
  ]);

  const test = process.env.SMS_TEST_MODE === "true";
  const badTemplates = assertNoLiteralDomains();

  return (
    <div className="space-y-4">
      <PageHeader title="Text messages" />

      <SettingCard
        title="Twilio"
        status={auth.ok ? { label: "connected", variant: "success" } : { label: "not working", variant: "destructive" }}
        description={auth.detail}
        footer={`From ${process.env.TWILIO_PHONE_NUMBER ?? "— no number set —"}`}
      />

      <SettingCard
        title="Sending"
        status={
          !smsEnabled()
            ? { label: "switched off", variant: "destructive" }
            : test
              ? { label: "test mode", variant: "warning" }
              : { label: "live", variant: "success" }
        }
        description={
          test
            ? `Every message goes to ${process.env.SMS_TEST_PHONE_NUMBER ?? "— no test number set —"} instead of the real recipient.`
            : "Messages go to real owners."
        }
        footer={`Limits: ${LIMITS.perOwnerHour}/owner/hour · ${LIMITS.perOwnerDay}/owner/day · ${LIMITS.leagueDay}/league/day. Set SMS_KILL_SWITCH=true to stop everything.`}
      />

      {/*
        A team nobody can be texted for is a stalled draft waiting to happen:
        the window opens, twelve hours pass in silence, and it moves on. That
        deserves an alert, not a line in a card.
      */}
      {reach.silentTeams.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>
            {reach.silentTeams.length} team{reach.silentTeams.length === 1 ? "" : "s"} cannot be
            told they&apos;re on the clock
          </AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-0.5 pl-4">
              {reach.silentTeams.map((t) => (
                <li key={t.teamId}>
                  <span className="font-medium">{t.teamName}</span> — {t.owners.join(" and ")}
                </li>
              ))}
            </ul>
            Their window will open and close without a word. Get consent before the draft, or
            plan to tell them another way.
          </AlertDescription>
        </Alert>
      )}

      <SettingCard
        title="Who can be texted"
        status={{
          label: `${reach.reachable} of ${reach.total}`,
          variant: reach.owners.length === 0 ? "success" : "warning",
        }}
        description={
          reach.owners.length === 0
            ? "Every active owner has consented and has a number on file."
            : "Everyone below is skipped silently by every send — consent is checked once, deep in the sending code, so nothing else in the app mentions them."
        }
      >
        {reach.owners.length > 0 && (
          <ul className="space-y-1 text-sm">
            {reach.owners.map((o) => (
              <li key={o.ownerId} className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium">{o.name}</span>
                {o.teamName && <span className="text-muted-foreground">{o.teamName}</span>}
                <Badge variant="secondary">{o.reason}</Badge>
              </li>
            ))}
          </ul>
        )}
      </SettingCard>

      {badTemplates.length > 0 && (
        <SettingCard
          title="Templates with a hardcoded domain"
          status={{ label: "fix these", variant: "destructive" }}
          description={badTemplates.join(", ")}
          footer="Links must come from SITE_URL or they break at cutover."
        />
      )}

      <SmsTest templates={Object.keys(TEMPLATES)} />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Recent
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {recent.map((m) => (
              <li key={m.id} className="flex flex-wrap items-baseline gap-2 rounded-md border px-3 py-2">
                <Badge
                  variant={m.status === "sent" ? "success" : m.status === "failed" ? "destructive" : "secondary"}
                >
                  {m.status}
                </Badge>
                <span className="font-medium">{m.owner?.name ?? m.toPhone}</span>
                <span className="text-muted-foreground">{m.template}</span>
                {m.reason && <span className="text-muted-foreground">— {m.reason}</span>}
                <span className="ml-auto text-xs text-muted-foreground">
                  {m.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
