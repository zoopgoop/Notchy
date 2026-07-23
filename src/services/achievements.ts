import { addDays, daysBetween, localDateOf, today } from "../engine/dateUtils";
import { tallyWeek, weekStartOf } from "../engine/schedule";
import {
  countCategoriesUsed,
  countTotalEntries,
  countTotalHabits,
  earliestHabitCreatedAt,
  hasAdaptiveGoal,
  hasAnyFreeze,
  hasAnySkip,
  hasRelativeGoal,
  listActiveGoals,
  listDistinctCurveTypesUsed,
  listDistinctHabitTypesUsed,
  listDistinctLoggedDates,
  listEarnedAchievements,
  listEntriesByGoal,
  listFreezeWindowsByGoal,
  listGoalSchedules,
  listSkipsByGoal,
  recordAchievement,
} from "../db/repositories";

export type AchievementFamily =
  | "logs"
  | "habits"
  | "categories"
  | "daily_streak"
  | "calendar"
  | "explorer"
  | "consistency"
  | "resilience";

export const FAMILY_LABELS: Record<AchievementFamily, string> = {
  logs: "Check-Ins",
  habits: "Habits Created",
  categories: "Categories",
  daily_streak: "Never Miss a Day",
  calendar: "Calendar",
  explorer: "Explorer",
  consistency: "Consistency",
  resilience: "Resilience",
};

/** Display order for the achievements grid, roughly least-to-most prestigious within reason. */
export const FAMILY_ORDER: AchievementFamily[] = [
  "logs",
  "habits",
  "categories",
  "daily_streak",
  "calendar",
  "explorer",
  "consistency",
  "resilience",
];

export interface AchievementDef {
  key: string;
  family: AchievementFamily;
  title: string;
  description: string;
  emoji: string;
  /** For tiered badges only — the raw count this badge needs (see AchievementProgress.current for where you are now). */
  target?: number;
}

/**
 * The full static badge catalog — app-wide and habit-agnostic, unlike per-goal Celebrations
 * (see celebrations.ts). "restarted_streak" is recorded live from HomeScreen at the moment
 * it happens rather than evaluated here, since there's no persisted trail to reconstruct it
 * from after the fact.
 */
export const ACHIEVEMENT_CATALOG: AchievementDef[] = [
  { key: "logs_10", family: "logs", title: "First Steps", description: "Log 10 check-ins.", emoji: "👣", target: 10 },
  { key: "logs_50", family: "logs", title: "Fifty and Counting", description: "Log 50 check-ins.", emoji: "📈", target: 50 },
  { key: "logs_100", family: "logs", title: "Century", description: "Log 100 check-ins.", emoji: "💯", target: 100 },
  { key: "logs_250", family: "logs", title: "Dedicated", description: "Log 250 check-ins.", emoji: "⭐", target: 250 },
  { key: "logs_500", family: "logs", title: "Half Grand", description: "Log 500 check-ins.", emoji: "🌟", target: 500 },
  { key: "logs_1000", family: "logs", title: "The Grind", description: "Log 1,000 check-ins.", emoji: "🏅", target: 1000 },

  { key: "habits_3", family: "habits", title: "Building a Routine", description: "Create 3 habits.", emoji: "🧩", target: 3 },
  { key: "habits_5", family: "habits", title: "Habit Collector", description: "Create 5 habits.", emoji: "🗂️", target: 5 },
  { key: "habits_10", family: "habits", title: "Habit Hoarder", description: "Create 10 habits.", emoji: "📚", target: 10 },

  { key: "categories_3", family: "categories", title: "Well-Rounded", description: "Use 3 categories.", emoji: "🎨", target: 3 },
  { key: "categories_5", family: "categories", title: "Renaissance Person", description: "Use 5 categories.", emoji: "🧭", target: 5 },

  { key: "daily_streak_7", family: "daily_streak", title: "One Week Strong", description: "Log something every day for 7 days straight.", emoji: "🔥", target: 7 },
  { key: "daily_streak_14", family: "daily_streak", title: "Two Weeks In", description: "Log something every day for 14 days straight.", emoji: "🔥", target: 14 },
  { key: "daily_streak_30", family: "daily_streak", title: "Full Month", description: "Log something every day for 30 days straight.", emoji: "🔥", target: 30 },
  { key: "daily_streak_100", family: "daily_streak", title: "Triple Digits", description: "Log something every day for 100 days straight.", emoji: "🔥", target: 100 },

  { key: "new_year", family: "calendar", title: "Resolution Kept", description: "Log a check-in on New Year's Day.", emoji: "🎆" },
  { key: "month_one", family: "calendar", title: "Month One Done", description: "30 days since your first habit.", emoji: "📅", target: 30 },
  { key: "anniversary", family: "calendar", title: "Anniversary", description: "One year since your first habit.", emoji: "🎂", target: 365 },

  { key: "explorer_curves", family: "explorer", title: "Curve Connoisseur", description: "Try all three pacing curves.", emoji: "📐", target: 3 },
  { key: "explorer_types", family: "explorer", title: "Two Sides", description: "Create both a numeric and a yes/no habit.", emoji: "🔀" },
  { key: "explorer_adaptive", family: "explorer", title: "Adapter", description: "Try adaptive pacing.", emoji: "🧠" },
  { key: "explorer_relative", family: "explorer", title: "Percentage Player", description: "Try relative (%) progression.", emoji: "📊" },

  { key: "perfect_day", family: "consistency", title: "Full House", description: "Log every active habit on the same day.", emoji: "🏠" },
  { key: "perfect_week", family: "consistency", title: "Perfect Week", description: "Hit every active habit's weekly quota in the same week.", emoji: "✅" },

  { key: "first_skip", family: "resilience", title: "Strategic Retreat", description: "Use a skip for the first time.", emoji: "⏭️" },
  { key: "first_freeze", family: "resilience", title: "On Ice", description: "Use a freeze window for the first time.", emoji: "🧊" },
  { key: "restarted_streak", family: "resilience", title: "Back in the Saddle", description: "Restart a habit after losing a streak instead of walking away.", emoji: "🔁" },
];

