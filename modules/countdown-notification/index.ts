import { requireNativeModule } from "expo";

export type CountdownSlot = {
  notificationId: number;
  hour: number;
  minute: number;
  targetEpochMs: number;
  title: string;
};

interface CountdownNotificationModule {
  scheduleCountdownNotification(slot: CountdownSlot): void;
  cancelCountdownNotification(notificationId: number): void;
  dismissCountdownNotification(): void;
  canScheduleExactAlarms(): boolean;
}

// requireNativeModule throws if the native side isn't found (e.g. in tests).
// Callers should guard with a try/catch if needed.
export default requireNativeModule<CountdownNotificationModule>("CountdownNotification");
