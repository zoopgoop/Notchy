import {
  getHabit,
  getGoal,
  listActiveGoals,
  listAllCelebrations,
  listAllEntries,
  listAllGoals,
  listAllHabits,
} from "../db/repositories";
import { today } from "../engine/dateUtils";
import { Celebration } from "../types";

export interface TrophyCaseItem {
  celebration: Celebration;
  habitName: string;
}

export interface TrophyCaseStats {
  logsThisMonth: number;
  goalsAchieved: number;
  habitsCreated: number;
  activeHabits: number;
}

export async function loadTrophyCaseStats(): Promise<TrophyCaseStats> {
  const [entries, goals, habits, activeGoals] = await Promise.all([
    listAllEntries(),
    listAllGoals(),
    listAllHabits(),
    listActiveGoals(),
  ]);
  const monthPrefix = today().slice(0, 7);
  return {
    logsThisMonth: entries.filter((e) => e.date.startsWith(monthPrefix)).length,
    goalsAchieved: goals.filter((g) => g.achievedAt).length,
    habitsCreated: habits.length,
    activeHabits: activeGoals.length,
  };
}

/**
 * Newest first — every notable celebration, joined with the habit it belongs to.
 * Excludes `daily_hit`: it fires on every routine hit, so showing it here would bury
 * the genuinely notable achievements under a flood of entries.
 */
export async function loadTrophyCaseItems(): Promise<TrophyCaseItem[]> {
  const celebrations = (await listAllCelebrations()).filter((c) => c.type !== "daily_hit");

  const goalIds = [...new Set(celebrations.map((c) => c.goalId))];
  const goals = await Promise.all(goalIds.map((id) => getGoal(id)));
  const goalsById = new Map(goals.filter((g) => g !== null).map((g) => [g.id, g]));

  const habitIds = [...new Set([...goalsById.values()].map((g) => g.habitId))];
  const habits = await Promise.all(habitIds.map((id) => getHabit(id)));
  const habitsById = new Map(habits.filter((h) => h !== null).map((h) => [h.id, h]));

  return celebrations
    .map((celebration) => {
      const goal = goalsById.get(celebration.goalId);
      const habit = goal ? habitsById.get(goal.habitId) : undefined;
      return habit ? { celebration, habitName: habit.name } : null;
    })
    .filter((item): item is TrophyCaseItem => item !== null);
}