export interface AchievementProgress {
  def: AchievementDef;
  earnedAt: string | null;
  /** Where the account currently stands toward def.target — undefined for pass/fail badges with no target. */
  current?: number;
}

/** Longest run of consecutive calendar dates in an ascending, deduplicated date list. */
function longestConsecutiveRun(datesAscending: string[]): number {
  if (datesAscending.length === 0) return 0;
  let longest = 1;
  let current = 1;
  for (let i = 1; i < datesAscending.length; i++) {
    if (addDays(datesAscending[i - 1], 1) === datesAscending[i]) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }
  return longest;
}

/** Was there ever a single day every *currently* active goal has a logged entry for? */
async function computePerfectDay(): Promise<boolean> {
  const activeGoals = await listActiveGoals();
  if (activeGoals.length === 0) return false;
  const dateSets = await Promise.all(
    activeGoals.map(async (g) => new Set((await listEntriesByGoal(g.id)).map((e) => e.date)))
  );
  const [first, ...rest] = dateSets;
  for (const date of first) {
    if (rest.every((s) => s.has(date))) return true;
  }
  return false;
}

const PERFECT_WEEK_LOOKBACK = 12;

/** Was there a recently-completed week where every *currently* active goal met its quota? */
async function computePerfectWeek(): Promise<boolean> {
  const activeGoals = await listActiveGoals();
  if (activeGoals.length === 0) return false;

  const perGoalData = await Promise.all(
    activeGoals.map(async (goal) => ({
      goal,
      entries: await listEntriesByGoal(goal.id),
      skips: await listSkipsByGoal(goal.id),
      freezeWindows: await listFreezeWindowsByGoal(goal.id),
      schedules: await listGoalSchedules(goal.id),
    }))
  );

  const thisWeekStart = weekStartOf(today());
  for (let i = 1; i <= PERFECT_WEEK_LOOKBACK; i++) {
    const weekStart = addDays(thisWeekStart, -7 * i);
    const allMet = perGoalData.every(({ goal, entries, skips, freezeWindows, schedules }) => {
      const tally = tallyWeek(schedules, goal, entries, skips, freezeWindows, weekStart);
      return tally.credited >= tally.required;
    });
    if (allMet) return true;
  }
  return false;
}

export interface EvaluateAchievementsResult {
  /** Full catalog with earned dates (null = still locked) — feeds the Trophy Case grid. */
  progress: AchievementProgress[];
  /** Only the ones newly recorded by this call — feeds the earned-achievement toast. */
  newlyEarned: AchievementDef[];
}

