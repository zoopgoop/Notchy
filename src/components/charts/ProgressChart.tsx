import { Fragment, useState, useRef } from "react";
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
  return `${formatNumber(value)}${unit.replace(/^ /, " ")}`;
}

/** Evenly-spaced samples from `arr`, always including its first and last element — the
 * shape of a long path survives at a coarser resolution, but a shorter one is left as-is. */
export function downsample<T>(arr: T[], count: number): T[] {
  if (count <= 0) return [];
  if (arr.length <= count) return arr;
  const result: T[] = [];
  for (let i = 0; i < count; i++) {
    result.push(arr[Math.round((i * (arr.length - 1)) / Math.max(count - 1, 1))]);
  }
  return result;
}

const CHART_HEIGHT = 160;
const PADDING = 12;
const PADDING_TOP = 22;
const GOAL_DOT_COLOR = "#FFD700";
// Reserved strip on the left for y-axis numbers — separate from PADDING so the actual/
// target lines start to the right of the labels instead of running straight through them.
const AXIS_GUTTER = 28;
// Current shows only the most recent MAX_REAL_POINTS logged entries, not full history —
// that's what TrendChart's "All" is for. The rest of the chart, up to MAX_TOTAL_POINTS,
// is filled by the projection, so the two halves stay visually balanced instead of a
// handful of real dots crammed against a long empty run of future ones.
const MAX_REAL_POINTS = 7;
const MAX_TOTAL_POINTS = 15;

/**
 * "Current" — actual-vs-target over the most recent MAX_REAL_POINTS logged entries, plus
 * the live projection forward. The detailed, tappable view: dots, a goal marker, and the
 * projection line. For a windowed trend view (7D/2W/30D/All, no dots or projection) see
 * TrendChart.
 */
