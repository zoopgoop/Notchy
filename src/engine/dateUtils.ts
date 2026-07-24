const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Formats a Date using its LOCAL calendar components, not UTC. Use this for any Date
 * object that came from the device's clock or a date picker — `.toISOString()` on
 * those converts to UTC first, which silently rolls the date backward by one for
 * anyone east of Greenwich (e.g. local midnight in UTC+10 is still "yesterday" in UTC).
 */
export function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Truncates to a calendar date, treated as UTC midnight for arithmetic. Date-only
 * strings ("YYYY-MM-DD", e.g. `today()`, `LoggedEntry.date`) are unambiguous and used
 * as-is. Full timestamps (e.g. `Goal.createdAt`, which is `new Date().toISOString()` —
 * always UTC) are first converted to the LOCAL calendar date they represent, so a
 * goal created near midnight lines up with `today()`'s local-calendar convention
 * instead of silently using the UTC day, which can be one day off.
 */
function toUtcMidnight(input: string): Date {
  const dateOnly = input.length === 10 ? input : formatDateLocal(new Date(input));
  return new Date(`${dateOnly}T00:00:00.000Z`);
}

/** Whole calendar days from `fromIso` to `toIso` (negative if `toIso` is earlier), UTC-safe like the rest of this module. */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = toUtcMidnight(fromIso);
  const to = toUtcMidnight(toIso);
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/** Adds (or subtracts) whole days to a date string, returning a date-only ("YYYY-MM-DD") string. UTC-safe. */
export function addDays(dateIso: string, delta: number): string {
  const date = toUtcMidnight(dateIso);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** Date.getDay() convention (0=Sunday..6=Saturday), computed UTC-safe like the rest of this module. */
export function getWeekday(dateIso: string): number {
  return toUtcMidnight(dateIso).getUTCDay();
}

/**
 * Days elapsed since this week's Monday (0 on Monday, 6 on Sunday) — every weekly-quota
 * calculation in the app anchors its week to Monday, so this is the one place that
 * conversion happens. Day-of-week values elsewhere (scheduled_days, getWeekday) stay in
 * Date.getDay()'s native Sunday=0 encoding; only "where does the week start" changes.
 */
export function daysSinceMonday(dateIso: string): number {
  return (getWeekday(dateIso) + 6) % 7;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Today's date in the device's local calendar, not UTC — a habit tracker's "today"
 * is whatever day it is for the person holding the phone, not Greenwich.
 */
export function today(): string {
  return formatDateLocal(new Date());
}

/**
 * The local calendar date a full UTC timestamp (e.g. `Goal.createdAt`, always
 * `new Date().toISOString()`) represents. Use this instead of slicing the ISO string
 * directly (`isoTimestamp.slice(0, 10)`) — that silently returns the UTC date, which is
 * one day off from `today()` for a large chunk of the day in every timezone ahead of UTC.
 */
export function localDateOf(isoTimestamp: string): string {
  return formatDateLocal(new Date(isoTimestamp));
}
