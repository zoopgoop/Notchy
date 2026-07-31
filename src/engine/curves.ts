import { Direction, Habit, LoggedEntry, ValueKind } from "../types";
import { clamp } from "./dateUtils";

/**
 * Tuning knobs for the curve/adaptive-pacing math below. The `_K` constants shape how
 * sharply the incremental/exponential curves bend (higher = sharper bend near the
 * deadline); the `ADAPTIVE_*` ones govern the plateau-aware rate nudge — boost the pace
 * when hit-rate over the last `ADAPTIVE_WINDOW` entries clears the boost threshold, ease
 * it when hit-rate falls under the ease threshold, with `ADAPTIVE_MIN_SAMPLE` entries
 * needed before adapting at all. Within the boost bucket, `ADAPTIVE_BIG_*` adds a second,
 * bigger tier once average overshoot clears its own threshold — see adaptiveMultiplier.
 * `DELOAD_*` softens the next target after a bad enough streak of misses, rather than
 * letting the curve keep pushing through it.
 */
export const DEFAULT_INCREMENTAL_K = 2;
export const DEFAULT_EXPONENTIAL_K = 2;
export const DEFAULT_PERCENTAGE_RATE = 0.015;
export const ADAPTIVE_BOOST_MULTIPLIER = 1.2;
export const ADAPTIVE_EASE_MULTIPLIER = 0.7;
export const ADAPTIVE_HIT_RATE_BOOST_THRESHOLD = 0.8;
export const ADAPTIVE_HIT_RATE_EASE_THRESHOLD = 0.4;
export const ADAPTIVE_MIN_SAMPLE = 3;
export const ADAPTIVE_WINDOW = 5;
/** Within the boost bucket, a higher tier kicks in once average overshoot clears this. */
export const ADAPTIVE_BIG_OVERSHOOT_THRESHOLD = 0.5;
export const ADAPTIVE_BIG_BOOST_MULTIPLIER = 1.5;
/** Clamps a single entry's overshoot ratio so one wild outlier can't dominate the average. */
const OVERSHOOT_RATIO_MIN = -1;
const OVERSHOOT_RATIO_MAX = 2;
export const DELOAD_EASE_FRACTION = 0.2;
export const CONSECUTIVE_MISSES_FOR_DELOAD = 3;
export const MISS_EASE_FRACTION = 0.2;
export const DECIMAL_DISPLAY_PRECISION = 1;

/**
 * Numeric habits round to a whole number by default (reps, sessions — see
 * clampTowardTarget in progression.ts); habits with valueKind "decimal" round to
 * `DECIMAL_DISPLAY_PRECISION` places instead, so a weight/distance-style habit doesn't
 * accumulate meaningless float noise (62.500000001) while still keeping a fraction.
 */
export function roundForHabit(value: number, valueKind: ValueKind | undefined): number {
  if (valueKind !== "decimal") return Math.round(value);
  const factor = 10 ** DECIMAL_DISPLAY_PRECISION;
  return Math.round(value * factor) / factor;
}

/** +1 for increasing goals, -1 for decreasing goals — multiply onto a magnitude to get a signed delta. */
export function directionSign(direction: Direction): 1 | -1 {
  return direction === "increasing" ? 1 : -1;
}

/**
 * Numeric habits must have a direction (per the data model). Throws instead of
 * silently defaulting, since a missing direction would otherwise fall through to "decreasing"
 * behavior and produce wrong-but-plausible-looking targets rather than an obvious failure.
 */
export function requireDirection(habit: Habit): Direction {
  if (!habit.direction) {
    throw new Error(`Habit "${habit.id}" (${habit.type}) is missing a required direction`);
  }
  return habit.direction;
}

/** Met-or-beat the target, direction-aware — "more" counts for increasing goals, "less" for decreasing ones. */
export function isHit(direction: Direction, actual: number, target: number): boolean {
  return direction === "increasing" ? actual >= target : actual <= target;
}

/** Direction is implied by a goal's own numbers — no need to ask the user to state it redundantly. */
export function directionFromValues(startValue: number, targetValue: number): Direction {
  return targetValue >= startValue ? "increasing" : "decreasing";
}

/**
 * target(periodsElapsed) = start + (target - start) * (periodsElapsed / totalPeriods)
 * Works for either direction since (target - start) already carries the correct sign.
 */
export function linearTarget(
  start: number,
  target: number,
  periodsElapsed: number,
  totalPeriods: number
): number {
  if (totalPeriods <= 0) return target;
  const fraction = clamp(periodsElapsed / totalPeriods, 0, 1);
  return start + (target - start) * fraction;
}

/**
 * Ease-out curve: fast early progress, flattens near the deadline. remainingFraction
 * decays from 1 (day 0) to ~0 (final day), clamped to exactly `target` once
 * periodsElapsed reaches totalPeriods.
 */
export function incrementalTarget(
  start: number,
  target: number,
  periodsElapsed: number,
  totalPeriods: number,
  k: number = DEFAULT_INCREMENTAL_K
): number {
  if (totalPeriods <= 0 || periodsElapsed >= totalPeriods) return target;
  const remainingFraction = Math.exp((-k * periodsElapsed) / totalPeriods);
  return target - (target - start) * remainingFraction;
}

