import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";
import { theme } from "../../theme";
import { formatNumber } from "../../utils/format";
import { LoggedEntry } from "../../types";

const CHART_HEIGHT = 160;
const PADDING = 12;

/**
 * Actual-vs-target over time for one goal. Points are spaced evenly by entry order,
 * not by literal calendar distance — a deliberate simplification, since this app has
 * no need for precise time-scaled axes, just "is the trend tracking the plan."
 */
export function ProgressChart({
  entries,
  projectedTargets = [],
  targetValue,
  color,
  unit,
}: {
  entries: LoggedEntry[];
  /** Pre-computed future targets from the progression engine — extends the dashed line forward. */
  projectedTargets?: number[];
  /** Absent for goalless (open-ended) habits — the axis just scales to the data instead. */
  targetValue?: number;
  color: string;
  unit: string;
}) {
  const [width, setWidth] = useState(0);
  const points = entries.filter(
    (e): e is LoggedEntry & { actualValue: number } => e.actualValue !== undefined
  );

  if (points.length < 2 && projectedTargets.length === 0) {
    return (
      <Text style={styles.empty}>Log a few more entries to see your progress chart here.</Text>
    );
  }

  // X-axis spans all sessions — logged on the left, projected on the right.
  const totalCount = Math.max(points.length + projectedTargets.length, 2);

  const values = points.flatMap((p) => [p.actualValue, p.generatedTarget]);
  values.push(...projectedTargets);
  if (targetValue !== undefined) values.push(targetValue);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = maxValue - minValue || 1;

  const chartWidth = Math.max(width - PADDING * 2, 0);
  const chartHeight = CHART_HEIGHT - PADDING * 2;

  const xFor = (index: number) => PADDING + (index / (totalCount - 1)) * chartWidth;
  const yFor = (value: number) => PADDING + chartHeight - ((value - minValue) / valueRange) * chartHeight;

  const actualLine = points.map((p, i) => `${xFor(i)},${yFor(p.actualValue)}`).join(" ");
  const loggedTargetLine = points.map((p, i) => `${xFor(i)},${yFor(p.generatedTarget)}`).join(" ");

  // Projected line starts from the last logged entry's target so the arc flows continuously.
  const lastLoggedTarget = points.length > 0 ? points[points.length - 1].generatedTarget : null;
  const projectedLine =
    projectedTargets.length > 0 && lastLoggedTarget !== null
      ? [
          `${xFor(points.length - 1)},${yFor(lastLoggedTarget)}`,
          ...projectedTargets.map((t, i) => `${xFor(points.length + i)},${yFor(t)}`),
        ].join(" ")
      : null;

  return (
    <View>
      <View style={styles.axisRow}>
        <Text style={styles.axisLabel}>
          {formatNumber(maxValue)}
          {unit}
        </Text>
      </View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <Svg width={width} height={CHART_HEIGHT}>
            <Line
              x1={0}
              y1={PADDING + chartHeight}
              x2={width}
              y2={PADDING + chartHeight}
              stroke={theme.border}
              strokeWidth={1}
            />
            {/* Solid portion of target line through logged entries */}
            <Polyline
              points={loggedTargetLine}
              fill="none"
              stroke={theme.textMuted}
              strokeWidth={1.5}
              strokeDasharray="5,4"
            />
            {/* Projected continuation — lighter to distinguish future from history */}
            {projectedLine && (
              <Polyline
                points={projectedLine}
                fill="none"
                stroke={theme.textMuted}
                strokeWidth={1}
                strokeDasharray="3,5"
                opacity={0.45}
              />
            )}
            <Polyline points={actualLine} fill="none" stroke={color} strokeWidth={2.5} />
            {points.map((p, i) => (
              <Circle
                key={p.id}
                cx={xFor(i)}
                cy={yFor(p.actualValue)}
                r={3.5}
                fill={p.hit ? "#4CAF50" : theme.danger}
              />
            ))}
          </Svg>
        )}
      </View>
      <View style={styles.axisRow}>
        <Text style={styles.axisLabel}>
          {formatNumber(minValue)}
          {unit}
        </Text>
      </View>
      <View style={styles.legend}>
        <LegendItem swatchColor={color} label="Actual" />
        <LegendItem swatchColor={theme.textMuted} label="Target" dashed />
        {projectedTargets.length > 0 && (
          <LegendItem swatchColor={theme.textMuted} label="Projected" dashed faded />
        )}
        <LegendItem swatchColor="#4CAF50" label="Hit" dot />
        <LegendItem swatchColor={theme.danger} label="Miss" dot />
      </View>
    </View>
  );
}

function LegendItem({
  swatchColor,
  label,
  dashed,
  faded,
  dot,
}: {
  swatchColor: string;
  label: string;
  dashed?: boolean;
  faded?: boolean;
  dot?: boolean;
}) {
  return (
    <View style={[styles.legendItem, faded && { opacity: 0.45 }]}>
      <View
        style={[
          dot ? styles.legendDot : styles.legendLine,
          { backgroundColor: swatchColor },
          dashed && styles.legendDashed,
        ]}
      />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    color: theme.textMuted,
    fontSize: 14,
    paddingVertical: 12,
  },
  axisRow: {
    alignItems: "flex-end",
  },
  axisLabel: {
    color: theme.textMuted,
    fontSize: 11,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginTop: 10,
  },
  legendItem: {
    alignItems: "center",
    flexDirection: "row",
  },
  legendLine: {
    borderRadius: 1.5,
    height: 3,
    marginRight: 6,
    width: 14,
  },
  legendDot: {
    borderRadius: 4,
    height: 8,
    marginRight: 6,
    width: 8,
  },
  legendDashed: {
    opacity: 0.6,
  },
  legendText: {
    color: theme.textMuted,
    fontSize: 12,
  },
});
