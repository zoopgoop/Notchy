import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../../theme";

// Displayed Monday-first (the app's week-start convention) while the underlying day
// values stay Date.getDay()'s native 0=Sunday..6=Saturday encoding — this array just
// controls display order, mapping each row position to its real day number.
const MONDAY_FIRST_DAYS = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABELS: Record<number, string> = { 0: "S", 1: "M", 2: "T", 3: "W", 4: "T", 5: "F", 6: "S" };

/** `Date.getDay()` convention: 0=Sunday..6=Saturday. Displayed Monday-first. */
export function DayOfWeekPicker({
  value,
  onChange,
}: {
  value: number[];
  onChange: (days: number[]) => void;
}) {
  function toggle(day: number) {
    onChange(value.includes(day) ? value.filter((d) => d !== day) : [...value, day].sort());
  }

  return (
    <View style={styles.row}>
      {MONDAY_FIRST_DAYS.map((day) => {
        const selected = value.includes(day);
        return (
          <Pressable
            key={day}
            onPress={() => toggle(day)}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{DAY_LABELS[day]}</Text>
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
  },
  chip: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  chipSelected: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  chipText: {
    color: theme.textMuted,
    fontSize: 14,
    fontWeight: "700",
  },
  chipTextSelected: {
    color: "#FFFFFF",
  },
});
