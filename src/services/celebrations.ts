import { isHit, requireDirection } from "../engine/curves";
import { Celebration, CelebrationType, Habit, Goal, LoggedEntry, Streak } from "../types";
import { createCelebration, listEntriesByGoal, markGoalAchieved } from "../db/repositories";

const STREAK_MILESTONES = [7, 30, 100, 250, 500, 1000];

/** Highest-impact celebration wins when several fire at once — used to pick the one overlay to show. */
const TIER: Record<CelebrationType, number> = {
  goal_achieved: 4,
  streak_milestone: 3,
  personal_best: 2,
  comeback: 2,
  daily_hit: 1,
};

export function pickPrimaryCelebration(celebrations: Celebration[]): Celebration | null {
  if (celebrations.length === 0) return null;
  return celebrations.reduce((best, c) => (TIER[c.type] > TIER[best.type] ? c : best));
}

async function isPersonalBest(goal: Goal, habit: Habit, entry: LoggedEntry): Promise<boolean> {
  if (habit.type === "boolean" || entry.actualValue === undefined) return false;
  const direction = requireDirection(habit);
  const allEntries = await listEntriesByGoal(goal.id);
  const priorValues = allEntries
    .filter((e): e is LoggedEntry & { actualValue: number } => e.id !== entry.id && e.actualValue !== undefined)
    .map((e) => e.actualValue);
  if (priorValues.length === 0) return false;
  return direction === "increasing"
    ? entry.actualValue > Math.max(...priorValues)
    : entry.actualValue < Math.min(...priorValues);
}

function isGoalAchieved(goal: Goal, habit: Habit, entry: LoggedEntry): boolean {
  // Goalless habits have nothing to "achieve" — they just run forever.
  if (goal.achievedAt || habit.type === "boolean" || entry.actualValue === undefined) return false;
  if (goal.targetValue === undefined) return false;
  return isHit(requireDirection(habit), entry.actualValue, goal.targetValue);
}

async function isComeback(goal: Goal, entry: LoggedEntry): Promise<boolean> {
  if (!entry.hit) return false;
  const allEntries = await listEntriesByGoal(goal.id);
  const index = allEntries.findIndex((e) => e.id === entry.id);
  const previous = allEntries[index - 1];
  return previous !== undefined && !previous.hit;
}

/**
 * Runs every detection rule for one freshly-logged entry and persists whichever fire.
 * Multiple can fire on the same entry (e.g. a personal best that also completes the
 * goal) — all get recorded for the trophy case, even though the UI will only surface
 * the single highest-tier one via `pickPrimaryCelebration`.
 */
export async function detectAndRecordCelebrations(
  goal: Goal,
  habit: Habit,
  entry: LoggedEntry,
  streak: Streak
): Promise<Celebration[]> {
  const types: CelebrationType[] = [];

  if (entry.hit) types.push("daily_hit");
  if (await isPersonalBest(goal, habit, entry)) types.push("personal_best");
  if (isGoalAchieved(goal, habit, entry)) types.push("goal_achieved");
  if (STREAK_MILESTONES.includes(streak.current)) types.push("streak_milestone");
  if (await isComeback(goal, entry)) types.push("comeback");

  if (types.includes("goal_achieved")) {
    await markGoalAchieved(goal.id, entry.date);
  }

  return Promise.all(
    types.map((type) => {
      let metadata: Record<string, number | string> | undefined;
      if (type === "streak_milestone") {
        metadata = { streak: streak.current };
      } else if (type === "goal_achieved" && goal.targetValue !== undefined) {
        metadata = { targetValue: goal.targetValue };
        if (goal.targetDate) metadata.targetDate = goal.targetDate;
      }
      return createCelebration({ goalId: goal.id, type, date: entry.date, metadata });
    })
  );
}
