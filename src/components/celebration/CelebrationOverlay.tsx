import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text } from "react-native";
import { useAudioPlayer } from "expo-audio";
import { theme } from "../../theme";
import { Celebration } from "../../types";
import { lightTap } from "../../utils/haptics";
import { CELEBRATION_COPY } from "./celebrationCopy";
import { FullCelebration } from "./FullCelebration";

const TOAST_AUTO_DISMISS_MS = 3200;

function subtitleFor(celebration: Celebration, habitName: string): string {
  if (celebration.type === "streak_milestone") {
    return `${celebration.metadata?.streak ?? ""}-day streak on ${habitName}`;
  }
  return habitName;
}

function Toast({
  emoji,
  title,
  subtitle,
  onDismiss,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  onDismiss: () => void;
}) {
  const player = useAudioPlayer(require("../../../assets/sounds/ding.wav"));
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    player.play();
    lightTap();
    Animated.timing(entrance, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.back(1.3)),
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(onDismiss, TOAST_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
    // player, entrance, and onDismiss are stable for the toast's lifetime — fire once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const translateY = entrance.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] });

  return (
    <Animated.View style={[styles.toastWrap, { opacity: entrance, transform: [{ translateY }] }]}>
      <Pressable style={styles.toast} onPress={onDismiss}>
        <Text style={styles.toastEmoji}>{emoji}</Text>
        <Animated.View style={styles.toastTextWrap}>
          <Text style={styles.toastTitle}>{title}</Text>
          <Text style={styles.toastSubtitle}>{subtitle}</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

export function CelebrationOverlay({
  celebration,
  habitName,
  onDismiss,
}: {
  celebration: Celebration;
  habitName: string;
  onDismiss: () => void;
}) {
  const copy = CELEBRATION_COPY[celebration.type];
  const subtitle = subtitleFor(celebration, habitName);

  if (copy.tier === "toast") {
    return <Toast emoji={copy.emoji} title={copy.title} subtitle={subtitle} onDismiss={onDismiss} />;
  }

  return <FullCelebration emoji={copy.emoji} title={copy.title} subtitle={subtitle} onDismiss={onDismiss} />;
}

const styles = StyleSheet.create({
  toastWrap: {
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
  toastEmoji: {
    fontSize: 36,
    marginRight: 14,
  },
  toastTextWrap: {
    flex: 1,
  },
  toastTitle: {
    color: theme.text,
    fontSize: 17,
    fontWeight: "800",
  },
  toastSubtitle: {
    color: theme.textMuted,
    fontSize: 14,
    marginTop: 3,
  },
});
