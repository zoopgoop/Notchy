import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PageTitle, Screen } from "../../components/ui/Screen";
import { useCalendarMonth, CalendarDay } from "../../hooks/useCalendarMonth";
import { theme } from "../../theme";
import { formatNumber, unitSuffix } from "../../utils/format";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function opacityForCloseness(closeness: number): number {
  return Math.max(0.3, Math.min(closeness, 1));
}

function sizeForCloseness(closeness: number): number {
  const minSize = 6;
  const maxSize = 11;
  return minSize + (maxSize - minSize) * Math.min(closeness, 1);
}

export function CalendarScreen() {
  const { days, monthLabel, goToPreviousMonth, goToNextMonth, refetch } = useCalendarMonth();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const weeks = chunk(days, 7);
  const selectedDay = days.find((d) => d.date === selectedDate) ?? null;

  return (
    <Screen scroll={false}>
      <View style={styles.centerWrap}>
        <PageTitle subtitle="Tap a day to see what you logged.">Calendar</PageTitle>
        <View style={styles.header}>
          <Pressable onPress={goToPreviousMonth} style={styles.navButton}>
            <Text style={styles.navButtonText}>‹</Text>
          </Pressable>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <Pressable onPress={goToNextMonth} style={styles.navButton}>
            <Text style={styles.navButtonText}>›</Text>
          </Pressable>
        </View>

        <View style={styles.weekdayRow}>
          {WEEKDAY_LABELS.map((label, i) => (
            <Text key={i} style={styles.weekdayLabel}>
              {label}
            </Text>
          ))}
        </View>

        {weeks.map((week, weekIndex) => (
          <View key={weekIndex} style={styles.weekRow}>
            {week.map((day) => (
              <DayCell
                key={day.date}
                day={day}
                selected={day.date === selectedDate}
                onPress={() => setSelectedDate(day.date === selectedDate ? null : day.date)}
              />
            ))}
          </View>
        ))}

        {selectedDay && selectedDay.blobs.length > 0 && (
          <View style={styles.detailPanel}>
            <Text style={styles.detailTitle}>{selectedDay.date}</Text>
            {selectedDay.blobs.map((blob, i) => (
              <View key={i} style={styles.detailRow}>
                <View style={[styles.detailDot, { backgroundColor: blob.color }]} />
                <Text style={[styles.detailText, blob.kind === "skipped" ? styles.statusSkipped : styles.statusDone]}>
                  {blob.habitName}
                  {blob.kind === "skipped"
                    ? ": Skipped"
                    : blob.habitType === "boolean"
                      ? blob.hit
                        ? ": Done ✓"
                        : ""
                      : blob.actualValue !== undefined
                        ? `: ${formatNumber(blob.actualValue)}${unitSuffix(blob.unitLabel)}${blob.hit ? " ✓" : ""}`
                        : ""}
                </Text>
              </View>
            ))}
          </View>
        )}
        {selectedDay && selectedDay.blobs.length === 0 && (
          <View style={styles.detailPanel}>
            <Text style={styles.detailTitle}>{selectedDay.date}</Text>
            <Text style={styles.detailEmpty}>Nothing logged.</Text>
          </View>
        )}
      </View>
    </Screen>
  );
}

function DayCell({
  day,
  selected,
  onPress,
}: {
  day: CalendarDay;
  selected: boolean;
  onPress: () => void;
}) {
  const dayNumber = parseInt(day.date.slice(8, 10), 10);
  const visibleBlobs = day.blobs.slice(0, 4);
  const extraCount = day.blobs.length - visibleBlobs.length;

  return (
    <Pressable
      style={[styles.dayCell, selected && styles.dayCellSelected]}
      onPress={onPress}
    >
      <Text style={[styles.dayNumber, !day.inCurrentMonth && styles.dayNumberMuted]}>{dayNumber}</Text>
      <View style={styles.blobRow}>
        {visibleBlobs.map((blob, i) => {
          const size = sizeForCloseness(blob.closeness);
          return (
            <View
              key={i}
              style={{
                backgroundColor: blob.color,
                opacity: opacityForCloseness(blob.closeness),
                borderRadius: size / 2,
                height: size,
                width: size,
                marginHorizontal: 1,
              }}
            />
          );
        })}
        {extraCount > 0 && <Text style={styles.extraCount}>+{extraCount}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  centerWrap: {
    flex: 1,
    padding: 16,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  navButton: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  navButtonText: {
    color: theme.primary,
    fontSize: 24,
    fontWeight: "700",
  },
  monthLabel: {
    color: theme.text,
    fontSize: 18,
    fontWeight: "700",
  },
  weekdayRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  weekdayLabel: {
    color: theme.textMuted,
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  weekRow: {
    flexDirection: "row",
  },
  dayCell: {
    alignItems: "center",
    borderRadius: 8,
    flex: 1,
    paddingVertical: 8,
  },
  dayCellSelected: {
    backgroundColor: theme.surface,
  },
  dayNumber: {
    color: theme.text,
    fontSize: 13,
    marginBottom: 4,
  },
  dayNumberMuted: {
    color: theme.textMuted,
  },
  blobRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    minHeight: 12,
  },
  extraCount: {
    color: theme.textMuted,
    fontSize: 10,
    marginLeft: 2,
  },
  detailPanel: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    marginTop: 16,
    padding: 16,
  },
  detailTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 10,
  },
  detailRow: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: 8,
  },
  detailDot: {
    borderRadius: 5,
    height: 10,
    marginRight: 8,
    width: 10,
  },
  detailText: {
    color: theme.text,
    fontSize: 14,
  },
  statusDone: {
    color: "#4CAF50",
    fontWeight: "600",
  },
  statusSkipped: {
    color: theme.textMuted,
    fontWeight: "600",
  },
  detailEmpty: {
    color: theme.textMuted,
    fontSize: 14,
  },
});
