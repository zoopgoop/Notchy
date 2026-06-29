import { Modal, StyleSheet, Text, View } from "react-native";
import { Button } from "../../components/ui/Button";
import { theme } from "../../theme";

export function StreakLostPrompt({
  habitName,
  onAdjustHabit,
  onStartAgain,
}: {
  habitName: string;
  onAdjustHabit: () => void;
  onStartAgain: () => void;
}) {
  return (
    <Modal transparent animationType="fade">
      <View style={styles.backdrop}>
        <Text style={styles.emoji}>😔</Text>
        <Text style={styles.title}>Oh no, you lost your streak!</Text>
        <Text style={styles.subtitle}>
          "{habitName}" didn't get enough check-ins in this week. That's okay — what do you want to do?
        </Text>
        <Button title="Adjust Habit" onPress={onAdjustHabit} />
        <View style={styles.spacer} />
        <Button title="Start Again" variant="secondary" onPress={onStartAgain} />
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
  subtitle: {
    color: theme.textMuted,
    fontSize: 14,
    marginBottom: 24,
    textAlign: "center",
  },
  spacer: {
    height: 10,
  },
});
