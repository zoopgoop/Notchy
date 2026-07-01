import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { DailyGoalView } from "./dailyGoals";
import { listGoalNotificationTimes } from "../db/repositories";
import { formatNumber, unitSuffix } from "../utils/format";
import CountdownNotification from "countdown-notification";

const CHANNEL_ID = "daily-targets";

/** Fixed, non-configurable run from 10:30pm to midnight — Duolingo-style streak countdown. */
const COUNTDOWN_SLOTS = [
  { hour: 22, minute: 30, minutesLeft: 90 },
  { hour: 23, minute: 0, minutesLeft: 60 },
  { hour: 23, minute: 30, minutesLeft: 30 },
  { hour: 23, minute: 50, minutesLeft: 10 },
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
  // Cancel any previously scheduled slots (both native and legacy expo-notifications).
  COUNTDOWN_SLOTS.forEach((_, i) => {
    CountdownNotification.cancelCountdownNotification(i);
    Notifications.cancelScheduledNotificationAsync(countdownId(i)).catch(() => {});
  });
  if (pending.length === 0) return;

  const urgentCount = pending.filter((item) => item.isUrgentToday).length;
  const now = new Date();

  const body =
    urgentCount > 0
      ? urgentCount === 1
        ? "Complete a check-in today to keep your streak alive!"
        : `Complete a check-in on ${urgentCount} habits today to keep their streaks alive!`
      : `${pending.length} ${pending.length === 1 ? "goal" : "goals"} still need logging before today resets.`;

  // Midnight tonight — the timer counts down to this moment.
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);

  COUNTDOWN_SLOTS.forEach((slot, i) => {
    const fireDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), slot.hour, slot.minute, 0, 0);
    if (fireDate.getTime() <= now.getTime()) return;
    CountdownNotification.scheduleCountdownNotification({
      notificationId: i,
      hour: slot.hour,
      minute: slot.minute,
      targetEpochMs: midnight.getTime(),
      title: `${slot.minutesLeft} minutes left today`,
      body,
    });
  });
}

function initialNotificationId(goalId: string): string {
  return `initial-${goalId}`;
}

const STREAK_MILESTONES = new Set([7, 14, 30, 50, 100, 250, 500, 1000, 2500, 5000]);

function buildInitialNotification(view: DailyGoalView): { title: string; body: string } {
  const name = view.habit.name;
  const streak = view.streak.current;

  if (view.isCrisis) {
    return {
      title: "Streak SOS",
      body: `${name} needs attention — use a skip to rescue your ${streak}-day streak.`,
    };
  }

  if (view.isUrgentToday) {
    return {
      title: "Last chance today",
      body: streak > 0
        ? `Log ${name} now to keep your ${streak}-day streak alive!`
        : `Log ${name} today — it's your last chance to hit this week's quota.`,
    };
  }

  if (view.isOverdue) {
    return {
      title: "Overdue!",
      body: `You're behind on ${name} this week — check in today to catch up.`,
    };
  }

  if (view.daysUntilTarget !== null && view.daysUntilTarget >= 0 && view.daysUntilTarget <= 7) {
    const days = view.daysUntilTarget;
    const countdown = days === 0 ? "Last day!" : `${days} ${days === 1 ? "day" : "days"} left.`;
    return {
      title: "Final countdown",
      body: `${countdown} Give ${name} everything you've got.`,
    };
  }

  if (STREAK_MILESTONES.has(streak)) {
    return {
      title: `${streak}-day streak!`,
      body: `Incredible consistency on ${name}. Let's make it ${streak + 1}.`,
    };
  }

  const targetPart =
    view.habit.type !== "boolean" && view.status.kind === "pending"
      ? ` Your target is ${formatNumber(view.status.target)}${unitSuffix(view.habit.unitLabel)}.`
      : "";
  const streakPart = streak > 0 ? ` You're on a ${streak}-day streak!` : "";

  return {
    title: "Time to check in",
    body: `Let's check in for ${name}!${targetPart}${streakPart}`,
  };
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
      // For overdue items on non-scheduled days, use the most recently missed scheduled day's time.
      const todayTime = times.find((t) => t.dayOfWeek === dayOfWeek);
      // If today isn't a scheduled day and the user has opted out of off-schedule notifications, skip.
      if (!todayTime && !view.goal.notifyOffSchedule) return;
      const overdueTime = view.overdueNotificationDayOfWeek !== null
        ? times.find((t) => t.dayOfWeek === view.overdueNotificationDayOfWeek)
        : undefined;
      const time = todayTime ?? overdueTime ?? { hour: 9, minute: 0 };
      const fireDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), time.hour, time.minute, 0, 0);
      if (fireDate.getTime() <= now.getTime()) return;

      const { title, body } = buildInitialNotification(view);
      await Notifications.scheduleNotificationAsync({
        identifier: initialNotificationId(view.goal.id),
        content: { title, body },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireDate },
      });
    })
  );
}

/** Cancels the initial reminder for a specific goal — call this before deleting a goal or habit so the OS notification doesn't outlive the DB record. */
export async function cancelGoalNotifications(goalId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(initialNotificationId(goalId)).catch(() => {});
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
