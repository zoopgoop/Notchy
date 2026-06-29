import { getDb } from "../client";
import { GoalNotificationTimeRow, rowToGoalNotificationTime } from "../mappers";
import { GoalNotificationTime } from "../../types";

export async function listGoalNotificationTimes(goalId: string): Promise<GoalNotificationTime[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<GoalNotificationTimeRow>(
    "SELECT * FROM goal_notification_times WHERE goal_id = ?",
    [goalId]
  );
  return rows.map(rowToGoalNotificationTime);
}

/** Replaces every row for this goal — always called with the full set, never a partial patch. */
export async function setGoalNotificationTimes(goalId: string, times: GoalNotificationTime[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM goal_notification_times WHERE goal_id = ?", [goalId]);
    for (const time of times) {
      await db.runAsync(
        "INSERT INTO goal_notification_times (goal_id, day_of_week, hour, minute) VALUES (?, ?, ?, ?)",
        [goalId, time.dayOfWeek, time.hour, time.minute]
      );
    }
  });
}
