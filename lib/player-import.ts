/*
 * Player CSV import logic — pure, no database or server dependencies, so the
 * admin UI and the CLI script share one implementation and can't drift.
 *
 * Rules:
 *   match on name + position (case-insensitive)  → update NFL team / status
 *   name matches exactly one record in BOTH the  → position change on that
 *     database and the CSV, position differs        record (not a duplicate)
 *   no match                                     → new player
 *   in database but absent from the CSV          → always left alone
 */
import { parse } from "csv-parse/sync";
import { POSITIONS, normalizeNflTeam } from "./constants.ts";

export type PositionValue = (typeof POSITIONS)[number];

export type CsvRow = {
  name: string;
  position: PositionValue;
  nflTeam: string;
  active: boolean | null; // null = no status column → leave unchanged
};

export type ExistingPlayer = {
  id: number;
  name: string;
  position: string;
  nflTeam: string;
  active: boolean;
};

export type ImportPlan = {
  updates: { id: number; name: string; position: string; changes: string[] }[];
  positionChanges: {
    id: number;
    name: string;
    from: string;
    to: string;
    teamChange: string | null;
  }[];
  adds: { name: string; position: string; nflTeam: string }[];
  unchanged: number;
  notInCsv: number;
};

const HEADER_ALIASES: Record<string, string> = {
  player: "name",
  "player name": "name",
  name: "name",
  position: "position",
  pos: "position",
  "nfl team": "nflTeam",
  nfl: "nflTeam",
  team: "nflTeam",
  status: "status",
};

export function normalizePosition(raw: string): PositionValue | null {
  const p = (raw ?? "").trim().toUpperCase();
  if ((POSITIONS as readonly string[]).includes(p)) return p as PositionValue;
  if (["DEF", "DST", "D/ST", "P", "LB", "DB", "DL", "OL"].includes(p)) return "OTHER";
  return null;
}

/** Parse CSV text into rows, collecting a message for every skipped line. */
export function parsePlayerCsv(text: string): { rows: CsvRow[]; errors: string[] } {
  const errors: string[] = [];
  let records: Record<string, string>[];
  try {
    records = parse(text, {
      columns: (header: string[]) =>
        header.map((h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? h.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, string>[];
  } catch (e) {
    return {
      rows: [],
      errors: [`CSV parse error: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  if (records.length === 0) return { rows: [], errors: ["CSV is empty"] };

  for (const col of ["name", "position", "nflTeam"]) {
    if (!(col in records[0])) {
      return {
        rows: [],
        errors: [
          "Missing a required column. Expected Player / Position / NFL Team (or name / position / team).",
        ],
      };
    }
  }

  const rows: CsvRow[] = [];
  records.forEach((rec, i) => {
    const line = i + 2; // header occupies line 1
    const name = rec.name?.trim();
    const rawPos = rec.position ?? "";
    const nflTeam = normalizeNflTeam(rec.nflTeam ?? "");

    // Trailing blank rows are common in exported sheets — skip silently.
    if (!name && !rawPos.trim() && !nflTeam) return;

    if (!name || !nflTeam) {
      errors.push(`Row ${line}: missing player name or NFL team — skipped`);
      return;
    }
    const position = normalizePosition(rawPos);
    if (!position) {
      errors.push(
        rawPos.includes(",")
          ? `Row ${line}: "${name}" lists multiple positions ("${rawPos}") — skipped, set the position manually`
          : `Row ${line}: unknown position "${rawPos}" for ${name} — skipped`
      );
      return;
    }

    let active: boolean | null = null;
    if ("status" in rec && rec.status?.trim()) {
      active = ["true", "active", "1", "y", "yes"].includes(rec.status.trim().toLowerCase());
    }
    rows.push({ name, position, nflTeam, active });
  });

  return { rows, errors };
}

type Index = {
  byKey: Map<string, ExistingPlayer>;
  byName: Map<string, ExistingPlayer[]>;
  csvNameCount: Map<string, number>;
};

function buildIndex(rows: CsvRow[], existing: ExistingPlayer[]): Index {
  const byKey = new Map<string, ExistingPlayer>();
  const byName = new Map<string, ExistingPlayer[]>();
  for (const p of existing) {
    const n = p.name.toLowerCase();
    byKey.set(`${n}|${p.position}`, p);
    byName.set(n, [...(byName.get(n) ?? []), p]);
  }
  const csvNameCount = new Map<string, number>();
  for (const r of rows) {
    const n = r.name.toLowerCase();
    csvNameCount.set(n, (csvNameCount.get(n) ?? 0) + 1);
  }
  return { byKey, byName, csvNameCount };
}

/**
 * Decide what a row means. Returns the matched record plus the kind of change,
 * so the planner and the writer stay in lockstep.
 */
export function classifyRow(
  row: CsvRow,
  idx: Index
):
  | { kind: "update"; player: ExistingPlayer }
  | { kind: "positionChange"; player: ExistingPlayer }
  | { kind: "add" } {
  const nameKey = row.name.toLowerCase();
  const match = idx.byKey.get(`${nameKey}|${row.position}`);
  if (match) return { kind: "update", player: match };

  const sameName = idx.byName.get(nameKey) ?? [];
  if (sameName.length === 1 && idx.csvNameCount.get(nameKey) === 1) {
    return { kind: "positionChange", player: sameName[0] };
  }
  return { kind: "add" };
}

/** Build a full report of what an import would do. Writes nothing. */
export function planImport(rows: CsvRow[], existing: ExistingPlayer[]): ImportPlan {
  const idx = buildIndex(rows, existing);
  const plan: ImportPlan = {
    updates: [],
    positionChanges: [],
    adds: [],
    unchanged: 0,
    notInCsv: 0,
  };
  const touched = new Set<number>();

  for (const row of rows) {
    const result = classifyRow(row, idx);

    if (result.kind === "update") {
      const p = result.player;
      touched.add(p.id);
      const changes: string[] = [];
      if (p.nflTeam !== row.nflTeam) changes.push(`team ${p.nflTeam} → ${row.nflTeam}`);
      if (row.active !== null && p.active !== row.active)
        changes.push(`status → ${row.active ? "Active" : "Inactive"}`);
      if (changes.length > 0) {
        plan.updates.push({ id: p.id, name: p.name, position: p.position, changes });
      } else {
        plan.unchanged++;
      }
      continue;
    }

    if (result.kind === "positionChange") {
      const p = result.player;
      touched.add(p.id);
      plan.positionChanges.push({
        id: p.id,
        name: p.name,
        from: p.position,
        to: row.position,
        teamChange: p.nflTeam !== row.nflTeam ? `${p.nflTeam} → ${row.nflTeam}` : null,
      });
      continue;
    }

    plan.adds.push({ name: row.name, position: row.position, nflTeam: row.nflTeam });
  }

  plan.notInCsv = existing.length - touched.size;
  return plan;
}

export { buildIndex };

/*
 * The shape the CSV preview hands to the browser.
 *
 * It lives here rather than beside the server action that produces it: a
 * `"use server"` module may only export async functions, and a type export
 * from one is not erased cleanly — it compiles to a runtime re-export of a
 * name that doesn't exist, and the whole actions module then fails to
 * evaluate. That took every player action down with it, not just the CSV.
 */
export type CsvPreview = ImportPlan & {
  errors: string[];
  rows: CsvRow[];
  rookieYear: number | null;
};
