import { Modal, StyleSheet, Text, View } from "react-native";
import { Button } from "../../components/ui/Button";
import { theme } from "../../theme";

/**
 * Shown right after a goal_achieved celebration. The habit itself never gets
 * duplicated — editing here just changes the same goal/habit in place (so the
 * streak carries over); only declining to edit further actually completes it.
 */
export function HabitAchievedPrompt({
  habitName,
  daysEarly,
  onEditAndContinue,
  onMarkComplete,
}: {
  habitName: string;
  /** Days remaining until the original target date, if it was hit ahead of schedule. */
  daysEarly?: number | null;
  onEditAndContinue: () => void;
  onMarkComplete: () => void;
}) {
  const isEarly = !!daysEarly && daysEarly > 0;

  return (
    <Modal transparent animationType="fade">
      <View style={styles.backdrop}>
        <Text style={styles.emoji}>🎉</Text>
        <Text style={styles.title}>Goal reached!</Text>
        <Text style={styles.subtitle}>
          {isEarly
            ? `You hit "${habitName}" ${daysEarly} day${daysEarly === 1 ? "" : "s"} ahead of schedule. Keep the habit going with a new target, or call it complete?`
            : `You hit "${habitName}". Keep the habit going with a new target, or call it complete?`}
        </Text>

        <Button title="Edit & Keep Going" onPress={onEditAndContinue} />
        <View style={styles.spacer} />
        <Button title="Mark as Complete" variant="secondary" onPress={onMarkComplete} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(18,18,18,0.96)",
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
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    color: theme.textMuted,
    fontSize: 15,
    marginBottom: 24,
    textAlign: "center",
  },
  spacer: {
    height: 10,
  },
});
