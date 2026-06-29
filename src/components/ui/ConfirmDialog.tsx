import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../../theme";

/** Themed replacement for `Alert.alert` — matches the rest of the app instead of the bare native style. */
export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  /** Omit to render a single dismiss button (info-only alerts like "Can't skip"). */
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel,
  destructive,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel ?? onConfirm}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {message && <Text style={styles.message}>{message}</Text>}
          <View style={styles.actions}>
            {onCancel && (
              <Pressable
                style={({ pressed }) => [styles.button, styles.cancelButton, pressed && styles.pressed]}
                onPress={onCancel}
              >
                <Text style={styles.cancelText}>{cancelLabel ?? "Cancel"}</Text>
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [
                styles.button,
                destructive ? styles.destructiveButton : styles.confirmButton,
                pressed && styles.pressed,
              ]}
              onPress={onConfirm}
            >
              <Text style={destructive ? styles.destructiveText : styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    flex: 1,
    justifyContent: "center",
    padding: 28,
  },
  card: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 18,
    borderWidth: 1,
    padding: 22,
    width: "100%",
  },
  title: {
    color: theme.text,
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
  },
  message: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  button: {
    alignItems: "center",
    borderRadius: 10,
    minWidth: 88,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  cancelButton: {
    backgroundColor: theme.surfaceAlt,
  },
  cancelText: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "700",
  },
  confirmButton: {
    backgroundColor: theme.primary,
  },
  confirmText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  destructiveButton: {
    backgroundColor: theme.danger,
  },
  destructiveText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
