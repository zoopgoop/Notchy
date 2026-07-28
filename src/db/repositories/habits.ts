import { Habit } from "../../types";
import { getDb } from "../client";
import { generateId } from "../id";
import { HabitRow, rowToHabit } from "../mappers";

export async function createHabit(
  input: Omit<Habit, "id" | "createdAt" | "notificationsEnabled" | "notifyOffSchedule"> & {
    notificationsEnabled?: boolean;
    notifyOffSchedule?: boolean;
  }
): Promise<Habit> {
  const db = await getDb();
  const habit: Habit = {
    id: generateId(),
    createdAt: new Date().toISOString(),
    ...input,
    notificationsEnabled: input.notificationsEnabled ?? true,
    notifyOffSchedule: input.notifyOffSchedule ?? true,
  };
  await db.runAsync(
    "INSERT INTO habits (id, category_id, name, type, direction, unit_label, created_at, description, notifications_enabled, notify_off_schedule) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      habit.id,
      habit.categoryId ?? null,
      habit.name,
      habit.type,
      habit.direction ?? null,
      habit.unitLabel ?? null,
      habit.createdAt,
      habit.description ?? null,
      habit.notificationsEnabled ? 1 : 0,
      habit.notifyOffSchedule ? 1 : 0,
    ]
  );
  return habit;
}

export async function listHabitsByCategory(categoryId: string): Promise<Habit[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<HabitRow>(
    "SELECT * FROM habits WHERE category_id = ? ORDER BY name ASC",
    [categoryId]
  );
  return rows.map(rowToHabit);
}

/** Every habit regardless of category — backs data export. */
export async function listAllHabits(): Promise<Habit[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<HabitRow>("SELECT * FROM habits ORDER BY name ASC");
  return rows.map(rowToHabit);
}

export async function listHabitsWithoutCategory(): Promise<Habit[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<HabitRow>(
    "SELECT * FROM habits WHERE category_id IS NULL ORDER BY name ASC"
  );
  return rows.map(rowToHabit);
}

export async function getHabit(id: string): Promise<Habit | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<HabitRow>("SELECT * FROM habits WHERE id = ?", [id]);
  return row ? rowToHabit(row) : null;
}

export async function updateHabit(
  id: string,
  updates: Partial<Pick<Habit, "name" | "direction" | "unitLabel" | "type">>
): Promise<void> {
  const db = await getDb();
  if (updates.name !== undefined) {
    await db.runAsync("UPDATE habits SET name = ? WHERE id = ?", [updates.name, id]);
  }
  if (updates.direction !== undefined) {
    await db.runAsync("UPDATE habits SET direction = ? WHERE id = ?", [updates.direction, id]);
  }
  if (updates.unitLabel !== undefined) {
    await db.runAsync("UPDATE habits SET unit_label = ? WHERE id = ?", [updates.unitLabel, id]);
  }
  if (updates.type !== undefined) {
    await db.runAsync("UPDATE habits SET type = ? WHERE id = ?", [updates.type, id]);
  }
}

/** Separate from updateHabit since an empty description (clearing it) is a meaningful value, not "leave as-is". */
export async function setHabitDescription(id: string, description: string | undefined): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE habits SET description = ? WHERE id = ?", [description ?? null, id]);
}

/** Separate from updateHabit since `undefined` here is a meaningful value (uncategorize), not "leave as-is". */
export async function setHabitCategory(id: string, categoryId: string | undefined): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE habits SET category_id = ? WHERE id = ?", [categoryId ?? null, id]);
}

/** Master on/off switch for this habit's notifications — see the notifications_enabled column comment in schema.ts. */
export async function setHabitNotificationsEnabled(id: string, enabled: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE habits SET notifications_enabled = ? WHERE id = ?", [enabled ? 1 : 0, id]);
}

/** When false, overdue/catch-up notifications are suppressed on days outside the scheduled day list. */
export async function setHabitNotifyOffSchedule(id: string, enabled: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE habits SET notify_off_schedule = ? WHERE id = ?", [enabled ? 1 : 0, id]);
}

export async function deleteHabit(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM habits WHERE id = ?", [id]);
}
