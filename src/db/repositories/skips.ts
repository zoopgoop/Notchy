import { SkipLog } from "../../types";
import { getDb } from "../client";
import { addDays } from "../../engine/dateUtils";
import { generateId } from "../id";
import { rowToSkipLog, SkipLogRow } from "../mappers";

export async function createSkip(goalId: string, date: string): Promise<SkipLog> {
  const db = await getDb();
  const skip: SkipLog = { id: generateId(), goalId, date };
  await db.runAsync("INSERT INTO skip_logs (id, goal_id, date) VALUES (?, ?, ?)", [
    skip.id,
    skip.goalId,
    skip.date,
  ]);
  return skip;
}

/** Every skip, across every goal — backs data export. */
export async function listAllSkips(): Promise<SkipLog[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<SkipLogRow>("SELECT * FROM skip_logs ORDER BY date ASC");
  return rows.map(rowToSkipLog);
}

export async function listSkipsByGoal(goalId: string): Promise<SkipLog[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<SkipLogRow>(
    "SELECT * FROM skip_logs WHERE goal_id = ? ORDER BY date ASC",
    [goalId]
  );
  return rows.map(rowToSkipLog);
}

/** Across all goals — backs the calendar, which needs every skip in a date range regardless of goal. */
export async function listSkipsInRange(startDate: string, endDate: string): Promise<SkipLog[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<SkipLogRow>(
    "SELECT * FROM skip_logs WHERE date >= ? AND date <= ? ORDER BY date ASC",
    [startDate, endDate]
  );
  return rows.map(rowToSkipLog);
}

export async function getSkipForDate(goalId: string, date: string): Promise<SkipLog | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<SkipLogRow>(
    "SELECT * FROM skip_logs WHERE goal_id = ? AND date = ?",
    [goalId, date]
  );
  return row ? rowToSkipLog(row) : null;
}

/** Counts skips in the rolling N-day window ending on (and including) `asOfDate` — not a fixed calendar week. */
export async function countSkipsInRollingWindow(
  goalId: string,
  asOfDate: string,
  windowDays: number = 7
): Promise<number> {
  const db = await getDb();
  const windowStartIso = addDays(asOfDate, -(windowDays - 1));

  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM skip_logs WHERE goal_id = ? AND date >= ? AND date <= ?",
    [goalId, windowStartIso, asOfDate]
  );
  return row?.count ?? 0;
}

export async function deleteSkip(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM skip_logs WHERE id = ?", [id]);
}
