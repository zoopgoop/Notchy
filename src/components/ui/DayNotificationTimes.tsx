import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { theme } from "../../theme";
import { GoalNotificationTime } from "../../types";

const DEFAULT_TIME: DayTime = { hour: 9, minute: 0 };

export interface DayTime {
  hour: number;
  minute: number;
}

/** Saved rows -> a day-of-week-keyed map, for feeding into <DayNotificationTimes>. */
export function notificationTimesToMap(times: GoalNotificationTime[]): Record<number, DayTime> {
  return Object.fromEntries(times.map((t) => [t.dayOfWeek, { hour: t.hour, minute: t.minute }]));
}

/** The map back into rows scoped to `goalId`, for the days actually selected — ready to persist. */
export function notificationTimesFromMap(
  goalId: string,
  days: number[],
  map: Record<number, DayTime>
): GoalNotificationTime[] {
  return days.map((day) => ({ goalId, dayOfWeek: day, ...(map[day] ?? DEFAULT_TIME) }));
}

function timeToDate(time: DayTime): Date {
  const date = new Date();
  date.setHours(time.hour, time.minute, 0, 0);
  return date;
}

/** "9am" / "9:30pm" — compact enough to sit in a chip-width column. */
function formatCompact(time: DayTime): string {
  const period = time.hour >= 12 ? "pm" : "am";
  const displayHour = time.hour % 12 === 0 ? 12 : time.hour % 12;
  return time.minute === 0 ? `${displayHour}${period}` : `${displayHour}:${String(time.minute).padStart(2, "0")}${period}`;
}

/**
 * One compact time chip per day, column-aligned directly under DayOfWeekPicker's
 * chips — darkened and non-interactive wherever that day isn't selected, mirroring
 * DayOfWeekPicker's own selected/unselected styling.
 */
export function DayNotificationTimes({
  selectedDays,
  times,
  onChange,
}: {
  selectedDays: number[];
  times: Record<number, DayTime>;
  onChange: (day: number, time: DayTime) => void;
}) {
  const [openDay, setOpenDay] = useState<number | null>(null);

  return (
    <View style={styles.row}>
      {[0, 1, 2, 3, 4, 5, 6].map((day) => {
        const active = selectedDays.includes(day);
        const time = times[day] ?? DEFAULT_TIME;
        return (
          <Pressable
            key={day}
            style={[styles.chip, !active && styles.chipMuted]}
            onPress={() => active && setOpenDay(day)}
          >
            <Text style={[styles.chipText, !active && styles.chipTextMuted]}>{formatCompact(time)}</Text>
            {active && openDay === day && (
              <DateTimePicker
                value={timeToDate(time)}
                mode="time"
                onChange={(_, date) => {
                  setOpenDay(null);
                  if (date) onChange(day, { hour: date.getHours(), minute: date.getMinutes() });
                }}
              />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 6,
    justifyContent: "space-between",
    marginTop: 8,
  },
  chip: {
    alignItems: "center",
    backgroundColor: theme.primary,
    borderRadius: 12,
    height: 24,
    justifyContent: "center",
    width: 36,
  },
  chipMuted: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
  },
  chipText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "700",
  },
  chipTextMuted: {
    color: theme.textMuted,
  },
});