export function ProgressChart({
  entries,
  projectedTargets = [],
  targetValue,
  todayTarget,
  color,
  unit,
}: {
  entries: LoggedEntry[];
  /** Pre-computed future targets from the progression engine — extends the dashed line forward. */
  projectedTargets?: number[];
  /** Absent for goalless (open-ended) habits — the axis just scales to the data instead. */
  targetValue?: number;
  /** Today's not-yet-logged target — omitted once today is logged, since the actual dot covers it then. */
  todayTarget?: number;
  color: string;
  unit: string;
}) {
  const [width, setWidth] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [goalLabelShown, setGoalLabelShown] = useState(false);
  const [todayLabelShown, setTodayLabelShown] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goalHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const todayHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allPoints = entries.filter(
    (e): e is LoggedEntry & { actualValue: number } => e.actualValue !== undefined
  );
  const points = allPoints.slice(-MAX_REAL_POINTS);
  // Downsample rather than truncate: a goal that's far off can take dozens of simulated
  // sessions to reach (see MAX_SAMPLES_TOWARD_TARGET in progression.ts) — just taking the
  // first few would show a sliver of near-term movement and never actually reach the goal,
  // reopening the gap the goal-dot fix earlier was about. Sampling evenly across the whole
  // path keeps the real points from getting crowded out while still tracing the full shape
  // and always including the final (goal-reaching) value.
  const maxProjected = Math.max(MAX_TOTAL_POINTS - points.length, 0);
  const cappedProjectedTargets = downsample(projectedTargets, maxProjected);
  // The target/projected lines are neutral grey by design (reference, not identity) — but
  // the uncategorized fallback color is ALSO grey, which collapses the whole chart into three
  // indistinguishable shades of grey. Give the actual line real hue in that case specifically.
  const lineColor = color === UNCATEGORIZED_COLOR ? theme.primary : color;

  if (points.length === 0 && cappedProjectedTargets.length === 0) {
    return <Text style={styles.empty}>Log your first entry to start seeing your progress chart.</Text>;
  }

  function handleDotPress(i: number) {
    setSelectedIdx(i);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setSelectedIdx(null), 2500);
  }

  function handleGoalDotPress() {
    setGoalLabelShown(true);
    if (goalHideTimer.current) clearTimeout(goalHideTimer.current);
    goalHideTimer.current = setTimeout(() => setGoalLabelShown(false), 2500);
  }

  function handleTodayDotPress() {
    setTodayLabelShown(true);
    if (todayHideTimer.current) clearTimeout(todayHideTimer.current);
    todayHideTimer.current = setTimeout(() => setTodayLabelShown(false), 2500);
  }

  // X-axis spans all sessions — logged on the left, projected on the right. The today
  // marker sits one slot past the real points even if there's no projection to fill that
  // slot otherwise (e.g. a fresh goal with nothing to project yet).
  const totalCount = Math.max(
    points.length + cappedProjectedTargets.length,
    todayTarget !== undefined ? points.length + 1 : 0,
    2
  );

  const values = points.flatMap((p) => [p.actualValue, p.generatedTarget]);
  values.push(...cappedProjectedTargets);
  if (targetValue !== undefined) values.push(targetValue);
  if (todayTarget !== undefined) values.push(todayTarget);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = maxValue - minValue || 1;

  const chartWidth = Math.max(width - AXIS_GUTTER - PADDING, 0);
  const chartHeight = CHART_HEIGHT - PADDING_TOP - PADDING;

  const xFor = (index: number) => AXIS_GUTTER + (index / (totalCount - 1)) * chartWidth;
  const yFor = (value: number) => PADDING_TOP + chartHeight - ((value - minValue) / valueRange) * chartHeight;

  const actualLine = points.map((p, i) => `${xFor(i)},${yFor(p.actualValue)}`).join(" ");
  const loggedTargetLine = points.map((p, i) => `${xFor(i)},${yFor(p.generatedTarget)}`).join(" ");

  // Projected line extends from the last actual dot, not the last target — anchoring to
  // the target instead left a visible gap whenever a day's actual value missed or beat it.
  // A brand-new habit with zero real entries yet has no actual dot to anchor from at all —
  // that used to suppress the whole projected line, even though there was plenty to show;
  // it just plots on its own from the first projected point instead.
  const lastActual = points.length > 0 ? points[points.length - 1].actualValue : null;
  const projectedLine =
    cappedProjectedTargets.length > 0
      ? (lastActual !== null ? [`${xFor(points.length - 1)},${yFor(lastActual)}`] : [])
          .concat(cappedProjectedTargets.map((t, i) => `${xFor(points.length + i)},${yFor(t)}`))
          .join(" ")
      : null;

  // The goal dot marks the actual goal value, not wherever the projected curve currently
  // ends — those only converge once the curve fully reaches the goal, so anchoring to the
  // curve's tip left the dot floating off its own axis row until then.
  const tipX = xFor(totalCount - 1);
  const goalY = targetValue !== undefined ? yFor(targetValue) : null;

  // Today's target sits at the same x-slot as the first projected point (right after the
  // last real entry) — shown only while today is still unlogged; once it's logged, that
  // slot becomes a real actual dot instead, so a separate marker would just double up.
  const todayX = todayTarget !== undefined ? xFor(points.length) : null;
  const todayY = todayTarget !== undefined ? yFor(todayTarget) : null;

  // Three-point y-axis (max/mid/min) so the chart reads as a real scale, not just a
  // trend line — recomputed from the same minValue/maxValue as everything else, so it
  // tracks live as entries/targets change.
  const midValue = (minValue + maxValue) / 2;
  const yTicks = [maxValue, midValue, minValue];

  return (
    <View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <Svg width={width} height={CHART_HEIGHT}>
            <Line
              x1={AXIS_GUTTER}
              y1={PADDING_TOP + chartHeight}
              x2={width}
              y2={PADDING_TOP + chartHeight}
              stroke={theme.border}
              strokeWidth={1}
            />
            {/* Vertical axis spine — anchors the tick labels to an actual axis line rather
                than floating numbers. */}
            <Line
              x1={AXIS_GUTTER}
              y1={4}
              x2={AXIS_GUTTER}
              y2={PADDING_TOP + chartHeight}
              stroke={theme.border}
              strokeWidth={1}
            />
            {/* Max/mid gridlines only — min already has the baseline drawn above. */}
            {yTicks.slice(0, 2).map((tick, i) => (
              <Line
                key={`grid-${i}`}
                x1={AXIS_GUTTER}
                y1={yFor(tick)}
                x2={width}
                y2={yFor(tick)}
                stroke={theme.border}
                strokeWidth={1}
                opacity={0.4}
              />
            ))}
            {yTicks.map((tick, i) => (
              <SvgText
                key={`label-${i}`}
                x={0}
                // alignmentBaseline="middle" isn't fully honored on Android's SVG renderer —
                // it lands close but leaves a small residual gap above the line. A manual
                // baseline offset (roughly a third of the font size) is the more reliable
                // way to center a single line of SVG text across platforms.
                y={yFor(tick) + 3.5}
                textAnchor="start"
                fontSize={10}
                fill={theme.textMuted}
              >
                {formatNumber(tick)}
              </SvgText>
            ))}
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
            {/* Painted before the actual dots below — "Today" always sits in the very next
                x-slot after the last real entry, close enough that their invisible tap
                circles overlap. Rendering it first means the last logged dot's own circle
                paints on top in that overlap, so it stays the one that wins the tap instead
                of being shadowed by "Today". */}
            {todayX !== null && todayY !== null && (
              <>
                <Circle cx={todayX} cy={todayY} r={16} fill={theme.text} fillOpacity={0} onPress={handleTodayDotPress} />
                <Circle cx={todayX} cy={todayY} r={5} fill="none" stroke={theme.primary} strokeWidth={2} />
                {todayLabelShown && (
                  <SvgText
                    x={Math.min(Math.max(todayX, PADDING + 16), (width || 0) - PADDING - 16)}
                    y={todayY - 10}
                    textAnchor="middle"
                    fontSize={11}
                    fill={theme.text}
                    fontWeight="600"
                  >
                    {svgValueLabel(todayTarget!, unit)}
                  </SvgText>
                )}
              </>
            )}
            <Polyline points={actualLine} fill="none" stroke={lineColor} strokeWidth={3} />
            {points.map((p, i) => (
              <Fragment key={p.id}>
                {/* Invisible, larger hit area — the visible dot is too small to tap reliably on its own. */}
                <Circle
                  cx={xFor(i)}
                  cy={yFor(p.actualValue)}
                  r={16}
                  fill={theme.text}
                  fillOpacity={0}
                  onPress={() => handleDotPress(i)}
                />
                <Circle
                  cx={xFor(i)}
                  cy={yFor(p.actualValue)}
                  r={i === points.length - 1 ? 5 : 3.5}
                  fill={p.hit ? "#4CAF50" : theme.danger}
                />
              </Fragment>
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
            {targetValue !== undefined && goalY !== null && (
              <>
                <Circle cx={tipX} cy={goalY} r={16} fill={theme.text} fillOpacity={0} onPress={handleGoalDotPress} />
                <Circle cx={tipX} cy={goalY} r={5} fill={GOAL_DOT_COLOR} />
                {goalLabelShown && (
                  <SvgText
                    x={tipX}
                    y={goalY - 10}
                    textAnchor="end"
                    fontSize={11}
                    fill={theme.text}
                    fontWeight="600"
                  >
                    {svgValueLabel(targetValue, unit)}
                  </SvgText>
                )}
              </>
            )}
          </Svg>
        )}
      </View>
      <View style={styles.legend}>
        <LegendItem swatchColor={lineColor} label="Actual" />
        <LegendItem swatchColor={theme.text} label="Target" dashed />
        {cappedProjectedTargets.length > 0 && (
          <LegendItem swatchColor={theme.text} label="Projected" dashed faded />
        )}
        <LegendItem swatchColor="#4CAF50" label="Hit" dot />
        <LegendItem swatchColor={theme.danger} label="Miss" dot />
        {todayTarget !== undefined && <LegendItem swatchColor={theme.primary} label="Today (tap)" dot />}
        {targetValue !== undefined && <LegendItem swatchColor={GOAL_DOT_COLOR} label="Goal (tap)" dot />}
      </View>
    </View>
  );
}

export function LegendItem({
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

export const chartStyles = StyleSheet.create({
  empty: {
    color: theme.textMuted,
    fontSize: 14,
    paddingVertical: 12,
  },
  title: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
    marginBottom: 6,
    textTransform: "uppercase",
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

const styles = chartStyles;
