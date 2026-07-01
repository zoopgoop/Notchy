import { Direction, Goal, GoalSchedule, Habit, LoggedEntry } from "../types";
import { countScheduledDaysBetween } from "./schedule";
import { today } from "./dateUtils";
import {
  adaptiveMultiplier,
  CONSECUTIVE_MISSES_FOR_DELOAD,
  decayingStepTarget,
  deloadTarget,
  exponentialTarget,
  incrementalTarget,
  isHit,
  linearTarget,
  percentageTarget,
  requireDirection,
} from "./curves";

export type TargetReason = "boolean" | "initial" | "advance" | "hold" | "deload";

export interface GeneratedTarget {
  target: number;
  reason: TargetReason;
}

/**
 * Computes the next target for a goal from a given anchor (the value/date progression
 * should be measured from — either the goal's original start, or the most recent hit).
 * Date-driven curves (linear/incremental/exponential) only use their formula when a
 * targetDate exists — which also implies a targetValue (date pacing always has a goal,
 * per the spec). Otherwise every curveType falls back to the open-ended step/rate
 * recurrence, which needs no targetValue at all (goalless habits run on this forever).
 */
function computeBaseTarget(
  goal: Goal,
  schedules: GoalSchedule[],
  direction: Direction,
  anchorValue: number,
  anchorDate: string,
  today: string,
  entries: LoggedEntry[]
): number {
  const multiplier = goal.adaptive ? adaptiveMultiplier(entries.map((e) => e.hit)) : 1;

  if (goal.curveType !== "percentage" && goal.targetDate && goal.targetValue !== undefined) {
    const totalPeriods = countScheduledDaysBetween(schedules, anchorDate, goal.targetDate);
    const periodsElapsed = countScheduledDaysBetween(schedules, anchorDate, today) * multiplier;
    if (goal.curveType === "linear") {
      return linearTarget(anchorValue, goal.targetValue, periodsElapsed, totalPeriods);
    }
    if (goal.curveType === "exponential") {
      return exponentialTarget(anchorValue, goal.targetValue, periodsElapsed, totalPeriods);
    }
    return incrementalTarget(anchorValue, goal.targetValue, periodsElapsed, totalPeriods);
  }

  if (goal.curveType === "percentage" || goal.progressionMode === "relative") {
    return percentageTarget(anchorValue, goal.step * multiplier, direction);
  }

  return decayingStepTarget(anchorValue, goal.step * multiplier, entries.length, direction);
}

/**
 * Numeric habits are whole-number-only by design (reps, sessions, etc. don't have
 * fractional units) — rounding here, the one chokepoint every generated target passes
 * through, is simpler than rounding at each of the call sites below. Goalless habits
 * have no targetValue to clamp toward, so progress is unbounded.
 */
function clampTowardTarget(value: number, goal: Goal, direction: Direction): number {
  if (goal.targetValue === undefined) return Math.round(value);
  const clamped = direction === "increasing" ? Math.min(value, goal.targetValue) : Math.max(value, goal.targetValue);
  return Math.round(clamped);
}

function countTrailingMisses(entries: LoggedEntry[]): number {
  let count = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].hit) break;
    count++;
  }
  return count;
}

/**
 * Orchestrates the full progression engine: picks the curve, applies the adaptive
 * multiplier, then layers the performance-based escalation rules (re-anchor on hit,
 * hold on miss, deload on 3 consecutive misses) on top. `entries` must be the goal's
 * prior LoggedEntrys in ascending date order, not including `today`. `schedules` must
 * be ascending by effectiveDate, as returned by `listGoalSchedules`.
 */
