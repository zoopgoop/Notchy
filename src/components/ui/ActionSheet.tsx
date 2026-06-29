import { Modal, Pressable, StyleSheet, Text } from "react-native";
import { theme } from "../../theme";

export interface ActionSheetOption {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

/** A themed replacement for `Alert.alert`'s action-list style — matches the rest of the app. */
export function ActionSheet({
  visible,
  title,
  options,
  onClose,
}: {
  visible: boolean;
  title?: string;
  options: ActionSheetOption[];
  onClose: () => void;
}) {
  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {title && <Text style={styles.title}>{title}</Text>}
          {options.map((option, i) => (
            <Pressable
              key={i}
              style={({ pressed }) => [
                styles.option,
                i === options.length - 1 && styles.lastOption,
                pressed && styles.optionPressed,
              ]}
              onPress={() => {
                onClose();
                option.onPress();
              }}
            >
              <Text style={[styles.optionText, option.destructive && styles.optionTextDestructive]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
          <Pressable
            style={({ pressed }) => [styles.cancel, pressed && styles.cancelPressed]}
            onPress={onClose}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0,0,0,0.5)",
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: "hidden",
    paddingBottom: 24,
    paddingTop: 8,
  },
  title: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
    paddingBottom: 8,
    paddingHorizontal: 20,
    paddingTop: 12,
    textTransform: "uppercase",
  },
  option: {
    borderBottomColor: theme.border,
    borderBottomWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  lastOption: {
    borderBottomWidth: 0,
  },
  optionPressed: {
    backgroundColor: theme.surfaceAlt,
  },
  optionText: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "600",
  },
  optionTextDestructive: {
    color: theme.danger,
  },
  cancel: {
    alignItems: "center",
    backgroundColor: theme.surfaceAlt,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    paddingVertical: 14,
  },
  cancelPressed: {
    opacity: 0.8,
  },
  cancelText: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "700",
  },
});
