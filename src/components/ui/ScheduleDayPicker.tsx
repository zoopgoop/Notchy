import { DayNotificationTimes, DayTime } from "./DayNotificationTimes";
import { DayOfWeekPicker } from "./DayOfWeekPicker";
import { HintText } from "./FormField";

/**
 * The day-selection + per-day reminder-time pair, identical everywhere a goal's
 * schedule is set (habit creation/edit, a fresh goal, or the schedule editor) —
 * one place for that pairing instead of three copies drifting apart.
 */
export function ScheduleDayPicker({
  days,
  onChangeDays,
  times,
  onChangeTime,
  disabled,
}: {
  days: number[];
  onChangeDays: (days: number[]) => void;
  times: Record<number, DayTime>;
  onChangeTime: (day: number, time: DayTime) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <DayOfWeekPicker value={days} onChange={onChangeDays} disabled={disabled} />
      <DayNotificationTimes selectedDays={days} times={times} onChange={onChangeTime} disabled={disabled} />
      {days.length === 0 && <HintText danger>Pick at least one day.</HintText>}
    </>
  );
}
