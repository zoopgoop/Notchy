import { getDb } from "../client";

/** Aggregate, cross-goal/cross-habit reads that only exist to feed achievement evaluation — see services/achievements.ts. */

export async function countTotalEntries(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM logged_entries");
  return row?.count ?? 0;
}

export async function countTotalHabits(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM habits");
  return row?.count ?? 0;
}

export async function countCategoriesUsed(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(DISTINCT category_id) as count FROM habits WHERE category_id IS NOT NULL"
  );
  return row?.count ?? 0;
}

/** Every distinct date with at least one log, across every goal — ascending. Feeds the any-habit daily-streak family. */
export async function listDistinctLoggedDates(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ date: string }>("SELECT DISTINCT date FROM logged_entries ORDER BY date ASC");
  return rows.map((r) => r.date);
}

export async function listDistinctCurveTypesUsed(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ curve_type: string }>("SELECT DISTINCT curve_type FROM goals");
  return rows.map((r) => r.curve_type);
}

export async function listDistinctHabitTypesUsed(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ type: string }>("SELECT DISTINCT type FROM habits");
  return rows.map((r) => r.type);
}

export async function hasAdaptiveGoal(): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync("SELECT 1 FROM goals WHERE adaptive = 1 LIMIT 1");
  return row !== null;
}

export async function hasRelativeGoal(): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync("SELECT 1 FROM goals WHERE progression_mode = 'relative' LIMIT 1");
  return row !== null;
}

export async function hasAnySkip(): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync("SELECT 1 FROM skip_logs LIMIT 1");
  return row !== null;
}

export async function hasAnyFreeze(): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync("SELECT 1 FROM freeze_windows LIMIT 1");
  return row !== null;
}

/** Earliest habit creation timestamp (full ISO) across the whole account — null if none exist yet. */
export async function earliestHabitCreatedAt(): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ created_at: string | null }>("SELECT MIN(created_at) as created_at FROM habits");
  return row?.created_at ?? null;
}
