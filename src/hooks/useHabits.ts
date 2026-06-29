import { useCallback, useEffect, useState } from "react";
import { Habit } from "../types";
import { listHabitsByCategory, listHabitsWithoutCategory } from "../db/repositories";

/** Pass undefined for the "Uncategorized" pseudo-category — lists habits with no category at all. */
export function useHabits(categoryId: string | undefined) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      setHabits(categoryId ? await listHabitsByCategory(categoryId) : await listHabitsWithoutCategory());
    } finally {
      setLoading(false);
    }
  }, [categoryId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { habits, loading, refetch };
}
