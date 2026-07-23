import { useState, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";
import { theme, UNCATEGORIZED_COLOR } from "../../theme";
import { formatNumber } from "../../utils/format";
import { LoggedEntry } from "../../types";

/**
 * react-native-svg's <Text> collapses a plain leading space in `unit` (" Pages" -> "Pages"),
 * and textAnchor re-anchors each <TSpan> independently rather than the whole run — both of
 * which cause the value and unit to render on top of each other. A non-breaking space inside
 * one single string content sidesteps both: it survives whitespace collapsing and there's only
 * ever one text chunk to anchor.
 */
function svgValueLabel(value: number, unit: string): string {
  return `${formatNumber(value)}${unit.replace(/^ /, " ")}`;
}

const CHART_HEIGHT = 160;
const PADDING = 12;
const PADDING_TOP = 22;

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
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const points = entries.filter(
    (e): e is LoggedEntry & { actualValue: number } => e.actualValue !== undefined
  );
  // The target/projected lines are neutral grey by design (reference, not identity) — but
  // the uncategorized fallback color is ALSO grey, which collapses the whole chart into three
  // indistinguishable shades of grey. Give the actual line real hue in that case specifically.
  const lineColor = color === UNCATEGORIZED_COLOR ? theme.primary : color;

  if (points.length === 0 && projectedTargets.length === 0) {
    return (
      <Text style={styles.empty}>Log your first entry to start seeing your progress chart.</Text>
    );
  }

  function handleDotPress(i: number) {
    setSelectedIdx(i);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setSelectedIdx(null), 2500);
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
  const chartHeight = CHART_HEIGHT - PADDING_TOP - PADDING;

  const xFor = (index: number) => PADDING + (index / (totalCount - 1)) * chartWidth;
  const yFor = (value: number) => PADDING_TOP + chartHeight - ((value - minValue) / valueRange) * chartHeight;

  const actualLine = points.map((p, i) => `${xFor(i)},${yFor(p.actualValue)}`).join(" ");
  const loggedTargetLine = points.map((p, i) => `${xFor(i)},${yFor(p.generatedTarget)}`).join(" ");

  // Projected line extends from the end of the target line — it's a continuation of
  // where targets will go, not the actual values.
  const lastLoggedTarget = points.length > 0 ? points[points.length - 1].generatedTarget : null;
  const projectedLine =
    projectedTargets.length > 0 && lastLoggedTarget !== null
      ? [
          `${xFor(points.length - 1)},${yFor(lastLoggedTarget)}`,
          ...projectedTargets.map((t, i) => `${xFor(points.length + i)},${yFor(t)}`),
        ].join(" ")
      : null;

  // Label anchored to the right tip of the target line.
  const tipTarget =
    projectedTargets.length > 0
      ? projectedTargets[projectedTargets.length - 1]
      : lastLoggedTarget;
  const tipX = xFor(totalCount - 1);
  const tipY = tipTarget !== null ? yFor(tipTarget) : null;

  return (
    <View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <Svg width={width} height={CHART_HEIGHT}>
            <Line
              x1={0}
              y1={PADDING_TOP + chartHeight}
              x2={width}
              y2={PADDING_TOP + chartHeight}
              stroke={theme.border}
              strokeWidth={1}
            />
            {/* Solid portion of target line through logged entries */}
            <Polyline
              points={loggedTargetLine}
              fill="none"
              stroke={theme.text}
              strokeWidth={1.5}
              strokeDasharray="6,4"
              opacity={0.55}
            />
            {/* Projected continuation — lighter to distinguish future from history */}
            {projectedLine && (
              <Polyline
                points={projectedLine}
                fill="none"
                stroke={theme.text}
                strokeWidth={1}
                strokeDasharray="3,5"
                opacity={0.25}
              />
            )}
            <Polyline points={actualLine} fill="none" stroke={lineColor} strokeWidth={3} />
            {points.map((p, i) => (
              <Circle
                key={p.id}
                cx={xFor(i)}
                cy={yFor(p.actualValue)}
                r={i === points.length - 1 ? 5 : 3.5}
                fill={p.hit ? "#4CAF50" : theme.danger}
                onPress={() => handleDotPress(i)}
              />
            ))}
            {selectedIdx !== null && points[selectedIdx] && (
              <SvgText
                x={Math.min(Math.max(xFor(selectedIdx), PADDING + 16), (width || 0) - PADDING - 16)}
                y={yFor(points[selectedIdx].actualValue) - 8}
                textAnchor="middle"
                fontSize={11}
                fill={theme.text}
                fontWeight="600"
              >
                {svgValueLabel(points[selectedIdx].actualValue, unit)}
              </SvgText>
            )}
            {targetValue !== undefined && tipY !== null && (
              <SvgText
                x={tipX}
                y={tipY - 6}
                textAnchor="end"
                fontSize={10}
                fill={theme.text}
                opacity={0.55}
              >
                {svgValueLabel(targetValue, unit)}
              </SvgText>
            )}
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
        <LegendItem swatchColor={lineColor} label="Actual" />
        <LegendItem swatchColor={theme.text} label="Target" dashed />
        {projectedTargets.length > 0 && (
          <LegendItem swatchColor={theme.text} label="Projected" dashed faded />
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
    alignItems: "flex-start",
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
