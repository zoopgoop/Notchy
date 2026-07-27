import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { DailyGoalView } from "./dailyGoals";
import { listGoalNotificationTimes } from "../db/repositories";
import { formatNumber, unitSuffix } from "../utils/format";
let CountdownNotification: typeof import("countdown-notification").default | null = null;
try {
  CountdownNotification = require("countdown-notification").default;
} catch {
  // Native module unavailable (e.g. running in test environment) — fall back to expo-notifications.
}

const CHANNEL_ID = "daily-targets";

// scheduleAllDailyNotifications can be, and is, called again before a prior call's own async
// work (cancel-then-reschedule, several awaits deep) has finished — refetch() fires from many
// places (log, skip, focus, ...) without waiting for the previous one's notification scheduling
// to settle. Without this guard, an older call's stale "this goal is still pending" view could
// finish scheduling *after* a newer call had already correctly cancelled it, silently
// re-adding a notification for something you'd just logged. Cancelling redundantly is harmless,
// so only the final schedule calls below check this — not every cancel along the way.
let notificationGeneration = 0;

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

/** Shows an explanation then opens Alarms & Reminders settings on Android 12+ so the user can grant exact alarm permission. */
export async function requestExactAlarmPermission(): Promise<void> {
  if (Platform.OS !== "android") return;
  const cdn = CountdownNotification;
  if (cdn?.canScheduleExactAlarms()) return;
  const { Alert, Linking } = await import("react-native");
  Alert.alert(
    "Enable exact reminders",
    "Notchy needs permission to fire reminders at precise times.",
    [
      { text: "Not now", style: "cancel" },
      {
        text: "Allow",
        onPress: async () => {
          try {
            await Linking.sendIntent("android.settings.REQUEST_SCHEDULE_EXACT_ALARM");
          } catch {
            // Older Android — permission is auto-granted, nothing to do.
          }
        },
      },
    ]
  );
}

async function scheduleCountdownNotifications(pending: DailyGoalView[], generation: number): Promise<void> {
  // Cancel all previously scheduled slots.
  COUNTDOWN_SLOTS.forEach((_, i) => {
    CountdownNotification?.cancelCountdownNotification(i);
    Notifications.cancelScheduledNotificationAsync(countdownId(i)).catch(() => {});
  });
  if (pending.length === 0) return;

  const now = new Date();

  // Pick only the next upcoming slot — the Chronometer ticks by itself until midnight so we
  // don't need to re-fire. If the user dismisses and opens the app, scheduling runs again and
  // picks whichever slot is next at that point.
  const slotIndex = COUNTDOWN_SLOTS.findIndex((slot) => {
    const fireDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), slot.hour, slot.minute, 0, 0);
    return fireDate.getTime() > now.getTime();
  });
  if (slotIndex === -1) return;

  const slot = COUNTDOWN_SLOTS[slotIndex];
  const fireDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), slot.hour, slot.minute, 0, 0);

  const urgentCount = pending.filter((item) => item.isUrgentToday).length;
  const n = pending.length;
  const title =
    urgentCount > 0
      ? urgentCount === 1
        ? "Complete a check-in to keep your streak alive!"
        : `Complete check-ins on ${urgentCount} habits to keep their streaks alive!`
      : `${n} ${n === 1 ? "habit" : "habits"} still ${n === 1 ? "needs" : "need"} logging tonight!`;

  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);

  // A newer call has since started (and already cancelled these slots with fresher data) —
  // committing this stale schedule now would silently resurrect a notification for something
  // that's since been logged, skipped, or otherwise changed.
  if (generation !== notificationGeneration) return;

  const cdn = CountdownNotification;
  if (cdn) {
    try {
      cdn.scheduleCountdownNotification({
        notificationId: slotIndex,
        hour: slot.hour,
        minute: slot.minute,
        targetEpochMs: midnight.getTime(),
        title,
      });
      return;
    } catch (e) {
      console.warn("CountdownNotification native module failed, falling back to expo-notifications:", e);
    }
  }

  await Notifications.scheduleNotificationAsync({
    identifier: countdownId(slotIndex),
    content: { title, body: `${slot.minutesLeft} minutes left until midnight.` },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireDate },
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
    return view.skipsRemaining >= view.skipsNeededToSave
      ? {
          title: "Streak SOS",
          body: `${name} needs attention — use a skip to rescue your ${streak}-day streak.`,
        }
      : {
          title: "Streak lost",
          body: `${name}'s streak got away from you. Start over?`,
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
async function scheduleInitialNotifications(
  items: DailyGoalView[],
  pending: DailyGoalView[],
  generation: number
): Promise<void> {
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
      // listGoalNotificationTimes above is a real DB round-trip a newer call could easily
      // finish first — re-check right before actually committing the schedule.
      if (generation !== notificationGeneration) return;
      await Notifications.scheduleNotificationAsync({
        identifier: initialNotificationId(view.goal.id),
        content: { title, body },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireDate },
      });
    })
  );
}

/** Clears all active Notchy notifications from the shade when the user opens the app. */
export function dismissAllActiveNotifications(): void {
  CountdownNotification?.dismissCountdownNotification();
  Notifications.dismissAllNotificationsAsync().catch(() => {});
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
  const generation = ++notificationGeneration;
  // Goals on ice get no notifications of any kind, indefinitely — the user explicitly
  // dismissed the lost-streak/quota-gone prompt, so nagging further would just be noise.
  // Logging or adjusting the goal takes it off ice and this resumes on the next run.
  const pendingDueToday = items.filter(
    (item) => item.status.kind === "pending" && item.dueToday && !item.isOnIce
  );
  // Overdue items that aren't scheduled today — eligible for off-schedule reminders but never a countdown.
  const pendingOverdue = items.filter(
    (item) => item.status.kind === "pending" && !item.dueToday && item.isOverdue && !item.isOnIce
  );
  await Promise.all([
    scheduleCountdownNotifications(pendingDueToday, generation),
    scheduleInitialNotifications(items, [...pendingDueToday, ...pendingOverdue], generation),
  ]);
}
