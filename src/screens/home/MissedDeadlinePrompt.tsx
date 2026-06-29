import { useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { Button } from "../../components/ui/Button";
import { DateField, FieldGroup, FieldLabel } from "../../components/ui/FormField";
import { addDays, formatDateLocal, today } from "../../engine/dateUtils";
import { theme } from "../../theme";

export function MissedDeadlinePrompt({
  currentTargetDate,
  onExtend,
  onDeactivate,
}: {
  currentTargetDate: string;
  onExtend: (newDate: string) => void;
  onDeactivate: () => void;
}) {
  const [newDate, setNewDate] = useState(new Date(addDays(today(), 14)));

  return (
    <Modal transparent animationType="fade">
      <View style={styles.backdrop}>
        <Text style={styles.emoji}>⏳</Text>
        <Text style={styles.title}>Deadline reached</Text>
        <Text style={styles.body}>
          You didn't quite hit this one by {currentTargetDate}. Want to extend the date and keep going?
        </Text>

        <FieldGroup>
          <FieldLabel>New target date</FieldLabel>
          <DateField value={newDate} onChange={setNewDate} />
        </FieldGroup>

        <Button title="Extend the date" onPress={() => onExtend(formatDateLocal(newDate))} />
        <View style={styles.spacer} />
        <Button title="Deactivate Habit" variant="secondary" onPress={onDeactivate} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: theme.background,
    flex: 1,
    justifyContent: "center",
    padding: 32,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 12,
    textAlign: "center",
  },
  title: {
    color: theme.text,
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center",
  },
  body: {
    color: theme.textMuted,
    fontSize: 14,
    marginBottom: 20,
    textAlign: "center",
  },
  spacer: {
    height: 10,
  },
});
