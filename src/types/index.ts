export type HabitType = "numeric" | "boolean";
export type Direction = "increasing" | "decreasing";

/**
 * Base curve shape used to compute each day/period's target.
 * "adaptive" is NOT a value here — it's the Goal.adaptive flag, which layers
 * a hit-rate-driven rate multiplier on top of whichever curve is chosen below.
 * "incremental": fast early progress, flattening as the deadline nears.
 * "exponential": the mirror image — slow early progress, accelerating late.
 */
export type CurveType = "linear" | "incremental" | "exponential" | "percentage";
export type ProgressionMode = "static" | "relative";

/** A category groups habits for color-coding and browsing — purely organizational, no behavior of its own. */
export interface Category {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

/** The thing being tracked — the WHAT. Pacing/targets live on its current Goal, not here. */
export interface Habit {
  id: string;
  /** Optional — a habit can exist with no category at all. */
  categoryId?: string;
  name: string;
  type: HabitType;
  direction?: Direction;
  unitLabel?: string;
  createdAt: string;
  /** Free-text notes — purely descriptive, editable anytime regardless of goal lock state. */
  description?: string;
  /**
   * Master on/off switch for this habit's notifications (morning reminder + evening
   * countdown). Lives here, not on Goal — the habit is the actual task being notified
   * about; a goal is only the optional end target a habit may or may not have, and
   * notifications need to work for goalless habits and survive a goal being replaced
   * (achieved/restarted) too. Defaults true.
   */
  notificationsEnabled: boolean;
  /** When false, overdue/catch-up notifications are suppressed on days outside the scheduled day list. */
  notifyOffSchedule: boolean;
}

/**
 * A habit's active pacing plan — the HOW FAST/HOW FAR. A habit has at most one goal "in
 * flight" at a time (see `getCurrentGoalForHabit`); once achieved it's either edited in
 * place (streak carries over) or left as history while a fresh one takes over.
 */
export interface Goal {
  id: string;
  habitId: string;
  startValue: number;
  /** Absent for open-ended (goalless) habits — step pacing only, runs forever, never "achieved". */
  targetValue?: number;
  targetDate?: string;
  curveType: CurveType;
  /** Plateau-aware rate modulation layered on top of curveType — only applies to non-date ("by step") goals. */
  adaptive: boolean;
  progressionMode: ProgressionMode;
  /** Absolute increment (progressionMode "static") or fractional rate e.g. 0.015 (progressionMode "relative"). */
  step: number;
  achievedAt?: string;
  createdAt: string;
  active: boolean;
  /** Once true, every notification for this goal is silenced indefinitely — set only by dismissing the lost-streak/quota-gone prompt, cleared by logging or adjusting the goal. */
  onIce: boolean;
  /** Set by "Start Again"/"Adjust Habit" on the lost-streak/quota-gone prompt — trims this week's required check-ins down to this date forward, same as a fresh goal's first week. */
  restartedAt?: string;
}

/** One day's check-in for a goal — at most one per (goalId, date), see `createEntry`. */
export interface LoggedEntry {
  id: string;
  goalId: string;
  date: string;
  actualValue?: number;
  hit: boolean;
  generatedTarget: number;
  tagIds: string[];
}

/** A label attachable to a logged entry (e.g. "Tired", "Sore") — built-ins seeded once, see `BUILT_IN_TAGS`. */
export interface Tag {
  id: string;
  label: string;
  isBuiltIn: boolean;
}

/** A no-explanation-needed pass on a given day — counts toward the week's quota like a log would, see `tallyWeek`. */
export interface SkipLog {
  id: string;
  goalId: string;
  date: string;
}

/** A date range (inclusive) over which a goal's weekly quota is fully exempt — travel, illness, etc. */
export interface FreezeWindow {
  id: string;
  goalId: string;
  startDate: string;
  endDate: string;
}

export type CelebrationType =
  | "daily_hit"
  | "goal_achieved"
  | "streak_milestone"
  | "personal_best"
  | "comeback";

/** A notable moment worth surfacing — recorded once per occurrence, backs the celebration overlay and Trophy Case. */
export interface Celebration {
  id: string;
  goalId: string;
  type: CelebrationType;
  date: string;
  metadata?: Record<string, number | string>;
}

/** An earned app-wide achievement badge — see services/achievements.ts's static catalog for what `key` can be. */
export interface Achievement {
  key: string;
  earnedAt: string;
}

/** Current and longest consecutive-week-quota run for a goal — one row per goal, see `recomputeStreak`. */
export interface Streak {
  goalId: string;
  current: number;
  longest: number;
}

/** A goal's weekly day-of-week schedule, time-varying — see src/engine/schedule.ts. */
export interface GoalSchedule {
  id: string;
  goalId: string;
  /** A Monday (week start) — this schedule applies from this date onward, until superseded. */
  effectiveDate: string;
  /** Date.getDay() values, 0=Sunday..6=Saturday. */
  scheduledDays: number[];
}

/**
 * What time to send the "initial" check-in reminder for this goal on a given weekday —
 * separate from GoalSchedule, since reminder time isn't streak-affecting and so doesn't
 * need the "next week" effective-dating that scheduledDays does.
 */
export interface GoalNotificationTime {
  goalId: string;
  /** Date.getDay() values, 0=Sunday..6=Saturday. */
  dayOfWeek: number;
  hour: number;
  minute: number;
}
