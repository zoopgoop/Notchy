import { useCallback, useEffect, useState } from "react";
import { today } from "../engine/dateUtils";
import { DailyGoalView, loadDailyGoalViews } from "../services/dailyGoals";
import { scheduleAllDailyNotifications } from "../services/notifications";

/** Every `refetch` (including the initial load) also reschedules notifications — they must always reflect today's latest state, not just whatever was true the last time the app was opened. */
export function useDailyGoals() {
  const [items, setItems] = useState<DailyGoalView[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const views = await loadDailyGoalViews(today());
      setItems(views);
      scheduleAllDailyNotifications(views);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { items, loading, refetch };
}
