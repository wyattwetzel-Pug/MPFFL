/*
 * What we say, and when.
 *
 * Every link is built from SITE_URL. v1 hardcoded https://www.REPLACE-WITH-YOUR-DOMAIN.example into
 * two of its six templates while the rest used a variable, which would have
 * half-broken the moment the domain moved — the exact transition this rebuild
 * is heading for. `assertNoLiteralDomains()` keeps that from creeping back.
 */

export type TemplateKey =
  | "DRAFT_PICK_NOTIFICATION"
  | "DRAFT_PICK_REMINDER"
  | "ROOKIE_PICK_ANNOUNCEMENT"
  | "TRADE_APPROVED"
  | "TRANSACTION_SUBMITTED"
  | "SCHEDULE_PUBLISHED"
  | "FORWARDED_REPLY";

export type TemplateSpec = { body: string; triggerType: string };

export const TEMPLATES: Record<TemplateKey, TemplateSpec> = {
  DRAFT_PICK_NOTIFICATION: {
    // The link carries {slot} so its preview is about *this* turn. Without it
    // both draft texts pointed at the same URL, and an owner's on-the-clock
    // message previewed the rookie somebody else had just taken.
    body: "🏆 You are on the clock! Pick #{pickNumber} in the MPFFL {leagueYear} rookie slow draft belongs to {teamName}. You have {hours} hours to make your selection at {siteUrl}/draft?pick={slot}",
    triggerType: "draft_pick_start",
  },
  DRAFT_PICK_REMINDER: {
    // {timeLeft} carries its own unit. With a bare {hours} this read "expires
    // in 1 hours" whenever a window had under 90 minutes on it.
    body: "⏰ Reminder: Pick #{pickNumber} for {teamName} expires in {timeLeft}! Make your selection at {siteUrl}/draft?pick={slot}",
    triggerType: "draft_pick_reminder",
  },
  ROOKIE_PICK_ANNOUNCEMENT: {
    body: "With the {pickNumber}{ordinalSuffix} pick in the {leagueYear} MPFFL rookie slow draft, {selectingTeam} selects {playerName}, {position}, {nflTeam}. {nextTeam} is now on the clock and has {hours} hours to make their selection. Make and view picks at {siteUrl}/draft?pick={slot}",
    triggerType: "rookie_pick_announcement",
  },
  TRADE_APPROVED: {
    // {otherTeamNames} is the rest of the deal from each recipient's seat —
    // one name in a bilateral, "X and Y" in a three-team trade.
    body: "Your trade with {otherTeamNames} has been approved by the Commissioner. Check {siteUrl}/rosters to confirm your players, picks, cap dollars and cut assets all updated. Details at {siteUrl}/transactions/{transactionId}",
    triggerType: "trade_approved",
  },
  TRANSACTION_SUBMITTED: {
    body: "A new trade or transaction has been submitted. Review and approve at {siteUrl}/transactions/{transactionId}",
    triggerType: "transaction_submitted",
  },
  // Someone texted the league number. Whoever they are, a human should see it.
  FORWARDED_REPLY: {
    body: "MPFFL text from {who}: \"{message}\"",
    triggerType: "forwarded_reply",
  },
  SCHEDULE_PUBLISHED: {
    body: "📅 The {leagueYear} MPFFL schedule is live! View it at {siteUrl}/manual",
    triggerType: "schedule_published",
  },
};

/** Fill {placeholders}. An unfilled one is a bug, so it's loud rather than blank. */
export function render(key: TemplateKey, vars: Record<string, string | number>): string {
  const body = TEMPLATES[key].body.replace(/\{(\w+)\}/g, (_, name) => {
    const value = vars[name];
    if (value == null) throw new Error(`Template ${key} has no value for {${name}}`);
    return String(value);
  });
  return body;
}

/** 1st, 2nd, 3rd… */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

/** No template may carry a domain of its own. */
export function assertNoLiteralDomains(): string[] {
  return Object.entries(TEMPLATES)
    .filter(([, spec]) => /https?:\/\/(?!\{)/i.test(spec.body))
    .map(([key]) => key);
}
