import { FreezeWindow } from "../../types";
import { getDb } from "../client";
import { generateId } from "../id";
import { FreezeWindowRow, rowToFreezeWindow } from "../mappers";

export async function createFreezeWindow(
  goalId: string,
  startDate: string,
  endDate: string
): Promise<FreezeWindow> {
  const db = await getDb();
  const freeze: FreezeWindow = { id: generateId(), goalId, startDate, endDate };
  await db.runAsync(
    "INSERT INTO freeze_windows (id, goal_id, start_date, end_date) VALUES (?, ?, ?, ?)",
    [freeze.id, freeze.goalId, freeze.startDate, freeze.endDate]
  );
  return freeze;
}

/** Every freeze window, across every goal — backs data export. */
export async function listAllFreezeWindows(): Promise<FreezeWindow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<FreezeWindowRow>("SELECT * FROM freeze_windows ORDER BY start_date ASC");
  return rows.map(rowToFreezeWindow);
}

export async function listFreezeWindowsByGoal(goalId: string): Promise<FreezeWindow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<FreezeWindowRow>(
    "SELECT * FROM freeze_windows WHERE goal_id = ? ORDER BY start_date ASC",
    [goalId]
  );
  return rows.map(rowToFreezeWindow);
}

export async function isDateFrozen(goalId: string, date: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM freeze_windows WHERE goal_id = ? AND start_date <= ? AND end_date >= ? LIMIT 1",
    [goalId, date, date]
  );
  return !!row;
}

export async function deleteFreezeWindow(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM freeze_windows WHERE id = ?", [id]);
}
