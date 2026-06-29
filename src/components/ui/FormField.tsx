import { PropsWithChildren, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { formatDateLocal } from "../../engine/dateUtils";
import { theme } from "../../theme";

export function FieldLabel({ children }: PropsWithChildren) {
  return <Text style={styles.label}>{children}</Text>;
}

export function FieldGroup({ children }: PropsWithChildren) {
  return <View style={styles.group}>{children}</View>;
}

export function TextField({ style, ...props }: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={theme.textMuted}
      {...props}
      style={[styles.input, style]}
    />
  );
}

export function HintText({ children, danger }: PropsWithChildren<{ danger?: boolean }>) {
  return <Text style={[styles.hint, danger && styles.hintDanger]}>{children}</Text>;
}

function formatTimeLocal(date: Date): string {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHour}:${minutes} ${period}`;
}

/**
 * Renders the date/time as a tappable field rather than an always-mounted <DateTimePicker>.
 * On Android, DateTimePicker is a native dialog, not an inline widget — keeping it
 * mounted makes it reopen on every re-render of the screen. Rendering it only while
 * `showPicker` is true, and unmounting it as soon as onChange fires, makes it behave
 * like a one-shot dialog instead.
 */
export function DateField({
  value,
  onChange,
  mode = "date",
}: {
  value: Date;
  onChange: (date: Date) => void;
  mode?: "date" | "time";
}) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <>
      <Pressable style={styles.input} onPress={() => setShowPicker(true)}>
        <Text style={styles.dateText}>{mode === "time" ? formatTimeLocal(value) : formatDateLocal(value)}</Text>
      </Pressable>
      {showPicker && (
        <DateTimePicker
          value={value}
          mode={mode}
          onChange={(_, date) => {
            setShowPicker(false);
            if (date) onChange(date);
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  group: {
    marginBottom: 20,
  },
  label: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 10,
    borderWidth: 1,
    color: theme.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  hint: {
    color: theme.textMuted,
    fontSize: 13,
    marginTop: 6,
  },
  hintDanger: {
    color: theme.warning,
  },
  dateText: {
    color: theme.text,
    fontSize: 16,
  },
});
