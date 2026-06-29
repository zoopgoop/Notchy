import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { theme } from "../../theme";
import { LoggedEntry, SkipLog } from "../../types";

/** Fixed, not category-colored — category color is reserved for the multi-habit Calendar tab. */
const LOGGED_COLOR = "#4CAF50";

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Yes/No habits have no progression to chart — this shows the same information
 * a heatmap calendar would: which days in the month were actually logged, laid
 * out as a real calendar month (as many week rows as the month needs). Paged a
 * month at a time, capped so it can't go past the current month.
 */
export function HabitLogCalendar({ entries, skips }: { entries: LoggedEntry[]; skips: SkipLog[] }) {
  const [monthAnchor, setMonthAnchor] = useState(new Date());
  const loggedDates = new Set(entries.map((e) => e.date));
  const skippedDates = new Set(skips.map((s) => s.date));

  const gridStart = startOfWeek(startOfMonth(monthAnchor));
  const gridEnd = endOfWeek(endOfMonth(monthAnchor));
  const weeks = chunk(eachDayOfInterval({ start: gridStart, end: gridEnd }), 7);
  const isCurrentMonth = isSameMonth(monthAnchor, new Date());

  return (
    <View>
      <View style={styles.nav}>
        <Pressable
          style={({ pressed }) => [styles.navButton, pressed && styles.navButtonPressed]}
          onPress={() => setMonthAnchor((m) => subMonths(m, 1))}
        >
          <Text style={styles.navButtonText}>‹</Text>
        </Pressable>
        <Text style={styles.rangeLabel}>{format(monthAnchor, "MMMM yyyy")}</Text>
        <Pressable
          style={({ pressed }) => [
            styles.navButton,
            isCurrentMonth && styles.navButtonDisabled,
            pressed && !isCurrentMonth && styles.navButtonPressed,
          ]}
          onPress={() => !isCurrentMonth && setMonthAnchor((m) => addMonths(m, 1))}
          disabled={isCurrentMonth}
        >
          <Text style={styles.navButtonText}>›</Text>
        </Pressable>
      </View>
      <View style={styles.grid}>
        {weeks.map((week, i) => (
          <View key={i} style={styles.week}>
            {week.map((date) => {
              const dateStr = format(date, "yyyy-MM-dd");
              return (
                <View
                  key={dateStr}
                  style={[
                    styles.cell,
                    loggedDates.has(dateStr)
                      ? { backgroundColor: LOGGED_COLOR }
                      : skippedDates.has(dateStr)
                        ? styles.cellSkipped
                        : styles.cellEmpty,
                    !isSameMonth(date, monthAnchor) && styles.cellOutsideMonth,
                  ]}
                />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  navButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  navButtonPressed: {
    opacity: 0.6,
  },
  navButtonDisabled: {
    opacity: 0.25,
  },
  navButtonText: {
    color: theme.primary,
    fontSize: 20,
    fontWeight: "700",
  },
  rangeLabel: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  grid: {
    gap: 8,
  },
  week: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  cell: {
    aspectRatio: 1,
    borderRadius: 8,
    flex: 1,
  },
  cellEmpty: {
    backgroundColor: theme.surfaceAlt,
  },
  cellSkipped: {
    backgroundColor: theme.textMuted,
  },
  cellOutsideMonth: {
    opacity: 0.3,
  },
});
