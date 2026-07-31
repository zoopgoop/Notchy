import { localDateOf, today } from "../engine/dateUtils";
import { walkWeeklySchedule } from "../engine/schedule";
import { Goal, Streak } from "../types";
import {
  getStreak,
  listEntriesByGoal,
  listFreezeWindowsByGoal,
  listGoalSchedules,
  listSkipsByGoal,
  upsertStreak,
} from "../db/repositories";

/**
 * Replays the goal's full history day by day through the weekly quota system
 * (see engine/schedule.ts): every log extends the streak — the streak rewards
 * showing up, not hitting the exact daily number, and scheduled days are just
 * reminder triggers now, not per-day deadlines. A week that ends short of its
 * quota resets the streak; the current week is judged early only via the
 * crisis path (see HomeScreen's forfeitCurrentStreak call) — this replay on
 * its own only fails a week once it's actually over.
 */
export async function recomputeStreak(goal: Goal, asOfDate: string = today()): Promise<Streak> {
  const [entries, skips, freezeWindows, schedules] = await Promise.all([
    listEntriesByGoal(goal.id),
    listSkipsByGoal(goal.id),
    listFreezeWindowsByGoal(goal.id),
    listGoalSchedules(goal.id),
  ]);

  const fromDate = localDateOf(goal.createdAt);
  const days = walkWeeklySchedule(schedules, goal, entries, skips, freezeWindows, fromDate, asOfDate);

  let current = 0;
  let longest = 0;
  for (const day of days) {
    if (day.logged) {
      current += 1;
      longest = Math.max(longest, current);
    }
    if (day.weekFailed && day.date < asOfDate) {
      current = 0;
    }
  }

  const streak: Streak = { goalId: goal.id, current, longest };
  await upsertStreak(streak);
  return streak;
}

/**
 * Deactivating a habit forfeits its current streak immediately — unlike freeze
 * windows and skips, which are the only sanctioned ways to protect one. Longest
 * is left untouched since it's a historical record, not something deactivating
 * should erase.
 */
export async function forfeitCurrentStreak(goalId: string): Promise<void> {
  const streak = await getStreak(goalId);
  await upsertStreak({ ...streak, current: 0 });
}
