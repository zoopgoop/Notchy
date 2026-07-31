import { Direction, Goal, GoalSchedule, Habit, LoggedEntry, ValueKind } from "../types";
import { countScheduledDaysBetween } from "./schedule";
import { today } from "./dateUtils";
import {
  adaptiveMultiplier,
  CONSECUTIVE_MISSES_FOR_DELOAD,
  deloadTarget,
  easeTargetTowardActual,
  exponentialTarget,
  incrementalTarget,
  isHit,
  linearTarget,
  percentageTarget,
  requireDirection,
  roundForHabit,
  stepTarget,
} from "./curves";

export type TargetReason = "boolean" | "initial" | "advance" | "hold" | "ease" | "deload";

/**
 * Date-driven goals (a real curve paced against a targetDate) vs. step-paced ones
 * (open-ended, or stepping toward a targetValue with no deadline) — mirrors the branch
 * `computeBaseTarget` uses to pick its formula. Only step-paced goals get the
 * per-miss easing below; date-driven ones must keep hitting their deadline-paced
 * number regardless of a single miss.
 */
function isDateDriven(goal: Goal): goal is Goal & { targetDate: string; targetValue: number } {
  return goal.curveType !== "percentage" && goal.targetDate !== undefined && goal.targetValue !== undefined;
}

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
  const multiplier = goal.adaptive ? adaptiveMultiplier(entries, direction) : 1;

  if (isDateDriven(goal)) {
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

  return stepTarget(anchorValue, goal.step * multiplier, direction);
}

/**
 * Numeric habits round to a whole number by default (reps, sessions, etc. don't have
 * fractional units), or to one decimal place for habits with valueKind "decimal" (weight,
 * distance, ...) — rounding here, the one chokepoint every generated target passes
 * through, is simpler than rounding at each of the call sites below. Goalless habits
 * have no targetValue to clamp toward, so growth is unbounded — but a decreasing
 * goalless habit (screen time, cigarettes, etc.) still can't sensibly target below
 * zero, so it gets a floor even without an explicit target.
 */
function clampTowardTarget(value: number, goal: Goal, direction: Direction, valueKind: ValueKind | undefined): number {
  if (goal.targetValue === undefined) {
    return roundForHabit(direction === "decreasing" ? Math.max(value, 0) : value, valueKind);
  }
  const clamped = direction === "increasing" ? Math.min(value, goal.targetValue) : Math.max(value, goal.targetValue);
  return roundForHabit(clamped, valueKind);
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
    // First check-in always targets the starting value — no progression on day one.
    return { target: clampTowardTarget(goal.startValue, goal, direction, habit.valueKind), reason: "initial" };
  }

  if (lastEntry.hit) {
    const anchorValue = lastEntry.actualValue ?? lastEntry.generatedTarget;
    const target = computeBaseTarget(goal, schedules, direction, anchorValue, lastEntry.date, today, entries);
    return { target: clampTowardTarget(target, goal, direction, habit.valueKind), reason: "advance" };
  }

  const trailingMisses = countTrailingMisses(entries);
  if (trailingMisses >= CONSECUTIVE_MISSES_FOR_DELOAD) {
    const target = deloadTarget(lastEntry.generatedTarget, goal.startValue);
    return { target: clampTowardTarget(target, goal, direction, habit.valueKind), reason: "deload" };
  }

  if (!isDateDriven(goal) && lastEntry.actualValue !== undefined) {
    const target = easeTargetTowardActual(lastEntry.generatedTarget, lastEntry.actualValue);
    return { target: clampTowardTarget(target, goal, direction, habit.valueKind), reason: "ease" };
  }

  return { target: lastEntry.generatedTarget, reason: "hold" };
}

const PROJECTED_SAMPLE_COUNT = 24;
// Safety ceiling for the "keep simulating until the goal is actually reached" case below —
// far more than any reasonable step size should ever need, so it only bites when the step
// is so small relative to the distance remaining that the goal is essentially unreachable.
const MAX_SAMPLES_TOWARD_TARGET = 200;
// A truly goalless habit's preview window, deliberately much shorter than
// PROJECTED_SAMPLE_COUNT. Each entry here is a real simulated session (one hit = one step),
// unlike the date-driven branch below where samples are just evenly-spaced curve evaluations
// over calendar time — so this count directly sets how many sessions the chart's projected
// line covers. ProgressChart budgets ~8 projected slots in the common case (MAX_TOTAL_POINTS
// minus MAX_REAL_POINTS); staying close to that means its downsample() has little left to
// compress, so each visual step stays close to one real session instead of several averaged
// together — which used to make the projected line's gradient look like it jumped right at
// "today" even though the underlying per-session rate hadn't actually changed. Left a
// touch above that budget (rather than an exact match) so there's still a little real
// texture for downsample() to work with instead of a perfectly rigid 1:1 mapping.
const GOALLESS_PROJECTION_SESSIONS = 10;

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
  const multiplier = goal.adaptive ? adaptiveMultiplier(entries, direction) : 1;

  if (isDateDriven(goal)) {
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
      results.push(clampTowardTarget(raw, goal, direction, habit.valueKind));
    }
    return results;
  }

  // Open-ended: simulate forward assuming hits. A goal with a real targetValue but no
  // date (step-paced toward an end goal) should visually finish exactly at that value —
  // a flat GOALLESS_PROJECTION_SESSIONS cutoff can land short of it while the step is still
  // closing the gap, so keep simulating (with a generous safety ceiling in case the step's
  // too small to ever actually reach it) until the clamp is actually hit. A truly goalless
  // habit has no such endpoint to reach, so it keeps the short fixed preview window instead.
  const todayStr = today();
  const simulatedEntries = [...entries];
  const results: number[] = [];
  const sampleCount = goal.targetValue !== undefined ? MAX_SAMPLES_TOWARD_TARGET : GOALLESS_PROJECTION_SESSIONS;
  for (let i = 0; i < sampleCount; i++) {
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
    if (goal.targetValue !== undefined && target === goal.targetValue) break;
  }
  return results;
}

/** Boolean habits hit only on an exact "yes" (1) — everything else defers to direction-aware `isHit`. */
export function computeHit(habit: Habit, actualValue: number, target: number): boolean {
  if (habit.type === "boolean") return actualValue === 1;
  return isHit(requireDirection(habit), actualValue, target);
}
