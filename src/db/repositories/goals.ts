import { Goal } from "../../types";
import { getDb } from "../client";
import { generateId } from "../id";
import { GoalRow, rowToGoal } from "../mappers";

export async function createGoal(input: Omit<Goal, "id" | "createdAt" | "onIce">): Promise<Goal> {
  const db = await getDb();
  const goal: Goal = {
    ...input,
    onIce: false,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
  await db.runAsync(
    `INSERT INTO goals (
      id, habit_id, start_value, target_value, target_date, curve_type, adaptive,
      progression_mode, step, achieved_at, created_at, active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      goal.id,
      goal.habitId,
      goal.startValue,
      goal.targetValue ?? null,
      goal.targetDate ?? null,
      goal.curveType,
      goal.adaptive ? 1 : 0,
      goal.progressionMode,
      goal.step,
      goal.achievedAt ?? null,
      goal.createdAt,
      goal.active ? 1 : 0,
    ]
  );
  return goal;
}

/** Includes inactive/achieved goals — the calendar needs to color historical entries too. */
export async function listAllGoals(): Promise<Goal[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<GoalRow>("SELECT * FROM goals ORDER BY created_at ASC");
  return rows.map(rowToGoal);
}

/** Excludes achieved goals too — once a target's been hit there's nothing left to ask for daily. */
export async function listActiveGoals(): Promise<Goal[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<GoalRow>(
    "SELECT * FROM goals WHERE active = 1 AND achieved_at IS NULL ORDER BY created_at ASC"
  );
  return rows.map(rowToGoal);
}

/**
 * The goal a habit is currently tracked by — its most recently created one. A habit
 * has at most one goal "in flight" at a time; once achieved, the habit either
 * continues that same goal in place (edit-and-keep-going) or gets a fresh one.
 */
export async function getCurrentGoalForHabit(habitId: string): Promise<Goal | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<GoalRow>(
    "SELECT * FROM goals WHERE habit_id = ? ORDER BY created_at DESC LIMIT 1",
    [habitId]
  );
  return row ? rowToGoal(row) : null;
}

/** Backs the Home screen's "Completed Goals" section. */
export async function listAchievedGoals(): Promise<Goal[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<GoalRow>(
    "SELECT * FROM goals WHERE achieved_at IS NOT NULL ORDER BY achieved_at DESC"
  );
  return rows.map(rowToGoal);
}

export async function getGoal(id: string): Promise<Goal | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<GoalRow>("SELECT * FROM goals WHERE id = ?", [id]);
  return row ? rowToGoal(row) : null;
}

export async function markGoalAchieved(id: string, achievedAt: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE goals SET achieved_at = ? WHERE id = ?", [achievedAt, id]);
}

/** Used by "Edit & Keep Going" — the habit re-enters the active list with its streak intact. */
export async function clearGoalAchievement(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE goals SET achieved_at = NULL WHERE id = ?", [id]);
}

/** Used when editing a goal into open-ended (goalless) mode — `updateGoal` can't clear a column, only set it. */
export async function clearGoalTarget(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE goals SET target_value = NULL WHERE id = ?", [id]);
}

export async function setGoalActive(id: string, active: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE goals SET active = ? WHERE id = ?", [active ? 1 : 0, id]);
}

export async function setGoalOnIce(id: string, onIce: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE goals SET on_ice = ? WHERE id = ?", [onIce ? 1 : 0, id]);
}

export async function setGoalAdaptive(id: string, adaptive: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE goals SET adaptive = ? WHERE id = ?", [adaptive ? 1 : 0, id]);
}

/**
 * "Start Again" / "Adjust Habit" on the lost-streak/quota-gone prompt — makes this week
 * behave like the goal just started (see tallyWeek's effectiveStart), instead of staying
 * mathematically lost for the rest of the week. Also wakes the goal off ice, same as updateGoal.
 */
export async function restartGoalWeek(id: string, date: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE goals SET restarted_at = ?, on_ice = 0 WHERE id = ?", [date, id]);
}

/**
 * Used by the post-achievement "adjust this goal" flow and the missed-deadline
 * "extend" flow — the only two places a goal's core settings can change once
 * created, both of which keep the same id (and therefore the same streak history).
 */
export async function updateGoal(
  id: string,
  updates: Partial<
    Pick<Goal, "startValue" | "targetValue" | "targetDate" | "curveType" | "progressionMode" | "step" | "adaptive" | "achievedAt" | "active">
  >
): Promise<void> {
  const db = await getDb();
  const columns: Record<string, string> = {
    startValue: "start_value",
    targetValue: "target_value",
    targetDate: "target_date",
    curveType: "curve_type",
    progressionMode: "progression_mode",
    step: "step",
    adaptive: "adaptive",
    achievedAt: "achieved_at",
    active: "active",
  };
  for (const [key, column] of Object.entries(columns)) {
    const value = (updates as Record<string, unknown>)[key];
    if (value === undefined) continue;
    const dbValue = typeof value === "boolean" ? (value ? 1 : 0) : value;
    await db.runAsync(`UPDATE goals SET ${column} = ? WHERE id = ?`, [dbValue as string | number, id]);
  }

  // Adjusting a goal is one of the two ways to wake a goal back up off ice.
  await db.runAsync("UPDATE goals SET on_ice = 0 WHERE id = ?", [id]);
}
