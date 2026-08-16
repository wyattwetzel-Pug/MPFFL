import { currentSeason } from "@/lib/constants";
import { MILESTONES, leagueCalendar } from "@/lib/calendar";
import { formatLeagueDate, formatLeagueDateTime, instantToZonedInput } from "@/lib/tz";
import { PageHeader } from "@/components/ui/page-header";
import { CalendarForm, type Row } from "@/components/admin/calendar-form";

export const dynamic = "force-dynamic";

/*
 * Every date here is read and written in league time. Both of these used to
 * render in the server's zone — UTC on Vercel — so a deadline set for 11:59pm
 * displayed as 11:59pm while actually falling at 4:59pm.
 */
const fmtDate = formatLeagueDate;
const fmtDateTime = formatLeagueDateTime;

/** The value shapes the date and datetime-local inputs expect, in league time. */
const forInput = (d: Date, withTime: boolean) => instantToZonedInput(d, withTime);

export default async function CalendarPage() {
  const season = currentSeason();
  const calendar = await leagueCalendar(season);

  const rows: Row[] = calendar.map((m) => {
    const spec = MILESTONES.find((s) => s.key === m.key)!;
    const withTime = spec.timeMatters ?? false;
    const label = withTime ? fmtDateTime(m.at) : fmtDate(m.at);
    return {
      key: m.key,
      label: m.label,
      rule: m.rule,
      // Blank when falling back: a guess must not look like a decision.
      value: m.source === "set" ? forInput(m.at, withTime) : "",
      fallbackLabel: label,
      setLabel:
        m.source === "set" && m.setAt
          ? `${label} · set ${m.setAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
          : label,
      source: m.source,
      note: m.note,
      derived: spec.derived ?? false,
      timeMatters: withTime,
    };
  });

  return (
    <div className="space-y-4">
      <PageHeader title={`League calendar — ${season}`} />
      <CalendarForm rows={rows} season={season} />
    </div>
  );
}
