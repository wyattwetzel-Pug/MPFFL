/*
 * The league runs on Pacific time.
 *
 * Until now the site was uniformly naive about this: the calendar form parsed a
 * `datetime-local` string on the server and the page formatted it back with no
 * zone, so whatever an owner typed was what everyone read. Self-consistent, and
 * harmless right up to the moment a deadline *enforces* — at which point 10:30
 * meant 10:30 UTC, which is 3:30 in the morning here. Cut-down at "23:59" would
 * have shut at 4:59pm on the day before.
 *
 * So a wall-clock time entered by a commissioner is Pacific, stored as the real
 * instant it names, and displayed back in Pacific. The stored value is always a
 * true point in time; only the reading of it is zoned.
 *
 * No library. `Intl` already knows every offset and every DST rule, including
 * the ones that change — a hard-coded −7/−8 would be wrong twice a year and
 * silently wrong for any date outside the rules we happened to encode.
 */

export const LEAGUE_TIMEZONE = "America/Los_Angeles";

const PARTS = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
} as const;

/** The zone's offset from UTC at a given instant, in milliseconds. */
function offsetAt(instant: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, ...PARTS })
      .formatToParts(instant)
      .map((p) => [p.type, p.value])
  );
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    // Intl gives "24" for midnight under hour12:false in some engines.
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  );
  return asIfUtc - instant.getTime();
}

/**
 * A wall-clock string the league means, as the instant it names.
 *
 * Accepts what the date and datetime-local inputs produce: "2026-08-15" or
 * "2026-08-15T10:30". A bare date is the start of that day.
 *
 * Two passes: the offset depends on the instant, and the instant depends on the
 * offset. The first guess is off only when the guess lands on the far side of a
 * DST boundary from the answer, and the second pass settles it.
 */
export function zonedToInstant(wall: string, timeZone = LEAGUE_TIMEZONE): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(wall.trim());
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00"] = m;

  const naive = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  const first = new Date(naive - offsetAt(new Date(naive), timeZone));
  const second = new Date(naive - offsetAt(first, timeZone));
  return Number.isNaN(second.getTime()) ? null : second;
}

/**
 * An instant as the wall-clock string an input expects — the inverse of
 * `zonedToInstant`, so a round trip through the form changes nothing.
 */
export function instantToZonedInput(
  instant: Date,
  withTime: boolean,
  timeZone = LEAGUE_TIMEZONE
): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, ...PARTS })
      .formatToParts(instant)
      .map((p) => [p.type, p.value])
  );
  const hour = String(Number(parts.hour) % 24).padStart(2, "0");
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return withTime ? `${date}T${hour}:${parts.minute}` : date;
}

/** "Sat, Aug 15, 2026" — in league time, wherever the server happens to be. */
export const formatLeagueDate = (d: Date, timeZone = LEAGUE_TIMEZONE) =>
  d.toLocaleDateString("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/**
 * "Sat, Aug 15, 2026, 10:30 AM PDT".
 *
 * The zone abbreviation is not decoration. A time that enforces has to be
 * unambiguous to somebody reading it from another state, and half this league
 * is not in California.
 */
export const formatLeagueDateTime = (d: Date, timeZone = LEAGUE_TIMEZONE) =>
  `${formatLeagueDate(d, timeZone)}, ${d.toLocaleTimeString("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  })}`;
