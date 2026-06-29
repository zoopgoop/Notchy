/** Rounds to 1 decimal for display without mutating the underlying stored value. */
export function formatNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** " kg" style suffix for an optional unit label — empty string when there's none. */
export function unitSuffix(unitLabel?: string): string {
  return unitLabel ? ` ${unitLabel}` : "";
}
