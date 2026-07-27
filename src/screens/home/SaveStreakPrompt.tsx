import { Modal, StyleSheet, Text, View } from "react-native";
import { Button } from "../../components/ui/Button";
import { theme } from "../../theme";

/**
 * Shown *after* the skip(s) needed to cover an otherwise-unreachable week have already been
 * applied automatically — this crisis only ever fires when skipsRemaining >= skipsNeededToSave
 * (see HomeScreen's crisisView/canSpendSkips), so there's no real choice to offer: the streak
 * is fully recoverable, and letting it go anyway would just be throwing it away for no reason.
 * If there aren't enough skips to cover it, this never shows — that goal goes straight to
 * StreakLostPrompt's forfeit-and-restart flow instead.
 */
export function SaveStreakPrompt({
  habitName,
  skipsUsed,
  onDismiss,
}: {
  habitName: string;
  skipsUsed: number;
  onDismiss: () => void;
}) {
  const skipWord = skipsUsed === 1 ? "skip" : "skips";
  const dayWord = skipsUsed === 1 ? "day" : "days";

  return (
    <Modal transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <Text style={styles.emoji}>🛟</Text>
        <Text style={styles.title}>Streak saved automatically</Text>
        <Text style={styles.subtitle}>
          You've missed the last {skipsUsed} scheduled {dayWord} on "{habitName}" — {skipsUsed} {skipWord}{" "}
          {skipsUsed === 1 ? "has" : "have"} been used to cover it and keep your streak alive.
        </Text>
        <Button title="Got it" onPress={onDismiss} />
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
});
