import { Celebration, CelebrationType } from "../../types";
import { getDb } from "../client";
import { generateId } from "../id";
import { CelebrationRow, rowToCelebration } from "../mappers";

export async function createCelebration(input: {
  goalId: string;
  type: CelebrationType;
  date: string;
  metadata?: Record<string, number | string>;
}): Promise<Celebration> {
  const db = await getDb();
  const celebration: Celebration = { id: generateId(), ...input };
  await db.runAsync(
    "INSERT INTO celebrations (id, goal_id, type, date, metadata) VALUES (?, ?, ?, ?, ?)",
    [
      celebration.id,
      celebration.goalId,
      celebration.type,
      celebration.date,
      celebration.metadata ? JSON.stringify(celebration.metadata) : null,
    ]
  );
  return celebration;
}

/** All celebrations, newest first — backs the trophy case screen. */
export async function listAllCelebrations(): Promise<Celebration[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CelebrationRow>("SELECT * FROM celebrations ORDER BY date DESC");
  return rows.map(rowToCelebration);
}

export async function listCelebrationsByGoal(goalId: string): Promise<Celebration[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CelebrationRow>(
    "SELECT * FROM celebrations WHERE goal_id = ? ORDER BY date DESC",
    [goalId]
  );
  return rows.map(rowToCelebration);
}

/** All goal_achieved celebrations across every goal ever created for a habit, oldest first. */
export async function listGoalAchievementsByHabit(habitId: string): Promise<Celebration[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CelebrationRow>(
    `SELECT c.* FROM celebrations c
     JOIN goals g ON c.goal_id = g.id
     WHERE g.habit_id = ? AND c.type = 'goal_achieved'
     ORDER BY c.date ASC`,
    [habitId]
  );
  return rows.map(rowToCelebration);
}
