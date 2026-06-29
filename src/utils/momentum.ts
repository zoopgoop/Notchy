import { Direction, LoggedEntry } from "../types";
import { computeCloseness } from "./closeness";

export type Momentum = "up" | "flat" | "down" | "insufficient_data";

const WINDOW = 3;
const FLAT_THRESHOLD = 0.05;

/**
 * Compares the average closeness-to-target of the last `WINDOW` entries against the
 * `WINDOW` before that. Needs two full windows of history to say anything at all.
 */
export function computeMomentum(direction: Direction, entriesAscending: LoggedEntry[]): Momentum {
  const numeric = entriesAscending.filter(
    (e): e is LoggedEntry & { actualValue: number } => e.actualValue !== undefined
  );
  if (numeric.length < WINDOW * 2) return "insufficient_data";

  const average = (entries: typeof numeric) =>
    entries.reduce((sum, e) => sum + computeCloseness(direction, e.actualValue, e.generatedTarget), 0) /
    entries.length;

  const recentAvg = average(numeric.slice(-WINDOW));
  const previousAvg = average(numeric.slice(-WINDOW * 2, -WINDOW));

  if (previousAvg === 0) return recentAvg > 0 ? "up" : "insufficient_data";

  const change = (recentAvg - previousAvg) / previousAvg;
  if (change > FLAT_THRESHOLD) return "up";
  if (change < -FLAT_THRESHOLD) return "down";
  return "flat";
}

/** Per the spec's explicit design decision: never show a downward arrow — avoid guilt framing. */
export function shouldShowMomentum(momentum: Momentum): boolean {
  return momentum === "up" || momentum === "flat";
}
