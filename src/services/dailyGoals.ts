import { requireDirection } from "../engine/curves";
import { addDays, daysBetween, getWeekday, today } from "../engine/dateUtils";
import { generateNextTarget } from "../engine/progression";
import { countScheduledDaysBetween, currentWeekStatus, nextScheduledReminder, scheduledDaysAsOf, weeklySkipLimitFor } from "../engine/schedule";
import {
  getCategory,
  getHabit,
  getStreak,
  listActiveGoals,
  listEntriesByGoal,
  listFreezeWindowsByGoal,
  listGoalSchedules,
  listSkipsByGoal,
} from "../db/repositories";
import { Category, Habit, Goal, Streak } from "../types";
import { DailyGoalStatus, getDailyStatus, getSkipsRemaining } from "./dailyStatus";
import { computeMomentum, Momentum } from "../utils/momentum";

/** A goal's full, pre-computed state for "today" — everything Home, notifications, and the background task need without re-deriving it themselves. */
export interface DailyGoalView {
  goal: Goal;
  habit: Habit;
  /** null when the habit has no category — render with the neutral fallback. */
  category: Category | null;
  status: DailyGoalStatus;
  momentum: Momentum;
  streak: Streak;
  skipsRemaining: number;
  skipLimit: number;
  /** Check-ins so far this week vs. the weekly quota — only meaningful when scheduled <7 days/week. */
  weeklyProgress: { earned: number; required: number };
  /** Days remaining until the goal's target date, if it has one (negative if past). */
  daysUntilTarget: number | null;
  /** Next reminder date (today or later), purely informational — scheduled days no longer gate the streak. */
  nextDue: string | null;
  /** True when today is that reminder date, or today is the last chance this week regardless of schedule. */
  dueToday: boolean;
  /**
   * Every remaining day this week (today included) is now needed to hit quota —
   * fires even for habits with no active streak, so new habits get the same urgency signal.
   */
  isUrgentToday: boolean;
  /** Behind the expected pace for this point in the week (logged < scheduled days elapsed), but can still recover. */
  isOverdue: boolean;
  /** Day-of-week (0–6) of the most recently missed scheduled day — used to pick the overdue notification time. Null when not overdue. */
  overdueNotificationDayOfWeek: number | null;
  /** Quota is now mathematically out of reach via normal logging alone — only meaningful with a streak at stake. */
  isCrisis: boolean;
  /** How many skips would need to be spent on already-missed days this week to make quota reachable again. */
  skipsNeededToSave: number;
  /** The generated target for the next check-in after today — null for boolean habits or habits not yet logged today. */
  nextTarget: number | null;
}

async function loadGoalMomentum(goal: Goal, habit: Habit): Promise<Momentum> {
  if (habit.type === "boolean") return "insufficient_data";
  const entries = await listEntriesByGoal(goal.id);
  return computeMomentum(requireDirection(habit), entries);
}

async function loadDailyGoalView(goal: Goal, date: string): Promise<DailyGoalView | null> {
  const habit = await getHabit(goal.habitId);
  if (!habit) return null;
  const category = habit.categoryId ? await getCategory(habit.categoryId) : null;
  const [status, momentum, streak, skipsRemaining, entries, skips, freezeWindows, schedules] = await Promise.all([
    getDailyStatus(goal, habit, date),
    loadGoalMomentum(goal, habit),
    getStreak(goal.id),
    getSkipsRemaining(goal.id, date),
    listEntriesByGoal(goal.id),
    listSkipsByGoal(goal.id),
    listFreezeWindowsByGoal(goal.id),
    listGoalSchedules(goal.id),
  ]);

  const weekStatus = currentWeekStatus(schedules, goal, entries, skips, freezeWindows, date);
  const weeklyProgress = { earned: weekStatus.credited, required: weekStatus.required };
  const daysUntilTarget = goal.targetDate ? daysBetween(date, goal.targetDate) : null;

  const hasStreakAtStake = streak.current > 0 && !weekStatus.exempt;
  const isUrgentToday =
    !weekStatus.exempt && weekStatus.stillNeeded > 0 && weekStatus.daysRemaining === weekStatus.stillNeeded;
  const isCrisis = hasStreakAtStake && weekStatus.stillNeeded > weekStatus.daysRemaining;
  const skipsNeededToSave = isCrisis ? weekStatus.stillNeeded - weekStatus.daysRemaining : 0;

  // How many scheduled days have elapsed so far this week (today inclusive if scheduled).
  const expectedByNow = countScheduledDaysBetween(schedules, addDays(weekStatus.weekStart, -1), date);
  const alreadyDone = status.kind === "logged" || status.kind === "skipped";
  const isOverdue = !alreadyDone && !weekStatus.exempt && !isCrisis && weekStatus.credited < expectedByNow;

  // Walk backwards from yesterday to find the most recently missed scheduled day — its configured
  // notification time is used for overdue daily reminders (so Mon+Wed missed → reminds at Wed's time).
  let overdueNotificationDayOfWeek: number | null = null;
  if (isOverdue) {
    const loggedOrSkipped = new Set([...entries.map((e) => e.date), ...skips.map((s) => s.date)]);
    let cursor = addDays(date, -1);
    while (cursor >= weekStatus.weekStart) {
      if (scheduledDaysAsOf(schedules, cursor).includes(getWeekday(cursor)) && !loggedOrSkipped.has(cursor)) {
        overdueNotificationDayOfWeek = getWeekday(cursor);
        break;
      }
      cursor = addDays(cursor, -1);
    }
  }

  const nextDue = (isUrgentToday || isOverdue) && !alreadyDone
    ? date
    : nextScheduledReminder(schedules, alreadyDone ? addDays(date, 1) : date);

  const nextTarget =
    habit.type !== "boolean" && alreadyDone
      ? generateNextTarget(goal, habit, schedules, entries, addDays(date, 1)).target
      : null;

  return {
    goal,
    habit,
    category,
    status,
    momentum,
    streak,
    skipsRemaining,
    skipLimit: weeklySkipLimitFor(scheduledDaysAsOf(schedules, date)),
    weeklyProgress,
    daysUntilTarget,
    nextDue,
    dueToday: !alreadyDone && (isUrgentToday || isOverdue || nextDue === date),
    isUrgentToday,
    isOverdue,
    overdueNotificationDayOfWeek,
    isCrisis,
    skipsNeededToSave,
    nextTarget,
  };
}

/**
 * Shared by the Home screen's hook and the background task — anything that needs
 * "every active goal's status for today" goes through here, whether or not a
 * component is mounted to ask for it.
 */
export async function loadDailyGoalViews(date: string = today()): Promise<DailyGoalView[]> {
  const goals = await listActiveGoals();
  const views = await Promise.all(goals.map((goal) => loadDailyGoalView(goal, date)));
  return views.filter((view): view is DailyGoalView => view !== null);
}
