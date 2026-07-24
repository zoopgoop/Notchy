import { useCallback, useEffect, useRef, useState } from "react";
import { today } from "../engine/dateUtils";
import { AchievementDef, evaluateAchievements } from "../services/achievements";
import { DailyGoalView, loadDailyGoalViews } from "../services/dailyGoals";
import { scheduleAllDailyNotifications } from "../services/notifications";

/**
 * Every `refetch` (including the initial load) also reschedules notifications — they must
 * always reflect today's latest state, not just whatever was true the last time the app was
 * opened — and re-evaluates achievements. That second part is deliberately here rather than
 * in each individual action handler (log, skip, freeze, restart, ...): this hook's refetch
 * already runs after every one of them (directly, or via Home's useFocusEffect on return from
 * another screen), so routing achievement checks through here means a newly-added action gets
 * covered automatically instead of relying on remembering to wire it in each time.
 */
export function useDailyGoals() {
  const [items, setItems] = useState<DailyGoalView[]>([]);
  const [loading, setLoading] = useState(true);
  const [newlyEarnedAchievements, setNewlyEarnedAchievements] = useState<AchievementDef[]>([]);
  // Home fires refetch() from many places (skip, log, focus, crisis detection, ...) — two
  // calls can overlap, and without this guard the one that happens to *resolve* last wins
  // even if it was the older, now-stale request. That let a just-applied skip/log briefly
  // (or not-so-briefly) get overwritten by a slower in-flight refetch that started before it,
  // showing pre-action state again until something else happened to trigger another refetch.
  const requestId = useRef(0);

  const refetch = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const views = await loadDailyGoalViews(today());
      if (id !== requestId.current) return;
      setItems(views);
      scheduleAllDailyNotifications(views);
      const { newlyEarned } = await evaluateAchievements();
      if (id !== requestId.current) return;
      if (newlyEarned.length > 0) setNewlyEarnedAchievements(newlyEarned);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  const clearNewlyEarnedAchievements = useCallback(() => setNewlyEarnedAchievements([]), []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { items, loading, refetch, newlyEarnedAchievements, clearNewlyEarnedAchievements };
}
