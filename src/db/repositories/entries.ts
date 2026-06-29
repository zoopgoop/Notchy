import type { SQLiteDatabase } from "expo-sqlite";
import { LoggedEntry } from "../../types";
import { getDb } from "../client";
import { generateId } from "../id";
import { LoggedEntryRow, rowToLoggedEntry } from "../mappers";

export interface CreateEntryInput {
  goalId: string;
  date: string;
  actualValue?: number;
  hit: boolean;
  generatedTarget: number;
  tagIds: string[];
}

/**
 * One entry per goal per day — "logging again" updates today's entry rather than
 * creating a second one, so tags are replaced wholesale on each save.
 */
export async function createEntry(input: CreateEntryInput): Promise<LoggedEntry> {
  const db = await getDb();

  let id = "";
  await db.withTransactionAsync(async () => {
    const existing = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM logged_entries WHERE goal_id = ? AND date = ?",
      [input.goalId, input.date]
    );
    const entryId = existing?.id ?? generateId();
    id = entryId;

    if (existing) {
      await db.runAsync(
        "UPDATE logged_entries SET actual_value = ?, hit = ?, generated_target = ? WHERE id = ?",
        [input.actualValue ?? null, input.hit ? 1 : 0, input.generatedTarget, entryId]
      );
      await db.runAsync("DELETE FROM entry_tags WHERE entry_id = ?", [entryId]);
    } else {
      await db.runAsync(
        "INSERT INTO logged_entries (id, goal_id, date, actual_value, hit, generated_target) VALUES (?, ?, ?, ?, ?, ?)",
        [entryId, input.goalId, input.date, input.actualValue ?? null, input.hit ? 1 : 0, input.generatedTarget]
      );
    }

    for (const tagId of input.tagIds) {
      await db.runAsync("INSERT INTO entry_tags (entry_id, tag_id) VALUES (?, ?)", [entryId, tagId]);
    }
  });

  return {
    id,
    goalId: input.goalId,
    date: input.date,
    actualValue: input.actualValue,
    hit: input.hit,
    generatedTarget: input.generatedTarget,
    tagIds: input.tagIds,
  };
}

async function attachTagIds(db: SQLiteDatabase, rows: LoggedEntryRow[]): Promise<LoggedEntry[]> {
  if (rows.length === 0) return [];
  const placeholders = rows.map(() => "?").join(",");
  const tagRows = await db.getAllAsync<{ entry_id: string; tag_id: string }>(
    `SELECT entry_id, tag_id FROM entry_tags WHERE entry_id IN (${placeholders})`,
    rows.map((r) => r.id)
  );
  const tagsByEntry = new Map<string, string[]>();
  for (const t of tagRows) {
    tagsByEntry.set(t.entry_id, [...(tagsByEntry.get(t.entry_id) ?? []), t.tag_id]);
  }
  return rows.map((row) => rowToLoggedEntry(row, tagsByEntry.get(row.id) ?? []));
}

/** Ascending by date — the order the progression engine expects. */
export async function listEntriesByGoal(goalId: string): Promise<LoggedEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<LoggedEntryRow>(
    "SELECT * FROM logged_entries WHERE goal_id = ? ORDER BY date ASC",
    [goalId]
  );
  return attachTagIds(db, rows);
}

/** Every logged entry, across every goal — backs data export. */
export async function listAllEntries(): Promise<LoggedEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<LoggedEntryRow>("SELECT * FROM logged_entries ORDER BY date ASC");
  return attachTagIds(db, rows);
}

/** Across all goals — backs the calendar, which needs every entry in a date range regardless of goal. */
export async function listEntriesInRange(startDate: string, endDate: string): Promise<LoggedEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<LoggedEntryRow>(
    "SELECT * FROM logged_entries WHERE date >= ? AND date <= ? ORDER BY date ASC",
    [startDate, endDate]
  );
  return attachTagIds(db, rows);
}

export async function getEntryForDate(goalId: string, date: string): Promise<LoggedEntry | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<LoggedEntryRow>(
    "SELECT * FROM logged_entries WHERE goal_id = ? AND date = ?",
    [goalId, date]
  );
  if (!row) return null;
  const [entry] = await attachTagIds(db, [row]);
  return entry;
}

export async function getLatestEntry(goalId: string): Promise<LoggedEntry | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<LoggedEntryRow>(
    "SELECT * FROM logged_entries WHERE goal_id = ? ORDER BY date DESC LIMIT 1",
    [goalId]
  );
  if (!row) return null;
  const [entry] = await attachTagIds(db, [row]);
  return entry;
}

export async function deleteEntry(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM logged_entries WHERE id = ?", [id]);
}
