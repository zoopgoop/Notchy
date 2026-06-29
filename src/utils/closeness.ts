import { Direction } from "../types";

const MAX_CLOSENESS = 1.5;

/**
 * How close a logged value was to its target, direction-aware so 1.0 always means
 * "exactly on target" regardless of whether the goal is increasing or decreasing.
 * Clamped above 0 so a missed/zero value never breaks the ratio.
 */
export function computeCloseness(direction: Direction, actualValue: number, target: number): number {
  if (target === 0 || actualValue < 0) return 0;
  const ratio = direction === "increasing" ? actualValue / target : target / Math.max(actualValue, 1e-6);
  return Math.max(0, Math.min(ratio, MAX_CLOSENESS));
}
