import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { AutoSavedStreak, autoApplyCrisisSkipsIfNeeded, loadDailyGoalViews } from "./dailyGoals";
import { notifyAutoSavedStreaks, scheduleAllDailyNotifications } from "./notifications";

export const DAILY_NOTIFICATIONS_TASK = "daily-notifications-refresh";

/**
 * Must run at module load, outside any component — the OS can invoke this task in a
 * headless JS context where App.tsx never mounts, so the definition has to exist
 * before that happens. Registered from index.ts, not App.tsx.
 *
 * Also auto-applies crisis skips here, not just from HomeScreen — a goal whose week becomes
 * mathematically unreachable shouldn't stay silently at risk just because nobody happened to
 * open the app that day. Deliberately NOT mirrored here: forfeiting a streak that can't be
 * saved even with skips. That stays foreground-only, tied to the user actually seeing
 * StreakLostPrompt, rather than being decided silently while the app is closed.
 */
TaskManager.defineTask(DAILY_NOTIFICATIONS_TASK, async () => {
  try {
    let views = await loadDailyGoalViews();
    const saved: AutoSavedStreak[] = [];
    for (const view of views) {
      const result = await autoApplyCrisisSkipsIfNeeded(view);
      if (result) saved.push(result);
    }
    if (saved.length > 0) {
      views = await loadDailyGoalViews();
      await notifyAutoSavedStreaks(saved);
    }
    await scheduleAllDailyNotifications(views);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Best-effort: the OS decides the real interval and can defer this well past `minimumInterval`. */
export async function registerBackgroundNotificationTask(): Promise<void> {
  await BackgroundTask.registerTaskAsync(DAILY_NOTIFICATIONS_TASK, {
    minimumInterval: 60,
  });
}
