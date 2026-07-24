import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { addDays, today } from "../../engine/dateUtils";
import { theme } from "../../theme";
import { LoggedEntry } from "../../types";
import { ProgressChart } from "./ProgressChart";
import { TrendChart, TrendRangeKey } from "./TrendChart";

type RangeKey = "current" | TrendRangeKey;
const RANGE_META: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "current", label: "Current", days: null },
  { key: "7d", label: "7D", days: 7 },
  { key: "14d", label: "2W", days: 14 },
  { key: "30d", label: "30D", days: 30 },
  { key: "all", label: "All", days: null },
];

/**
 * One toggle, five peer options, one chart on screen at a time. "Current" is the detailed
 * dots-and-projection view (ProgressChart) across the goal's full history — always
 * available, same as "All". 7D/2W/30D are the trend-shape-only view (TrendChart) and only
 * show up once they'd hold strictly more points than the tier before them — the windows
 * nest (7 ⊂ 14 ⊂ 30), so "this window has a point" is trivially true for every wider tier
 * the moment a narrower one does, which isn't the same as that tier having anything new.
 */
export function HabitProgressChart({
  entries,
  projectedTargets = [],
  targetValue,
  todayTarget,
  color,
  unit,
}: {
  entries: LoggedEntry[];
  projectedTargets?: number[];
  targetValue?: number;
  todayTarget?: number;
  color: string;
  unit: string;
}) {
  const [range, setRange] = useState<RangeKey>("current");
  const allPoints = entries.filter((e) => e.actualValue !== undefined);

  const countWithin = (days: number | null) => {
    if (days === null) return allPoints.length;
    const cutoff = addDays(today(), -(days - 1));
    return allPoints.filter((p) => p.date >= cutoff).length;
  };
  // Below a full week of data, 7D/2W/30D aren't offered at all — Current and All are the
  // only two that make sense with that little history.
  const hasWeekOfData = allPoints.length >= 7;
  const availableOptions = RANGE_META.filter((opt, i) => {
    if (opt.key === "current" || opt.key === "all") return true;
    if (!hasWeekOfData) return false;
    const priorDays = i === 1 ? 0 : RANGE_META[i - 1].days;
    return countWithin(opt.days) > countWithin(priorDays);
  });
  const effectiveRange: RangeKey = availableOptions.some((o) => o.key === range) ? range : "current";

  return (
    <View>
      <View style={styles.rangeRow}>
        {availableOptions.map((opt) => (
          <Pressable
            key={opt.key}
            onPress={() => setRange(opt.key)}
            style={[styles.rangePill, effectiveRange === opt.key && styles.rangePillActive]}
          >
            <Text style={[styles.rangePillText, effectiveRange === opt.key && styles.rangePillTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {effectiveRange === "current" ? (
        <ProgressChart
          entries={entries}
          projectedTargets={projectedTargets}
          targetValue={targetValue}
          todayTarget={todayTarget}
          color={color}
          unit={unit}
        />
      ) : (
        <TrendChart entries={entries} range={effectiveRange} color={color} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rangeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  rangePill: {
    borderColor: theme.border,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  rangePillActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  rangePillText: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
  rangePillTextActive: {
    color: "#FFFFFF",
  },
});