/**
 * Ease-in curve: the mirror image of `incrementalTarget` — slow early progress that
 * accelerates toward the deadline. Normalized so it lands exactly on `target` at
 * periodsElapsed === totalPeriods (true exponential growth, not an asymptote).
 */
export function exponentialTarget(
  start: number,
  target: number,
  periodsElapsed: number,
  totalPeriods: number,
  k: number = DEFAULT_EXPONENTIAL_K
): number {
  if (totalPeriods <= 0 || periodsElapsed >= totalPeriods) return target;
  const fraction = clamp(periodsElapsed / totalPeriods, 0, 1);
  const growthFraction = (Math.exp(k * fraction) - 1) / (Math.exp(k) - 1);
  return start + (target - start) * growthFraction;
}

/** nextTarget = lastValue * (1 + rate), direction-aware (rate shrinks the value for "decreasing" goals). */
export function percentageTarget(
  lastValue: number,
  rate: number,
  direction: Direction
): number {
  return lastValue * (1 + directionSign(direction) * rate);
}

/**
 * Open-ended fallback for static progressionMode with no target date: advances by the
 * goal's configured step every hit. The only things that should move this number are the
 * user (editing the step) and the adaptive multiplier (easing or boosting it based on
 * recent performance) — no implicit taper based on session count.
 */
export function stepTarget(lastValue: number, baseStep: number, direction: Direction): number {
  return lastValue + directionSign(direction) * baseStep;
}

/**
 * How far one entry cleared (positive) or fell short of (negative) its target, as a
 * fraction of the target, direction-aware — e.g. an increasing goal hitting 20 against a
 * target of 10 is +1.0 (100% over); missing 10 with a 5 is -0.5. Clamped so one wild
 * outlier (a typo, a freak session) can't dominate a window average on its own. Returns
 * null for entries with no comparable actual value, or a zero target (can't form a ratio).
 */
function overshootRatio(entry: LoggedEntry, direction: Direction): number | null {
  if (entry.actualValue === undefined || entry.generatedTarget === 0) return null;
  const raw = (directionSign(direction) * (entry.actualValue - entry.generatedTarget)) / Math.abs(entry.generatedTarget);
  return Math.max(OVERSHOOT_RATIO_MIN, Math.min(raw, OVERSHOOT_RATIO_MAX));
}

/**
 * Plateau-aware multiplier applied to a curve's rate/step (or its effective time
 * position for date-driven curves) based on hit-rate over the last N entries. Returns 1.0
 * (neutral) until there's enough history to judge a trend.
 *
 * Within the boost bucket, a second tier scales the boost by how much the window is
 * clearing its targets by on average — not just whether it did. The average is signed and
 * spans the whole window (misses count negative), not just the hits, so one bad day mixed
 * into an otherwise strong window dampens the boost instead of being silently ignored —
 * while a single miss still can't drop hit-rate itself out of the boost bucket on its own;
 * that only happens with a real pattern of misses. There's no floor below the standard
 * 1.2x boost to fall through to here — that tier already *is* the floor.
 */
export function adaptiveMultiplier(entries: LoggedEntry[], direction: Direction): number {
  const window = entries.slice(-ADAPTIVE_WINDOW);
  if (window.length < ADAPTIVE_MIN_SAMPLE) return 1;

  const hitRate = window.filter((e) => e.hit).length / window.length;
  if (hitRate >= ADAPTIVE_HIT_RATE_BOOST_THRESHOLD) {
    const ratios = window.map((e) => overshootRatio(e, direction)).filter((r): r is number => r !== null);
    const avgOvershoot = ratios.length > 0 ? ratios.reduce((sum, r) => sum + r, 0) / ratios.length : 0;
    return avgOvershoot >= ADAPTIVE_BIG_OVERSHOOT_THRESHOLD ? ADAPTIVE_BIG_BOOST_MULTIPLIER : ADAPTIVE_BOOST_MULTIPLIER;
  }
  if (hitRate <= ADAPTIVE_HIT_RATE_EASE_THRESHOLD) return ADAPTIVE_EASE_MULTIPLIER;
  return 1;
}

/** Eases a target ~20% of the way back toward the goal's original start value. */
export function deloadTarget(currentTarget: number, anchorStart: number): number {
  return currentTarget - DELOAD_EASE_FRACTION * (currentTarget - anchorStart);
}

/**
 * Step-paced goals only: instead of holding flat after a miss, close ~20% of the gap
 * toward what was actually logged — so a target the current pace can't reach anymore
 * comes back down to meet reality gradually instead of staying fixed until 3 misses
 * trigger a full deload. Date-driven goals don't get this — they're paced against a
 * fixed deadline, not a rolling anchor, so easing per-miss would just mean missing the
 * date instead.
 */
export function easeTargetTowardActual(currentTarget: number, actualValue: number): number {
  return currentTarget - MISS_EASE_FRACTION * (currentTarget - actualValue);
}
