import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../../theme";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

/** `Date.getDay()` convention: 0=Sunday..6=Saturday. */
export function DayOfWeekPicker({
  value,
  onChange,
  disabled,
}: {
  value: number[];
  onChange: (days: number[]) => void;
  disabled?: boolean;
}) {
  function toggle(day: number) {
    onChange(value.includes(day) ? value.filter((d) => d !== day) : [...value, day].sort());
  }

  return (
    <View style={styles.row}>
      {DAY_LABELS.map((label, day) => {
        const selected = value.includes(day);
        return (
          <Pressable
            key={day}
            onPress={() => toggle(day)}
            disabled={disabled}
            style={[styles.chip, selected && styles.chipSelected, disabled && styles.chipDisabled]}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
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
  chipDisabled: {
    opacity: 0.5,
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
