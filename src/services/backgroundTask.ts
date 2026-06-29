import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { loadDailyGoalViews } from "./dailyGoals";
import { scheduleAllDailyNotifications } from "./notifications";

export const DAILY_NOTIFICATIONS_TASK = "daily-notifications-refresh";

/**
 * Must run at module load, outside any component — the OS can invoke this task in a
 * headless JS context where App.tsx never mounts, so the definition has to exist
 * before that happens. Registered from index.ts, not App.tsx.
 */
TaskManager.defineTask(DAILY_NOTIFICATIONS_TASK, async () => {
  try {
    const views = await loadDailyGoalViews();
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
