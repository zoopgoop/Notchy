import * as Haptics from "expo-haptics";

/** A small, single pulse — for routine confirmations like the daily-hit toast. */
export async function lightTap(): Promise<void> {
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** A medium pulse — for UI actions like opening a menu. */
export async function mediumTap(): Promise<void> {
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

/** A heavier double-pulse — for major moments like a goal getting achieved. */
export async function celebrationBurst(): Promise<void> {
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  setTimeout(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, 150);
}
