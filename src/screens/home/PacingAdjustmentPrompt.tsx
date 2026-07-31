import { useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { Button } from "../../components/ui/Button";
import { DateField, FieldGroup, FieldLabel, TextField } from "../../components/ui/FormField";
import { formatDateLocal } from "../../engine/dateUtils";
import { theme } from "../../theme";
import { PacingMismatch } from "../../services/pacingAdjustment";

const COPY: Record<PacingMismatch, { emoji: string; title: string; body: string; dateLabel: string; targetLabel: string }> = {
  struggling: {
    emoji: "😓",
    title: "This one's tough lately",
    body: "You've missed most of your recent targets. Want to push the date back or ease the target instead of grinding on toward something that's slipping out of reach?",
    dateLabel: "Push date back to",
    targetLabel: "Or lower the target to",
  },
  overshooting: {
    emoji: "💨",
    title: "You're crushing this one",
    body: "You've been comfortably beating your targets. Want to pull the date in or raise the target so it's still a stretch?",
    dateLabel: "Pull date in to",
    targetLabel: "Or raise the target to",
  },
};

export function PacingAdjustmentPrompt({
  mismatch,
  currentTargetDate,
  currentTargetValue,
  unit,
  allowsDecimal,
  onAdjustDate,
  onAdjustTarget,
  onDismiss,
}: {
  mismatch: PacingMismatch;
  currentTargetDate: string;
  currentTargetValue: number;
  unit: string;
  allowsDecimal: boolean;
  onAdjustDate: (newDate: string) => void;
  onAdjustTarget: (newTarget: number) => void;
  onDismiss: () => void;
}) {
  const copy = COPY[mismatch];
  const [newDate, setNewDate] = useState(new Date(currentTargetDate));
  const [newTarget, setNewTarget] = useState(String(currentTargetValue));

  return (
    <Modal transparent animationType="fade">
      <View style={styles.backdrop}>
        <Text style={styles.emoji}>{copy.emoji}</Text>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>

        <FieldGroup>
          <FieldLabel>{copy.dateLabel}</FieldLabel>
          <DateField value={newDate} onChange={setNewDate} />
          <Button
            title="Use this date"
            variant="secondary"
            onPress={() => onAdjustDate(formatDateLocal(newDate))}
          />
        </FieldGroup>

        <FieldGroup>
          <FieldLabel>{copy.targetLabel}</FieldLabel>
          <TextField
            keyboardType={allowsDecimal ? "decimal-pad" : "number-pad"}
            value={newTarget}
            onChangeText={(text) =>
              setNewTarget(allowsDecimal ? text.replace(/[^0-9.]/g, "") : text.replace(/[^0-9]/g, ""))
            }
          />
          <Button
            title="Use this target"
            variant="secondary"
            onPress={() => {
              const parsed = allowsDecimal ? parseFloat(newTarget) : parseInt(newTarget, 10);
              if (!isNaN(parsed)) onAdjustTarget(parsed);
            }}
          />
        </FieldGroup>

        <Text style={styles.unit}>{unit}</Text>
        <Button title="Not now" variant="secondary" onPress={onDismiss} />
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
  unit: {
    color: theme.textMuted,
    fontSize: 12,
    marginBottom: 16,
    textAlign: "center",
  },
});