/**
 * Checks every catalog entry against current account state and records any newly-earned
 * ones. Cheap enough to call after every log, not just on Trophy Case load — the per-goal
 * queries (perfect day/week) are the only remotely expensive part, and stay bounded by
 * account size.
 */
export async function evaluateAchievements(): Promise<EvaluateAchievementsResult> {
  const earned = await listEarnedAchievements();
  const earnedAt = new Map(earned.map((a) => [a.key, a.earnedAt]));
  const currentByFamily = new Map<AchievementFamily, number>();
  const now = today();

  function check(key: string, condition: boolean) {
    if (condition && !earnedAt.has(key)) earnedAt.set(key, now);
  }

  const [
    totalLogs,
    totalHabits,
    categoriesUsed,
    loggedDates,
    curveTypesUsed,
    habitTypesUsed,
    adaptiveUsed,
    relativeUsed,
    skipUsed,
    freezeUsed,
    earliestHabit,
    perfectDay,
    perfectWeek,
  ] = await Promise.all([
    countTotalEntries(),
    countTotalHabits(),
    countCategoriesUsed(),
    listDistinctLoggedDates(),
    listDistinctCurveTypesUsed(),
    listDistinctHabitTypesUsed(),
    hasAdaptiveGoal(),
    hasRelativeGoal(),
    hasAnySkip(),
    hasAnyFreeze(),
    earliestHabitCreatedAt(),
    computePerfectDay(),
    computePerfectWeek(),
  ]);

  currentByFamily.set("logs", totalLogs);
  check("logs_10", totalLogs >= 10);
  check("logs_50", totalLogs >= 50);
  check("logs_100", totalLogs >= 100);
  check("logs_250", totalLogs >= 250);
  check("logs_500", totalLogs >= 500);
  check("logs_1000", totalLogs >= 1000);

  currentByFamily.set("habits", totalHabits);
  check("habits_3", totalHabits >= 3);
  check("habits_5", totalHabits >= 5);
  check("habits_10", totalHabits >= 10);

  currentByFamily.set("categories", categoriesUsed);
  check("categories_3", categoriesUsed >= 3);
  check("categories_5", categoriesUsed >= 5);

  const longestDailyStreak = longestConsecutiveRun(loggedDates);
  currentByFamily.set("daily_streak", longestDailyStreak);
  check("daily_streak_7", longestDailyStreak >= 7);
  check("daily_streak_14", longestDailyStreak >= 14);
  check("daily_streak_30", longestDailyStreak >= 30);
  check("daily_streak_100", longestDailyStreak >= 100);

  check("new_year", loggedDates.some((d) => d.slice(5) === "01-01"));
  if (earliestHabit) {
    const daysSinceFirstHabit = daysBetween(localDateOf(earliestHabit), now);
    currentByFamily.set("calendar", daysSinceFirstHabit);
    check("month_one", daysSinceFirstHabit >= 30);
    check("anniversary", daysSinceFirstHabit >= 365);
  }

  const curveSet = new Set(curveTypesUsed);
  currentByFamily.set("explorer", curveSet.size);
  check("explorer_curves", ["linear", "incremental", "exponential"].every((c) => curveSet.has(c)));
  const typeSet = new Set(habitTypesUsed);
  check("explorer_types", typeSet.has("numeric") && typeSet.has("boolean"));
  check("explorer_adaptive", adaptiveUsed);
  check("explorer_relative", relativeUsed);

  check("perfect_day", perfectDay);
  check("perfect_week", perfectWeek);

  check("first_skip", skipUsed);
  check("first_freeze", freezeUsed);

  const alreadyEarnedKeys = new Set(earned.map((a) => a.key));
  const newlyEarned = ACHIEVEMENT_CATALOG.filter((def) => earnedAt.has(def.key) && !alreadyEarnedKeys.has(def.key));

  await Promise.all(newlyEarned.map((def) => recordAchievement(def.key, earnedAt.get(def.key) as string)));

  return {
    progress: ACHIEVEMENT_CATALOG.map((def) => ({
      def,
      earnedAt: earnedAt.get(def.key) ?? null,
      current: def.target !== undefined ? currentByFamily.get(def.family) : undefined,
    })),
    newlyEarned,
  };
}

/** Call this directly from the lost-streak prompt's "Start Again"/"Adjust" handlers when a real streak was forfeited — see HomeScreen. */
export async function recordRestartedStreak(): Promise<void> {
  await recordAchievement("restarted_streak", today());
}
