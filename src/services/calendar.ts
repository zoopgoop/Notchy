import { getCategory, getHabit, listAllGoals, listEntriesInRange, listSkipsInRange } from "../db/repositories";
import { requireDirection } from "../engine/curves";
import { UNCATEGORIZED_COLOR } from "../theme";
import { Category, HabitType } from "../types";
import { computeCloseness } from "../utils/closeness";

export interface DayBlob {
  goalId: string;
  habitName: string;
  habitType: HabitType;
  kind: "logged" | "skipped";
  /** The habit's category color — blob/dot fill. Status (done/skipped) is conveyed separately via `kind`. */
  color: string;
  closeness: number;
  hit: boolean;
  actualValue?: number;
  unitLabel?: string;
}

/** Keyed by "YYYY-MM-DD". Every entry and skip in range — logged ones sized by closeness-to-target. */
export async function loadCalendarRange(
  startDate: string,
  endDate: string
): Promise<Map<string, DayBlob[]>> {
  const [entries, skips, goals] = await Promise.all([
    listEntriesInRange(startDate, endDate),
    listSkipsInRange(startDate, endDate),
    listAllGoals(),
  ]);

  const goalsById = new Map(goals.map((g) => [g.id, g]));
  const relevantGoalIds = [...new Set([...entries.map((e) => e.goalId), ...skips.map((s) => s.goalId)])];
  const habitIds = [
    ...new Set(relevantGoalIds.map((id) => goalsById.get(id)?.habitId).filter((id): id is string => !!id)),
  ];
  const habits = await Promise.all(habitIds.map((id) => getHabit(id)));
  const habitsById = new Map(habits.filter((h) => h !== null).map((h) => [h.id, h]));

  const categoryIds = [
    ...new Set([...habitsById.values()].map((h) => h.categoryId).filter((id): id is string => !!id)),
  ];
  const categories = await Promise.all(categoryIds.map((id) => getCategory(id)));
  const categoriesById = new Map(categories.filter((c): c is Category => c !== null).map((c) => [c.id, c]));

  const byDate = new Map<string, DayBlob[]>();

  function addBlob(date: string, blob: DayBlob) {
    byDate.set(date, [...(byDate.get(date) ?? []), blob]);
  }

  for (const entry of entries) {
    const goal = goalsById.get(entry.goalId);
    const habit = goal ? habitsById.get(goal.habitId) : undefined;
    if (!goal || !habit) continue;
    const color = habit.categoryId ? categoriesById.get(habit.categoryId)?.color ?? UNCATEGORIZED_COLOR : UNCATEGORIZED_COLOR;

    const closeness =
      habit.type === "boolean"
        ? entry.hit
          ? 1
          : 0
        : computeCloseness(requireDirection(habit), entry.actualValue ?? 0, entry.generatedTarget);

    addBlob(entry.date, {
      goalId: goal.id,
      habitName: habit.name,
      habitType: habit.type,
      kind: "logged",
      color,
      closeness,
      hit: entry.hit,
      actualValue: entry.actualValue,
      unitLabel: habit.unitLabel,
    });
  }

  for (const skip of skips) {
    const goal = goalsById.get(skip.goalId);
    const habit = goal ? habitsById.get(goal.habitId) : undefined;
    if (!goal || !habit) continue;
    const color = habit.categoryId ? categoriesById.get(habit.categoryId)?.color ?? UNCATEGORIZED_COLOR : UNCATEGORIZED_COLOR;

    addBlob(skip.date, {
      goalId: goal.id,
      habitName: habit.name,
      habitType: habit.type,
      kind: "skipped",
      color,
      closeness: 1,
      hit: false,
      unitLabel: habit.unitLabel,
    });
  }

  return byDate;
}