export function generateNextTarget(
  goal: Goal,
  habit: Habit,
  schedules: GoalSchedule[],
  entries: LoggedEntry[],
  today: string
): GeneratedTarget {
  if (habit.type === "boolean") {
    return { target: 1, reason: "boolean" };
  }

  const direction = requireDirection(habit);
  const lastEntry = entries[entries.length - 1];

  if (!lastEntry) {
    const target = computeBaseTarget(goal, schedules, direction, goal.startValue, goal.createdAt, today, entries);
    return { target: clampTowardTarget(target, goal, direction), reason: "initial" };
  }

  if (lastEntry.hit) {
    const anchorValue = lastEntry.actualValue ?? lastEntry.generatedTarget;
    const target = computeBaseTarget(goal, schedules, direction, anchorValue, lastEntry.date, today, entries);
    return { target: clampTowardTarget(target, goal, direction), reason: "advance" };
  }

  const trailingMisses = countTrailingMisses(entries);
  if (trailingMisses >= CONSECUTIVE_MISSES_FOR_DELOAD) {
    const target = deloadTarget(lastEntry.generatedTarget, goal.startValue);
    return { target: clampTowardTarget(target, goal, direction), reason: "deload" };
  }

  return { target: lastEntry.generatedTarget, reason: "hold" };
}

const PROJECTED_SAMPLE_COUNT = 24;

/**
 * Returns projected targets for future sessions, starting from the current anchor
 * (last hit entry or goal start). For date-driven goals the curve formula is evaluated
 * at evenly-spaced intervals from now to targetDate. For open-ended goals a fixed number
 * of sessions are simulated forward, assuming hits (optimistic path).
 * Returns [] for boolean habits or when there are no remaining sessions.
 */
export function projectFutureTargets(
  goal: Goal,
  habit: Habit,
  schedules: GoalSchedule[],
  entries: LoggedEntry[]
): number[] {
  if (habit.type === "boolean") return [];

  const direction = requireDirection(habit);
  const multiplier = goal.adaptive ? adaptiveMultiplier(entries.map((e) => e.hit)) : 1;

  if (goal.targetDate && goal.targetValue !== undefined && goal.curveType !== "percentage") {
    const lastHit = [...entries].reverse().find((e) => e.hit);
    const anchorValue = lastHit ? (lastHit.actualValue ?? lastHit.generatedTarget) : goal.startValue;
    const anchorDate = lastHit?.date ?? goal.createdAt;
    const totalFromAnchor = countScheduledDaysBetween(schedules, anchorDate, goal.targetDate);
    const elapsedFromAnchor = countScheduledDaysBetween(schedules, anchorDate, today());
    const remaining = Math.max(totalFromAnchor - elapsedFromAnchor, 0);

    if (remaining === 0) return [];

    const count = Math.min(remaining, PROJECTED_SAMPLE_COUNT);
    const results: number[] = [];

    for (let i = 1; i <= count; i++) {
      const periodsElapsed = (elapsedFromAnchor + (remaining * i) / count) * multiplier;
      const totalPeriods = totalFromAnchor * multiplier;
      let raw: number;
      if (goal.curveType === "linear") {
        raw = linearTarget(anchorValue, goal.targetValue, periodsElapsed, totalPeriods);
      } else if (goal.curveType === "exponential") {
        raw = exponentialTarget(anchorValue, goal.targetValue, periodsElapsed, totalPeriods);
      } else {
        raw = incrementalTarget(anchorValue, goal.targetValue, periodsElapsed, totalPeriods);
      }
      results.push(clampTowardTarget(raw, goal, direction));
    }
    return results;
  }

  // Open-ended: simulate forward assuming hits
  const todayStr = today();
  const simulatedEntries = [...entries];
  const results: number[] = [];
  for (let i = 0; i < PROJECTED_SAMPLE_COUNT; i++) {
    const { target } = generateNextTarget(goal, habit, schedules, simulatedEntries, todayStr);
    results.push(target);
    simulatedEntries.push({
      id: `sim-${i}`,
      goalId: goal.id,
      date: todayStr,
      actualValue: target,
      generatedTarget: target,
      hit: true,
      tagIds: [],
    } as LoggedEntry);
  }
  return results;
}

/** Boolean habits hit only on an exact "yes" (1) — everything else defers to direction-aware `isHit`. */
export function computeHit(habit: Habit, actualValue: number, target: number): boolean {
  if (habit.type === "boolean") return actualValue === 1;
  return isHit(requireDirection(habit), actualValue, target);
}
