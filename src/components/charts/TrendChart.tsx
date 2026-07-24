import { useState } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";
import { addDays, today } from "../../engine/dateUtils";
import { theme, UNCATEGORIZED_COLOR } from "../../theme";
import { formatNumber } from "../../utils/format";
import { LoggedEntry } from "../../types";
import { chartStyles, downsample, LegendItem } from "./ProgressChart";

const CHART_HEIGHT = 120;
const PADDING = 12;
const PADDING_TOP = 24;
const AXIS_GUTTER = 28;
// Past this many points, a card-width line chart stops reading as a trend and starts
// reading as noise regardless of how much real history is behind it — "All" is the only
// range that can realistically get this long.
const MAX_POINTS = 60;

export type TrendRangeKey = "7d" | "14d" | "30d" | "all";
const RANGE_DAYS: Record<TrendRangeKey, number | null> = { "7d": 7, "14d": 14, "30d": 30, all: null };

/** "25th", "2nd", "3rd", "11th"/"12th"/"13th" (the 11-13 exceptions to the usual 1st/2nd/3rd pattern). */
function ordinalDay(dateIso: string): string {
  const day = parseInt(dateIso.slice(8, 10), 10);
  if (day >= 11 && day <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

/**
 * "Trend" — plain actual/target lines only, no dots and no projection (see ProgressChart,
 * "Current", for that). Which window (7D/2W/30D/All) is showing is owned by the parent
 * (HabitProgressChart), which also decides which of those tabs are even worth offering.
 */
export function TrendChart({
  entries,
  range,
  color,
}: {
  entries: LoggedEntry[];
  range: TrendRangeKey;
  color: string;
}) {
  const [width, setWidth] = useState(0);

  const allPoints = entries.filter(
    (e): e is LoggedEntry & { actualValue: number } => e.actualValue !== undefined
  );
  const days = RANGE_DAYS[range];
  // 7D is the last 7 logged entries, not the last 7 calendar days — a habit with a gap
  // would otherwise show fewer than 7 points against a calendar-fixed header row, or reach
  // further back than "7 days" actually implies once dates and data agree with each other.
  const windowed =
    range === "7d"
      ? allPoints.slice(-7)
      : days === null
        ? allPoints
        : allPoints.filter((p) => p.date >= addDays(today(), -(days - 1)));
  const points = downsample(windowed, MAX_POINTS);

  const lineColor = color === UNCATEGORIZED_COLOR ? theme.primary : color;

  const totalCount = Math.max(points.length, 2);
  const values = points.flatMap((p) => [p.actualValue, p.generatedTarget]);
  const minValue = values.length > 0 ? Math.min(...values) : 0;
  const maxValue = values.length > 0 ? Math.max(...values) : 1;
  const valueRange = maxValue - minValue || 1;

  const chartWidth = Math.max(width - AXIS_GUTTER - PADDING, 0);
  const chartHeight = CHART_HEIGHT - PADDING_TOP - PADDING;

  const xFor = (index: number) => AXIS_GUTTER + (index / (totalCount - 1)) * chartWidth;
  const yFor = (value: number) => PADDING_TOP + chartHeight - ((value - minValue) / valueRange) * chartHeight;

  const actualLine = points.map((p, i) => `${xFor(i)},${yFor(p.actualValue)}`).join(" ");
  const targetLine = points.map((p, i) => `${xFor(i)},${yFor(p.generatedTarget)}`).join(" ");

  const midValue = (minValue + maxValue) / 2;
  const yTicks = [maxValue, midValue, minValue];

  if (points.length === 0) {
    return <Text style={chartStyles.empty}>No entries in this range.</Text>;
  }

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
            <Line
              x1={AXIS_GUTTER}
              y1={4}
              x2={AXIS_GUTTER}
              y2={PADDING_TOP + chartHeight}
              stroke={theme.border}
              strokeWidth={1}
            />
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
                y={yFor(tick) + 3.5}
                textAnchor="start"
                fontSize={10}
                fill={theme.textMuted}
              >
                {formatNumber(tick)}
              </SvgText>
            ))}
            <Polyline
              points={targetLine}
              fill="none"
              stroke={theme.text}
              strokeWidth={1.5}
              strokeDasharray="6,4"
              opacity={0.55}
            />
            <Polyline points={actualLine} fill="none" stroke={lineColor} strokeWidth={2.5} />
            {/* A single point can't render as a line at all (SVG needs 2+ coordinates) —
                without this, a window with exactly one entry would show nothing. */}
            {points.length === 1 && (
              <Circle cx={xFor(0)} cy={yFor(points[0].actualValue)} r={3} fill={lineColor} />
            )}
            {/* Small purely-decorative markers on 7D/2W only — not tappable, just barely
                bigger than the line itself, so individual check-ins are still visible
                without turning into the tap-heavy dots ProgressChart's "Current" view has. */}
            {(range === "7d" || range === "14d") &&
              points.length > 1 &&
              points.map((p, i) => (
                <Circle
                  key={p.id}
                  cx={xFor(i)}
                  cy={yFor(p.actualValue)}
                  r={3}
                  fill={p.hit ? "#4CAF50" : theme.danger}
                />
              ))}
            {/* Date labels along the top — only for 7D, one per actual point (matching
                `windowed`'s "last 7 logged entries" above), positioned at that point's own
                xFor(i) so a label always lines up with the point it names. */}
            {range === "7d" &&
              points.map((p, i) => (
                <SvgText
                  key={`date-${p.id}`}
                  x={xFor(i)}
                  y={12}
                  textAnchor="middle"
                  fontSize={8}
                  fill={theme.textMuted}
                >
                  {ordinalDay(p.date)}
                </SvgText>
              ))}
          </Svg>
        )}
      </View>
      <View style={chartStyles.legend}>
        <LegendItem swatchColor={lineColor} label="Actual" />
        <LegendItem swatchColor={theme.text} label="Target" dashed />
        {(range === "7d" || range === "14d") && points.length > 1 && (
          <>
            <LegendItem swatchColor="#4CAF50" label="Hit" dot />
            <LegendItem swatchColor={theme.danger} label="Miss" dot />
          </>
        )}
      </View>
    </View>
  );
}
