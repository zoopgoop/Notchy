import { addDays } from "../engine/dateUtils";
import { computeHit, generateNextTarget, TargetReason } from "../engine/progression";
import { scheduledDaysAsOf, weeklySkipLimitFor, weekStartOf } from "../engine/schedule";
import { Celebration, Goal, Habit, LoggedEntry } from "../types";
import {
  countSkipsInRollingWindow,
  createEntry,
  createSkip,
  getEntryForDate,
  getSkipForDate,
  isDateFrozen,
  listEntriesByGoal,
  listGoalSchedules,
  listSkipsByGoal,
  setGoalOnIce,
} from "../db/repositories";
import { detectAndRecordCelebrations } from "./celebrations";
import { recomputeStreak } from "./streaks";

export type DailyGoalStatus =
  | { kind: "frozen" }
  | { kind: "logged"; entry: LoggedEntry }
  | { kind: "skipped" }
  | { kind: "pending"; target: number; reason: TargetReason };

/**
 * The orchestration the spec calls for but doesn't name: before asking the progression
 * engine for a target, a goal might already be frozen, already logged, or already
 * skipped for today — each of those short-circuits target generation entirely.
 */
export async function getDailyStatus(goal: Goal, habit: Habit, date: string): Promise<DailyGoalStatus> {
  if (await isDateFrozen(goal.id, date)) {
    return { kind: "frozen" };
  }

  const entry = await getEntryForDate(goal.id, date);
  if (entry) {
    return { kind: "logged", entry };
  }

  const skip = await getSkipForDate(goal.id, date);
  if (skip) {
    return { kind: "skipped" };
  }

  const [entries, schedules] = await Promise.all([listEntriesByGoal(goal.id), listGoalSchedules(goal.id)]);
  const { target, reason } = generateNextTarget(goal, habit, schedules, entries, date);
  return { kind: "pending", target, reason };
}

export type SkipResult = { ok: true } | { ok: false; reason: string };

/** Skips ration on a rolling fortnight, not a calendar week — smooths out clustering right at a week boundary. */
const SKIP_WINDOW_DAYS = 14;

export async function getSkipsRemaining(goalId: string, date: string): Promise<number> {
  const [used, schedules] = await Promise.all([
    countSkipsInRollingWindow(goalId, date, SKIP_WINDOW_DAYS),
    listGoalSchedules(goalId),
  ]);
  const limit = weeklySkipLimitFor(scheduledDaysAsOf(schedules, date));
  return Math.max(0, limit - used);
}

/** No-explanation-needed skip, rationed by an allowance that scales with schedule size. */
export async function skipGoalToday(goal: Goal, date: string): Promise<SkipResult> {
  const [used, schedules] = await Promise.all([
    countSkipsInRollingWindow(goal.id, date, SKIP_WINDOW_DAYS),
    listGoalSchedules(goal.id),
  ]);
  const limit = weeklySkipLimitFor(scheduledDaysAsOf(schedules, date));
  if (used >= limit) {
    return { ok: false, reason: "Skip limit reached for this fortnight" };
  }
  await createSkip(goal.id, date);
  return { ok: true };
}

/**
 * Backfills `count` of this week's already-missed days as skips, then recomputes
 * the streak — used to climb back out of a weekly-quota crisis before it's too
 * late to matter. Only days strictly before `date` are eligible, since today
 * isn't missed yet. Walks backwards from the most recent unaccounted day toward
 * the start of the week, so the days closest to today get covered first.
 */
export async function spendSkipsToSaveStreak(goal: Goal, date: string, count: number): Promise<void> {
  const [entries, skips] = await Promise.all([listEntriesByGoal(goal.id), listSkipsByGoal(goal.id)]);
  const loggedDates = new Set(entries.map((e) => e.date));
  const skipDates = new Set(skips.map((s) => s.date));

  const candidates: string[] = [];
  const weekStart = weekStartOf(date);
  let cursor = addDays(date, -1);
  while (cursor >= weekStart && candidates.length < count) {
    if (!loggedDates.has(cursor) && !skipDates.has(cursor)) {
      candidates.push(cursor);
    }
    cursor = addDays(cursor, -1);
  }

  for (const day of candidates) {
    await createSkip(goal.id, day);
  }

  await recomputeStreak(goal, date);
}

export interface LogGoalEntryInput {
  goal: Goal;
  habit: Habit;
  date: string;
  actualValue?: number;
  generatedTarget: number;
  tagIds: string[];
}

export interface LogGoalEntryResult {
  entry: LoggedEntry;
  celebrations: Celebration[];
}

/**
 * The single place "logging a goal" happens: writes the entry (or updates today's,
 * if logging again), recomputes the streak, and runs every celebration rule against
 * the fresh state — so no call site can log an entry while forgetting one of those steps.
 */
export async function logGoalEntry(input: LogGoalEntryInput): Promise<LogGoalEntryResult> {
  if (input.actualValue === undefined) {
    throw new Error("logGoalEntry requires an actualValue");
  }

  const hit = computeHit(input.habit, input.actualValue, input.generatedTarget);
  const entry = await createEntry({
    goalId: input.goal.id,
    date: input.date,
    actualValue: input.actualValue,
    hit,
    generatedTarget: input.generatedTarget,
    tagIds: input.tagIds,
  });

  const streak = await recomputeStreak(input.goal, input.date);
  const celebrations = await detectAndRecordCelebrations(input.goal, input.habit, entry, streak);

  // Logging is one of the two ways to wake a goal back up off ice.
  if (input.goal.onIce) {
    await setGoalOnIce(input.goal.id, false);
  }

  return { entry, celebrations };
}
