import { addDays, today } from "../engine/dateUtils";
import { listActiveGoals, listEntriesByGoal, listFreezeWindowsByGoal, listSkipsByGoal } from "../db/repositories";

export interface WeeklySummary {
  totalHits: number;
  totalPossible: number;
  bestDay: { date: string; hits: number } | null;
}

const WINDOW_DAYS = 7;

/** Hit-rate and best day over the trailing 7 days across every active goal. */
export async function loadWeeklySummary(asOfDate: string = today()): Promise<WeeklySummary> {
  const goals = await listActiveGoals();
  const dates: string[] = [];
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    dates.push(addDays(asOfDate, -i));
  }

  const hitsByDate = new Map<string, number>(dates.map((date) => [date, 0]));
  let totalHits = 0;
  let totalPossible = 0;

  for (const goal of goals) {
    const [entries, skips, freezeWindows] = await Promise.all([
      listEntriesByGoal(goal.id),
      listSkipsByGoal(goal.id),
      listFreezeWindowsByGoal(goal.id),
    ]);
    const entryByDate = new Map(entries.map((entry) => [entry.date, entry]));
    const skipDates = new Set(skips.map((skip) => skip.date));
    const createdDate = goal.createdAt.slice(0, 10);

    for (const date of dates) {
      if (date < createdDate) continue;
      const isFrozen = freezeWindows.some((f) => f.startDate <= date && f.endDate >= date);
      if (isFrozen || skipDates.has(date)) continue;

      totalPossible += 1;
      if (entryByDate.get(date)?.hit) {
        totalHits += 1;
        hitsByDate.set(date, (hitsByDate.get(date) ?? 0) + 1);
      }
    }
  }

  let bestDay: { date: string; hits: number } | null = null;
  for (const [date, hits] of hitsByDate) {
    if (hits > 0 && (!bestDay || hits > bestDay.hits)) {
      bestDay = { date, hits };
    }
  }

  return { totalHits, totalPossible, bestDay };
}
