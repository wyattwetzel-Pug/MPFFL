/*
 * Short codes for the franchises, used where space is tight (the auction
 * room, dense tables). The fallback keeps unknown teams legible until this
 * map is filled in.
 */
export const TEAM_CODES: Record<string, string> = {
  // Short codes for your franchises — fill in as your league forms, e.g.
  // "Team Name": "CODE". Unknown teams fall back to an auto-abbreviation.
};

export function teamCode(name: string | null | undefined): string {
  if (!name) return "";
  return (
    TEAM_CODES[name] ??
    name
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 4)
      .toUpperCase()
  );
}
