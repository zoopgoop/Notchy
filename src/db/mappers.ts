import {
  Achievement,
  Category,
  Celebration,
  CelebrationType,
  Direction,
  Habit,
  HabitType,
  FreezeWindow,
  Goal,
  GoalNotificationTime,
  GoalSchedule,
  LoggedEntry,
  SkipLog,
  Streak,
  Tag,
} from "../types";

export interface CategoryRow {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export function rowToCategory(row: CategoryRow): Category {
  return { id: row.id, name: row.name, color: row.color, createdAt: row.created_at };
}

export interface HabitRow {
  id: string;
  category_id: string | null;
  name: string;
  type: string;
  direction: string | null;
  unit_label: string | null;
  created_at: string;
  description: string | null;
  notifications_enabled: number;
  notify_off_schedule: number;
}

export function rowToHabit(row: HabitRow): Habit {
  return {
    id: row.id,
    categoryId: row.category_id ?? undefined,
    name: row.name,
    type: row.type as HabitType,
    direction: (row.direction as Direction) ?? undefined,
    unitLabel: row.unit_label ?? undefined,
    createdAt: row.created_at,
    description: row.description ?? undefined,
    notificationsEnabled: row.notifications_enabled !== 0,
    notifyOffSchedule: row.notify_off_schedule !== 0,
  };
}

export interface GoalRow {
  id: string;
  habit_id: string;
  start_value: number;
  target_value: number | null;
  target_date: string | null;
  curve_type: string;
  adaptive: number;
  progression_mode: string;
  step: number;
  achieved_at: string | null;
  created_at: string;
  active: number;
  on_ice: number;
  restarted_at: string | null;
}

export function rowToGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    habitId: row.habit_id,
    startValue: row.start_value,
    targetValue: row.target_value ?? undefined,
    targetDate: row.target_date ?? undefined,
    curveType: row.curve_type as Goal["curveType"],
    adaptive: !!row.adaptive,
    progressionMode: row.progression_mode as Goal["progressionMode"],
    step: row.step,
    achievedAt: row.achieved_at ?? undefined,
    createdAt: row.created_at,
    active: !!row.active,
    onIce: !!row.on_ice,
    restartedAt: row.restarted_at ?? undefined,
  };
}

export interface LoggedEntryRow {
  id: string;
  goal_id: string;
  date: string;
  actual_value: number | null;
  hit: number;
  generated_target: number;
}

export function rowToLoggedEntry(row: LoggedEntryRow, tagIds: string[]): LoggedEntry {
  return {
    id: row.id,
    goalId: row.goal_id,
    date: row.date,
    actualValue: row.actual_value ?? undefined,
    hit: !!row.hit,
    generatedTarget: row.generated_target,
    tagIds,
  };
}

export interface TagRow {
  id: string;
  label: string;
  is_built_in: number;
}

export function rowToTag(row: TagRow): Tag {
  return { id: row.id, label: row.label, isBuiltIn: !!row.is_built_in };
}

export interface SkipLogRow {
  id: string;
  goal_id: string;
  date: string;
}

export function rowToSkipLog(row: SkipLogRow): SkipLog {
  return { id: row.id, goalId: row.goal_id, date: row.date };
}

export interface FreezeWindowRow {
  id: string;
  goal_id: string;
  start_date: string;
  end_date: string;
}

export function rowToFreezeWindow(row: FreezeWindowRow): FreezeWindow {
  return { id: row.id, goalId: row.goal_id, startDate: row.start_date, endDate: row.end_date };
}

export interface CelebrationRow {
  id: string;
  goal_id: string;
  type: string;
  date: string;
  metadata: string | null;
}

export function rowToCelebration(row: CelebrationRow): Celebration {
  return {
    id: row.id,
    goalId: row.goal_id,
    type: row.type as CelebrationType,
    date: row.date,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}

export interface AchievementRow {
  key: string;
  earned_at: string;
}

export function rowToAchievement(row: AchievementRow): Achievement {
  return { key: row.key, earnedAt: row.earned_at };
}

export interface StreakRow {
  goal_id: string;
  current: number;
  longest: number;
}

export function rowToStreak(row: StreakRow): Streak {
  return { goalId: row.goal_id, current: row.current, longest: row.longest };
}

export interface GoalScheduleRow {
  id: string;
  goal_id: string;
  effective_date: string;
  scheduled_days: string;
}

export function rowToGoalSchedule(row: GoalScheduleRow): GoalSchedule {
  return {
    id: row.id,
    goalId: row.goal_id,
    effectiveDate: row.effective_date,
    scheduledDays: row.scheduled_days.split(",").map((d) => parseInt(d, 10)),
  };
}

export interface GoalNotificationTimeRow {
  goal_id: string;
  day_of_week: number;
  hour: number;
  minute: number;
}

export function rowToGoalNotificationTime(row: GoalNotificationTimeRow): GoalNotificationTime {
  return { goalId: row.goal_id, dayOfWeek: row.day_of_week, hour: row.hour, minute: row.minute };
}
