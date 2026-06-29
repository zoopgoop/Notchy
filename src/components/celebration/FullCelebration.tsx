import { useEffect, useRef } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useAudioPlayer } from "expo-audio";
import { theme } from "../../theme";
import { celebrationBurst } from "../../utils/haptics";

const CONFETTI_COLORS = [theme.primary, "#4CAF50", "#FFD54F", "#EC407A", "#26C6DA"];
const CONFETTI_COUNT = 16;

function ConfettiPiece({ index }: { index: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  // Locked in once per piece so it doesn't re-randomize on re-render.
  const config = useRef({
    angle: (index / CONFETTI_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.6,
    distance: 110 + Math.random() * 90,
    rotation: (Math.random() - 0.5) * 720,
    color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
    size: 7 + Math.random() * 5,
    duration: 900 + Math.random() * 500,
  }).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: config.duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [config.duration, progress]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.cos(config.angle) * config.distance],
  });
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.sin(config.angle) * config.distance + 70],
  });
  const opacity = progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] });
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${config.rotation}deg`] });

  return (
    <Animated.View
      style={[
        styles.confettiPiece,
        {
          backgroundColor: config.color,
          width: config.size,
          height: config.size,
          opacity,
          transform: [{ translateX }, { translateY }, { rotate }],
        },
      ]}
    />
  );
}

export function FullCelebration({
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
  const player = useAudioPlayer(require("../../../assets/sounds/fanfare.wav"));
  const emojiScale = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    player.play();
    celebrationBurst();
    Animated.spring(emojiScale, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }).start();
    Animated.timing(contentOpacity, {
      toValue: 1,
      duration: 400,
      delay: 250,
      useNativeDriver: true,
    }).start();
    Animated.timing(contentTranslateY, {
      toValue: 0,
      duration: 400,
      delay: 250,
      useNativeDriver: true,
    }).start();
    // player and the Animated.Values are stable refs — only meant to run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.confettiBurst} pointerEvents="none">
          {Array.from({ length: CONFETTI_COUNT }).map((_, i) => (
            <ConfettiPiece key={i} index={i} />
          ))}
        </View>

        <Animated.Text style={[styles.emoji, { transform: [{ scale: emojiScale }] }]}>{emoji}</Animated.Text>

        <Animated.View style={{ opacity: contentOpacity, transform: [{ translateY: contentTranslateY }] }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </Animated.View>

        <Pressable style={styles.dismissButton} onPress={onDismiss}>
          <Text style={styles.dismissButtonText}>Nice!</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: "center",
    backgroundColor: theme.background,
    flex: 1,
    justifyContent: "center",
    padding: 32,
  },
  confettiBurst: {
    alignItems: "center",
    height: 1,
    justifyContent: "center",
    left: "50%",
    position: "absolute",
    top: "38%",
    width: 1,
  },
  confettiPiece: {
    borderRadius: 2,
    position: "absolute",
  },
  emoji: {
    fontSize: 80,
    marginBottom: 20,
  },
  title: {
    color: theme.text,
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    color: theme.textMuted,
    fontSize: 16,
    marginBottom: 32,
    textAlign: "center",
  },
  dismissButton: {
    backgroundColor: theme.primary,
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  dismissButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
