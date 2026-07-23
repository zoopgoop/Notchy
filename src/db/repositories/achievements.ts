import { Achievement } from "../../types";
import { getDb } from "../client";
import { AchievementRow, rowToAchievement } from "../mappers";

export async function listEarnedAchievements(): Promise<Achievement[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<AchievementRow>("SELECT * FROM achievements");
  return rows.map(rowToAchievement);
}

/** Idempotent — re-earning an already-recorded key is a no-op, never overwrites the original date. */
export async function recordAchievement(key: string, earnedAt: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("INSERT OR IGNORE INTO achievements (key, earned_at) VALUES (?, ?)", [key, earnedAt]);
}
