import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "../../components/ui/Button";
import { theme } from "../../theme";

export function StreakLostPrompt({
  habitName,
  hadStreak,
  onAdjustHabit,
  onStartAgain,
  onDismiss,
}: {
  habitName: string;
  /** Whether this habit actually had a streak that just got forfeited, vs. never having one at stake. */
  hadStreak: boolean;
  onAdjustHabit: () => void;
  onStartAgain: () => void;
  onDismiss: () => void;
}) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <Pressable style={styles.closeButton} onPress={onDismiss} hitSlop={12}>
          <Text style={styles.closeButtonText}>✕</Text>
        </Pressable>
        <Text style={styles.emoji}>{hadStreak ? "😔" : "📅"}</Text>
        <Text style={styles.title}>{hadStreak ? "Oh no, you lost your streak!" : "This week got away from you"}</Text>
        <Text style={styles.subtitle}>
          {hadStreak
            ? `"${habitName}" didn't get enough check-ins in this week. That's okay — what do you want to do?`
            : `"${habitName}" won't hit this week's quota, but there's no streak on the line. What do you want to do?`}
        </Text>
        <Button title="Adjust Habit" onPress={onAdjustHabit} />
        <View style={styles.spacer} />
        <Button title="Start Again" variant="secondary" onPress={onStartAgain} />
        <Text style={styles.dismissNote}>
          Dismissing puts this habit on ice. Simply log or adjust the habit to wake it back up.
        </Text>
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
  closeButton: {
    padding: 8,
    position: "absolute",
    right: 20,
    top: 48,
  },
  closeButtonText: {
    color: theme.textMuted,
    fontSize: 20,
    fontWeight: "600",
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
  dismissNote: {
    color: theme.textMuted,
    fontSize: 12,
    marginTop: 16,
    textAlign: "center",
  },
});
