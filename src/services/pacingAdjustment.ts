import { ADAPTIVE_MIN_SAMPLE, ADAPTIVE_WINDOW, requireDirection } from "../engine/curves";
import { Goal, Habit, LoggedEntry } from "../types";

const STRUGGLING_HIT_RATE = 0.3;
const OVERSHOOTING_HIT_RATE = 0.8;
const OVERSHOOT_RATIO = 1.25;

export type PacingMismatch = "struggling" | "overshooting";

/**
 * Date-driven goals don't use the adaptive system (the date already fixes the pace) —
 * this is the alternative: flag when the user is consistently missing or consistently
 * blowing past targets, so the app can offer to adjust the date/target instead of
 * silently grinding on toward a deadline that's no longer realistic either way.
 * Reuses the adaptive system's window/sample-size thresholds for consistency.
 */
export function detectPacingMismatch(goal: Goal, habit: Habit, entries: LoggedEntry[]): PacingMismatch | null {
  if (!goal.targetDate || habit.type === "boolean") return null;

  const window = entries.slice(-ADAPTIVE_WINDOW).filter((e) => e.actualValue !== undefined);
  if (window.length < ADAPTIVE_MIN_SAMPLE) return null;

  const hitRate = window.filter((e) => e.hit).length / window.length;
  if (hitRate <= STRUGGLING_HIT_RATE) return "struggling";

  if (hitRate >= OVERSHOOTING_HIT_RATE) {
    const direction = requireDirection(habit);
    const ratios = window.map((e) => {
      const actual = e.actualValue as number;
      return direction === "increasing" ? actual / e.generatedTarget : e.generatedTarget / actual;
    });
    const avgRatio = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
    if (avgRatio >= OVERSHOOT_RATIO) return "overshooting";
  }

  return null;
}
