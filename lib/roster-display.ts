// Shared types + helpers for roster rendering (server queries → client table).

export type RosterRow = {
  id: number;
  position: string;
  playerName: string;
  nflTeam: string;
  byeWeek: number | null;
  salary: number;
  contractEndSeason: number | null;
  /** Which season an uncontracted salary belongs to — a holdover's money is
   *  spent auction money, and the Available figure must see it. Optional:
   *  only the pages that compute Available thread it through. */
  acquiredForSeason?: number | null;
  isBackToBack: boolean;
  designation: "ACTIVE" | "IR" | "PS";
  notes: string | null;
  /*
   * Flagged inactive in the player database while still on this roster.
   *
   * Rosters show everyone: the team is paying this salary and it counts against
   * their cap, so hiding the row would make the totals disagree with the rows
   * that produced them. The mark is there so nobody has to wonder why a name
   * they can't find in a picker is sitting on a roster.
   */
  playerInactive?: boolean;
};

export type TeamRosterData = {
  teamId: number;
  teamName: string;
  abbreviation: string;
  ownerNames: string[];
  rows: RosterRow[];
  /** True for the signed-in owner's own team, which sorts to the top. */
  isOwnTeam?: boolean;
  slug: string;
};

export const POSITION_ORDER: Record<string, number> = {
  QB: 1,
  RB: 2,
  WR: 3,
  TE: 4,
  K: 5,
  OTHER: 6,
};

// Default sort: position, then salary descending, then name — matches the old site.
export function defaultRosterSort(a: RosterRow, b: RosterRow): number {
  const posDiff =
    (POSITION_ORDER[a.position] ?? 99) - (POSITION_ORDER[b.position] ?? 99);
  if (posDiff !== 0) return posDiff;
  if (a.salary !== b.salary) return b.salary - a.salary;
  return a.playerName.localeCompare(b.playerName);
}

export function fantasyProsUrl(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[.']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `https://www.fantasypros.com/nfl/players/${slug}.php`;
}
