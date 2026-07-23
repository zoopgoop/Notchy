import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text } from "react-native";
import { theme } from "../../theme";
import { AchievementDef } from "../../services/achievements";

const AUTO_DISMISS_MS = 3800;

/** Shown right after a log unlocks one or more app-wide achievement badges — see services/achievements.ts. */
export function AchievementToast({ defs, onDismiss }: { defs: AchievementDef[]; onDismiss: () => void }) {
  const entrance = useRef(new Animated.Value(0)).current;

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
  const first = defs[0];
  const text =
    defs.length === 1 ? `Achievement unlocked: ${first.title}` : `${defs.length} achievements unlocked!`;

  return (
    <Animated.View style={[styles.wrap, { opacity: entrance, transform: [{ translateY }] }]}>
      <Pressable style={styles.toast} onPress={onDismiss}>
        <Text style={styles.emoji}>{first.emoji}</Text>
        <Text style={styles.text}>{text}</Text>
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
    borderColor: theme.primary,
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
