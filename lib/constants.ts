// Canonical league constants — used for dropdowns and validation.

export const POSITIONS = ["QB", "RB", "WR", "TE", "K", "OTHER"] as const;
export type PositionValue = (typeof POSITIONS)[number];

export const NFL_TEAMS = [
  { abbr: "ARI", name: "Arizona Cardinals" },
  { abbr: "ATL", name: "Atlanta Falcons" },
  { abbr: "BAL", name: "Baltimore Ravens" },
  { abbr: "BUF", name: "Buffalo Bills" },
  { abbr: "CAR", name: "Carolina Panthers" },
  { abbr: "CHI", name: "Chicago Bears" },
  { abbr: "CIN", name: "Cincinnati Bengals" },
  { abbr: "CLE", name: "Cleveland Browns" },
  { abbr: "DAL", name: "Dallas Cowboys" },
  { abbr: "DEN", name: "Denver Broncos" },
  { abbr: "DET", name: "Detroit Lions" },
  { abbr: "GB", name: "Green Bay Packers" },
  { abbr: "HOU", name: "Houston Texans" },
  { abbr: "IND", name: "Indianapolis Colts" },
  { abbr: "JAX", name: "Jacksonville Jaguars" },
  { abbr: "KC", name: "Kansas City Chiefs" },
  { abbr: "LAC", name: "Los Angeles Chargers" },
  { abbr: "LAR", name: "Los Angeles Rams" },
  { abbr: "LV", name: "Las Vegas Raiders" },
  { abbr: "MIA", name: "Miami Dolphins" },
  { abbr: "MIN", name: "Minnesota Vikings" },
  { abbr: "NE", name: "New England Patriots" },
  { abbr: "NO", name: "New Orleans Saints" },
  { abbr: "NYG", name: "New York Giants" },
  { abbr: "NYJ", name: "New York Jets" },
  { abbr: "PHI", name: "Philadelphia Eagles" },
  { abbr: "PIT", name: "Pittsburgh Steelers" },
  { abbr: "SEA", name: "Seattle Seahawks" },
  { abbr: "SF", name: "San Francisco 49ers" },
  { abbr: "TB", name: "Tampa Bay Buccaneers" },
  { abbr: "TEN", name: "Tennessee Titans" },
  { abbr: "WAS", name: "Washington Commanders" },
  { abbr: "F/A", name: "Free Agent" },
] as const;

/*
 * Alternate NFL team codes seen in imported CSVs, mapped to ours.
 * Keeps one spelling of each team in the database.
 */
export const NFL_TEAM_ALIASES: Record<string, string> = {
  JAC: "JAX",
  FA: "F/A",
  "F.A.": "F/A",
  FREE: "F/A",
  WSH: "WAS",
  LA: "LAR",
  OAK: "LV",
  SD: "LAC",
  STL: "LAR",
};

export function normalizeNflTeam(raw: string): string {
  const t = (raw ?? "").trim().toUpperCase();
  return NFL_TEAM_ALIASES[t] ?? t;
}

export const SALARY_CAP = 500;
export const MAX_ROSTER_VALUE = 600;
export const ACTIVE_ROSTER_SIZE = 20;

/**
 * Resolve a team as written by a human — "Kansas City", "NY Giants",
 * "Green Bay Packers", "KC" — to our abbreviation. Returns null if unknown
 * so callers can report the row instead of guessing.
 */
export function resolveNflTeam(raw: string): string | null {
  const input = (raw ?? "").trim();
  if (!input) return null;

  const upper = normalizeNflTeam(input);
  if (NFL_TEAMS.some((t) => t.abbr === upper)) return upper;

  const simplify = (s: string) =>
    s
      .toLowerCase()
      .replace(/^(la|los angeles)\b/, "los angeles")
      .replace(/^ny\b/, "new york")
      .replace(/[^a-z ]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const needle = simplify(input);
  // Full name match ("Green Bay Packers"), then city/prefix match ("Green Bay").
  const exact = NFL_TEAMS.find((t) => simplify(t.name) === needle);
  if (exact) return exact.abbr;

  const prefix = NFL_TEAMS.filter((t) => simplify(t.name).startsWith(needle + " "));
  if (prefix.length === 1) return prefix[0].abbr;

  return null;
}

/** The MPFFL league year rolls over on March 1st (see the league manual). */
export function currentSeason(now: Date = new Date()): number {
  return now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1;
}
