import { Modal, StyleSheet, Text, View } from "react-native";
import { Button } from "../../components/ui/Button";
import { theme } from "../../theme";

export function SaveStreakPrompt({
  habitName,
  skipsNeeded,
  onSpendSkips,
  onLetItGo,
}: {
  habitName: string;
  skipsNeeded: number;
  onSpendSkips: () => void;
  onLetItGo: () => void;
}) {
  const skipWord = skipsNeeded === 1 ? "skip" : "skips";

  return (
    <Modal transparent animationType="fade">
      <View style={styles.backdrop}>
        <Text style={styles.emoji}>⚠️</Text>
        <Text style={styles.title}>Your streak is in danger</Text>
        <Text style={styles.subtitle}>
          "{habitName}" won't hit this week's check-in quota even if you log every remaining day. Spend{" "}
          {skipsNeeded} {skipWord} to cover what you've missed and keep your streak alive?
        </Text>
        <Button title={`Spend ${skipsNeeded} ${skipWord}`} onPress={onSpendSkips} />
        <View style={styles.spacer} />
        <Button title="Let it go" variant="secondary" onPress={onLetItGo} />
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
