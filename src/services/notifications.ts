import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { DailyGoalView } from "./dailyGoals";
import { listGoalNotificationTimes } from "../db/repositories";
import { formatNumber, unitSuffix } from "../utils/format";

const CHANNEL_ID = "daily-targets";

/** Fixed, non-configurable run from 10:30pm to midnight — Duolingo-style streak countdown. */
const COUNTDOWN_SLOTS = [
  { hour: 22, minute: 30, minutesLeft: 90 },
  { hour: 23, minute: 0, minutesLeft: 60 },
  { hour: 23, minute: 30, minutesLeft: 30 },
];

function countdownId(index: number): string {
  return `countdown-${index}`;
}

/** Sets up Android's notification channel and how notifications behave while the app is foregrounded. */
export async function configureNotifications(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Daily targets",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

async function scheduleCountdownNotifications(pending: DailyGoalView[]): Promise<void> {
  await Promise.all(
    COUNTDOWN_SLOTS.map((_, i) => Notifications.cancelScheduledNotificationAsync(countdownId(i)).catch(() => {}))
  );
  if (pending.length === 0) return;

  const urgentCount = pending.filter((item) => item.isUrgentToday).length;
  const now = new Date();

  const body =
    urgentCount > 0
      ? urgentCount === 1
        ? "Complete a check-in today to keep your streak alive!"
        : `Complete a check-in on ${urgentCount} habits today to keep their streaks alive!`
      : `${pending.length} ${pending.length === 1 ? "goal" : "goals"} still need logging before today resets.`;

  await Promise.all(
    COUNTDOWN_SLOTS.map(async (slot, i) => {
      const fireDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), slot.hour, slot.minute, 0, 0);
      if (fireDate.getTime() <= now.getTime()) return;
      await Notifications.scheduleNotificationAsync({
        identifier: countdownId(i),
        content: {
          title: `${slot.minutesLeft} minutes left today`,
          body,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireDate },
      });
    })
  );
}

function initialNotificationId(goalId: string): string {
  return `initial-${goalId}`;
}

/** "HabitName: 5 km" for numeric habits with a pending target today, just the name for boolean ones. */
function formatPendingTarget(view: DailyGoalView): string {
  if (view.status.kind !== "pending" || view.habit.type === "boolean") return view.habit.name;
  return `${view.habit.name}: ${formatNumber(view.status.target)}${unitSuffix(view.habit.unitLabel)}`;
}

/** Names the pending target, and calls out the streak at stake, if any, for encouragement. */
function buildInitialNotificationBody(view: DailyGoalView): string {
  const target = formatPendingTarget(view);
  if (view.streak.current === 0) return `${target}.`;
  return `${target}. Extend your ${view.streak.current}-day streak!`;
}

/**
 * One notification per still-pending habit, each at the per-day-of-week time configured on
 * that habit (in its creation/edit form or its schedule editor) — separate from the fixed
 * end-of-day countdown above. `items` is every active goal, not just pending ones, so that
 * cancelling covers goals that were pending before but got logged, skipped, or unscheduled
 * since the last run.
 */
async function scheduleInitialNotifications(items: DailyGoalView[], pending: DailyGoalView[]): Promise<void> {
  await Promise.all(
    items.map((item) => Notifications.cancelScheduledNotificationAsync(initialNotificationId(item.goal.id)).catch(() => {}))
  );

  const now = new Date();
  const dayOfWeek = now.getDay();

  await Promise.all(
    pending.map(async (view) => {
      const times = await listGoalNotificationTimes(view.goal.id);
      const time = times.find((t) => t.dayOfWeek === dayOfWeek) ?? { hour: 9, minute: 0 };
      const fireDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), time.hour, time.minute, 0, 0);
      if (fireDate.getTime() <= now.getTime()) return;

      await Notifications.scheduleNotificationAsync({
        identifier: initialNotificationId(view.goal.id),
        content: {
          title: "Time to check in",
          body: buildInitialNotificationBody(view),
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireDate },
      });
    })
  );
}

/**
 * Re-evaluates today's countdown run and initial reminders together. Always cancels and
 * redoes every slot rather than diffing — cheap, and avoids leaving a stale slot scheduled
 * after a goal gets logged or skipped.
 */
export async function scheduleAllDailyNotifications(items: DailyGoalView[]): Promise<void> {
  const pending = items.filter((item) => item.status.kind === "pending" && item.dueToday);
  await Promise.all([scheduleCountdownNotifications(pending), scheduleInitialNotifications(items, pending)]);
}
