import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { theme } from "../../theme";

const HOLD_MS = 1100;

/**
 * The native splash (static, pre-JS) hands off to this once the bundle's loaded —
 * everything animatable about "first launch" has to happen here instead.
 */
export function IntroScreen({ onDone }: { onDone: () => void }) {
  const iconScale = useRef(new Animated.Value(0.6)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(iconScale, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
      Animated.timing(iconOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
    ]).start();

    Animated.parallel([
      Animated.timing(titleOpacity, {
        toValue: 1,
        duration: 400,
        delay: 280,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(titleTranslateY, {
        toValue: 0,
        duration: 400,
        delay: 280,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(onDone, HOLD_MS);
    return () => clearTimeout(timer);
    // Animated.Values and onDone are stable for this component's one-shot lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <Animated.Image
        source={require("../../../assets/icon.png")}
        style={[styles.icon, { opacity: iconOpacity, transform: [{ scale: iconScale }] }]}
      />
      <Animated.View style={{ opacity: titleOpacity, transform: [{ translateY: titleTranslateY }] }}>
        <Text style={styles.title}>Notchy</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: theme.background,
    flex: 1,
    justifyContent: "center",
  },
  icon: {
    borderRadius: 28,
    height: 112,
    marginBottom: 18,
    width: 112,
  },
  title: {
    color: theme.text,
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
