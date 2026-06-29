import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Line, Polyline } from "react-native-svg";
import { exponentialTarget, incrementalTarget, linearTarget } from "../../engine/curves";
import { theme } from "../../theme";
import { CurveType } from "../../types";

const HEIGHT = 140;
const CARD_PADDING = 10;
const SAMPLES = 24;
/** Steeper than the engine's real pacing k — this is purely illustrative, so the bend needs to read clearly at a glance. */
const PREVIEW_K = 5;

const CURVE_FNS: Record<"linear" | "incremental" | "exponential", typeof linearTarget> = {
  linear: linearTarget,
  incremental: (start, target, elapsed, total) => incrementalTarget(start, target, elapsed, total, PREVIEW_K),
  exponential: (start, target, elapsed, total) => exponentialTarget(start, target, elapsed, total, PREVIEW_K),
};

function pointsFor(fn: typeof linearTarget, width: number): string {
  return Array.from({ length: SAMPLES + 1 }, (_, i) => {
    const value = fn(0, 100, i, SAMPLES);
    const x = (i / SAMPLES) * width;
    const y = HEIGHT - (value / 100) * HEIGHT;
    return `${x},${y}`;
  }).join(" ");
}

/** Shows what the currently selected curve's shape actually looks like, start to finish. */
export function CurveShapePreview({ value }: { value: CurveType }) {
  const [width, setWidth] = useState(0);
  const fn = CURVE_FNS[value as "linear" | "incremental" | "exponential"] ?? linearTarget;

  return (
    <View style={styles.card}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <Svg width={width} height={HEIGHT}>
            <Line x1={0} y1={HEIGHT} x2={width} y2={HEIGHT} stroke={theme.border} strokeWidth={1} />
            <Polyline points={pointsFor(fn, width)} fill="none" stroke={theme.primary} strokeWidth={3} />
          </Svg>
        )}
      </View>
      <View style={styles.axisRow}>
        <Text style={styles.axisLabel}>Start</Text>
        <Text style={styles.axisLabel}>Deadline</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
    padding: CARD_PADDING,
  },
  axisRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  axisLabel: {
    color: theme.textMuted,
    fontSize: 11,
  },
});
