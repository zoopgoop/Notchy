import { getDb } from "../client";
import { generateId } from "../id";
import { GoalScheduleRow, rowToGoalSchedule } from "../mappers";
import { GoalSchedule } from "../../types";

export async function createGoalSchedule(
  goalId: string,
  effectiveDate: string,
  scheduledDays: number[]
): Promise<GoalSchedule> {
  const db = await getDb();
  const schedule: GoalSchedule = { id: generateId(), goalId, effectiveDate, scheduledDays };
  await db.runAsync(
    "INSERT INTO goal_schedules (id, goal_id, effective_date, scheduled_days) VALUES (?, ?, ?, ?)",
    [schedule.id, schedule.goalId, schedule.effectiveDate, scheduledDays.join(",")]
  );
  return schedule;
}

/** Ascending by effective_date — the order the schedule-replay engine expects. */
export async function listGoalSchedules(goalId: string): Promise<GoalSchedule[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<GoalScheduleRow>(
    "SELECT * FROM goal_schedules WHERE goal_id = ? ORDER BY effective_date ASC",
    [goalId]
  );
  return rows.map(rowToGoalSchedule);
}

/** Every schedule history row across every goal — backs data export. */
export async function listAllGoalSchedules(): Promise<GoalSchedule[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<GoalScheduleRow>(
    "SELECT * FROM goal_schedules ORDER BY goal_id, effective_date ASC"
  );
  return rows.map(rowToGoalSchedule);
}
