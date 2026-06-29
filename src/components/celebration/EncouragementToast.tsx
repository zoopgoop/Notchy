import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text } from "react-native";
import { theme } from "../../theme";

const AUTO_DISMISS_MS = 3200;

const MESSAGES = [
  "Didn't hit today's number — that's okay, showing up is what the streak rewards.",
  "Missed the target, not the habit. Your streak's safe.",
  "Not quite there today, but you still did it. That's what counts.",
];

/**
 * Shown when a log misses its daily target but the streak carries on anyway —
 * softer than a celebration on purpose: no sound, just a quiet reassurance.
 */
export function EncouragementToast({ onDismiss }: { onDismiss: () => void }) {
  const entrance = useRef(new Animated.Value(0)).current;
  const message = useRef(MESSAGES[Math.floor(Math.random() * MESSAGES.length)]).current;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.back(1.3)),
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const translateY = entrance.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] });

  return (
    <Animated.View style={[styles.wrap, { opacity: entrance, transform: [{ translateY }] }]}>
      <Pressable style={styles.toast} onPress={onDismiss}>
        <Text style={styles.emoji}>💪</Text>
        <Text style={styles.text}>{message}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    left: 16,
    position: "absolute",
    right: 16,
    top: 50,
  },
  toast: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  emoji: {
    fontSize: 32,
    marginRight: 14,
  },
  text: {
    color: theme.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
  },
});
