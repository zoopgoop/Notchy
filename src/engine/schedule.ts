import { FreezeWindow, Goal, GoalSchedule, LoggedEntry, SkipLog } from "../types";
import { addDays, daysSinceMonday, getWeekday, localDateOf } from "./dateUtils";

/** `schedules` must be ascending by `effectiveDate` (as returned by `listGoalSchedules`). */
export function scheduledDaysAsOf(schedules: GoalSchedule[], date: string): number[] {
  let result = schedules[0]?.scheduledDays ?? [0, 1, 2, 3, 4, 5, 6];
  for (const schedule of schedules) {
    if (schedule.effectiveDate <= date) {
      result = schedule.scheduledDays;
    } else {
      break;
    }
  }
  return result;
}

/** Skip allowance scales with how many days/week are scheduled — fewer required days, fewer skips. */
export function weeklySkipLimitFor(scheduledDays: number[]): number {
  const n = scheduledDays.length;
  if (n >= 7) return 3;
  if (n >= 4) return 2;
  return 1;
}

/** The Monday on or before `date` — the convention every weekly-quota calculation in this file anchors to. */
export function weekStartOf(date: string): string {
  return addDays(date, -daysSinceMonday(date));
}

/**
 * Same resolution as scheduledDaysAsOf, but pinned to the start of the week containing
 * `date` instead of `date` itself — so a schedule edit made mid-week doesn't affect
 * anything for the rest of that week, matching tallyWeek's own quota calculation. Used
 * for reminders specifically so a same-day edit can't be used to dodge either one; a goal's
 * date-driven curve pacing (countScheduledDaysBetween) intentionally does NOT go through
 * this — that's about progression math, not the weekly quota/reminder cycle.
 */
function scheduledDaysForWeekOf(schedules: GoalSchedule[], date: string): number[] {
  return scheduledDaysAsOf(schedules, weekStartOf(date));
}

export interface WeekTally {
  weekStart: string;
  /** How many check-ins are required this week — the count of scheduled days, not which specific ones. */
  required: number;
  /** Distinct days this week with a log or a skip. */
  credited: number;
  /** A freeze window touched this week — no quota applies at all. */
  exempt: boolean;
}

/**
 * Scheduled days are reminder triggers only now, not per-day deadlines — what
 * actually matters is hitting the weekly count somewhere, on any days.
 */
export function tallyWeek(
  schedules: GoalSchedule[],
  goal: Pick<Goal, "targetDate" | "createdAt" | "restartedAt">,
  entries: LoggedEntry[],
  skips: SkipLog[],
  freezeWindows: FreezeWindow[],
  weekStart: string
): WeekTally {
  const weekEnd = addDays(weekStart, 6);
  const loggedDates = new Set(entries.map((e) => e.date));
  const skipDates = new Set(skips.map((s) => s.date));

  let exempt = false;
  let credited = 0;
  let cursor = weekStart;
  while (cursor <= weekEnd) {
    if (freezeWindows.some((f) => f.startDate <= cursor && f.endDate >= cursor)) {
      exempt = true;
    }
    if (loggedDates.has(cursor) || skipDates.has(cursor)) {
      credited += 1;
    }
    cursor = addDays(cursor, 1);
  }

  // Trim the required window symmetrically: start no earlier than createdAt (first week) or
  // a restart date (see restartGoalWeek), end no later than targetDate (final week). Counts
  // only scheduled days in that window.
  const createdAt = localDateOf(goal.createdAt);
  let effectiveStart = createdAt > weekStart ? createdAt : weekStart;
  if (goal.restartedAt && goal.restartedAt > effectiveStart) effectiveStart = goal.restartedAt;
  const effectiveEnd = goal.targetDate && goal.targetDate < weekEnd ? goal.targetDate : weekEnd;
  const scheduledDays = scheduledDaysAsOf(schedules, weekStart);
  let required = 0;
  let day = effectiveStart;
  while (day <= effectiveEnd) {
    if (scheduledDays.includes(getWeekday(day))) required++;
    day = addDays(day, 1);
  }

  return { weekStart, required, credited, exempt };
}

export interface ScheduleDayResult {
  date: string;
  logged: boolean;
  /** True only on a week's last day, when that week ended short of its quota (and wasn't exempt). */
  weekFailed: boolean;
}

/**
 * Walks [fromDate, toDate] day by day. `logged` drives the streak's day count
 * directly; `weekFailed` fires once per week, on its final day, when that week's
 * quota wasn't met — that's the only thing that resets the streak now. There's no
 * more per-day "missed checkpoint" — a specific scheduled day going unlogged
 * doesn't matter as long as the week's total comes in.
 */
export function walkWeeklySchedule(
  schedules: GoalSchedule[],
  goal: Pick<Goal, "targetDate" | "createdAt" | "restartedAt">,
  entries: LoggedEntry[],
  skips: SkipLog[],
  freezeWindows: FreezeWindow[],
  fromDate: string,
  toDate: string
): ScheduleDayResult[] {
  const entryByDate = new Set(entries.map((e) => e.date));

  const results: ScheduleDayResult[] = [];
  let cursor = fromDate;

  while (cursor <= toDate) {
    const logged = entryByDate.has(cursor);
    let weekFailed = false;

    if (getWeekday(cursor) === 0) {
      // Sunday — the last day of a Monday-start week.
      const tally = tallyWeek(schedules, goal, entries, skips, freezeWindows, addDays(cursor, -6));
      weekFailed = !tally.exempt && tally.credited < tally.required;
    }

    results.push({ date: cursor, logged, weekFailed });
    cursor = addDays(cursor, 1);
  }

  return results;
}

export interface WeekStatus {
  weekStart: string;
  required: number;
  credited: number;
  stillNeeded: number;
  /** Days left in the week, today included. */
  daysRemaining: number;
  exempt: boolean;
}

/** The live, in-progress state of the current week — feeds urgency/crisis detection and the weekly-progress tile. */
export function currentWeekStatus(
  schedules: GoalSchedule[],
  goal: Pick<Goal, "targetDate" | "createdAt" | "restartedAt">,
  entries: LoggedEntry[],
  skips: SkipLog[],
  freezeWindows: FreezeWindow[],
  today: string
): WeekStatus {
  const weekStart = weekStartOf(today);
  const tally = tallyWeek(schedules, goal, entries, skips, freezeWindows, weekStart);
  return {
    weekStart,
    required: tally.required,
    credited: tally.credited,
    stillNeeded: Math.max(0, tally.required - tally.credited),
    daysRemaining: 7 - daysSinceMonday(today),
    exempt: tally.exempt,
  };
}

/** The next scheduled reminder day on or after `fromDate`, looking up to 14 days ahead. */
export function nextScheduledReminder(schedules: GoalSchedule[], fromDate: string): string | null {
  const horizon = addDays(fromDate, 13);
  let cursor = fromDate;
  while (cursor <= horizon) {
    if (scheduledDaysForWeekOf(schedules, cursor).includes(getWeekday(cursor))) return cursor;
    cursor = addDays(cursor, 1);
  }
  return null;
}

/** Counts scheduled-day occurrences in (fromIso, toIso] — feeds date-driven curve pacing (unrelated to the weekly quota). */
export function countScheduledDaysBetween(schedules: GoalSchedule[], fromIso: string, toIso: string): number {
  let count = 0;
  let cursor = addDays(fromIso, 1);
  while (cursor <= toIso) {
    if (scheduledDaysAsOf(schedules, cursor).includes(getWeekday(cursor))) {
      count += 1;
    }
    cursor = addDays(cursor, 1);
  }
  return count;
}
