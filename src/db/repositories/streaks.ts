import { Streak } from "../../types";
import { getDb } from "../client";
import { rowToStreak, StreakRow } from "../mappers";

export async function getStreak(goalId: string): Promise<Streak> {
  const db = await getDb();
  const row = await db.getFirstAsync<StreakRow>("SELECT * FROM streaks WHERE goal_id = ?", [goalId]);
  return row ? rowToStreak(row) : { goalId, current: 0, longest: 0 };
}

export async function upsertStreak(streak: Streak): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO streaks (goal_id, current, longest) VALUES (?, ?, ?)
     ON CONFLICT(goal_id) DO UPDATE SET current = excluded.current, longest = excluded.longest`,
    [streak.goalId, streak.current, streak.longest]
  );
}
