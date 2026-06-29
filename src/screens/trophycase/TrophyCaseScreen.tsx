import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { SectionList, StyleSheet, Text, View } from "react-native";
import { PageTitle, Screen } from "../../components/ui/Screen";
import { CELEBRATION_COPY, TROPHY_CASE_SECTION_ORDER } from "../../components/celebration/celebrationCopy";
import { loadTrophyCaseItems, loadTrophyCaseStats, TrophyCaseItem, TrophyCaseStats } from "../../services/trophyCase";
import { CelebrationType } from "../../types";
import { cardShadow, theme } from "../../theme";

interface TrophySection {
  type: CelebrationType;
  title: string;
  data: TrophyCaseItem[];
}

function groupByType(items: TrophyCaseItem[]): TrophySection[] {
  return TROPHY_CASE_SECTION_ORDER.map((type) => ({
    type,
    title: CELEBRATION_COPY[type].sectionLabel,
    data: items.filter((item) => item.celebration.type === type),
  })).filter((section) => section.data.length > 0);
}

export function TrophyCaseScreen() {
  const [items, setItems] = useState<TrophyCaseItem[]>([]);
  const [stats, setStats] = useState<TrophyCaseStats | null>(null);

  const refetch = useCallback(async () => {
    setItems(await loadTrophyCaseItems());
    setStats(await loadTrophyCaseStats());
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const sections = groupByType(items);

  return (
    <Screen scroll={false}>
      <SectionList
        overScrollMode="never"
        sections={sections}
        keyExtractor={(item) => item.celebration.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <>
            <PageTitle
              subtitle={
                items.length > 0
                  ? `${items.length} troph${items.length === 1 ? "y" : "ies"} earned`
                  : undefined
              }
            >
              Trophy Case
            </PageTitle>
            {stats && (
              <View style={styles.statsGrid}>
                <StatTile label="Logs this month" value={stats.logsThisMonth} />
                <StatTile label="Goals achieved" value={stats.goalsAchieved} />
                <StatTile label="Habits created" value={stats.habitsCreated} />
                <StatTile label="Active habits" value={stats.activeHabits} />
              </View>
            )}
          </>
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>
            {section.title} · {section.data.length}
          </Text>
        )}
        renderItem={({ item }) => <TrophyRow item={item} />}
        ListEmptyComponent={
          <Text style={styles.empty}>No celebrations yet — they'll show up here as you log goals.</Text>
        }
      />
    </Screen>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function TrophyRow({ item }: { item: TrophyCaseItem }) {
  const copy = CELEBRATION_COPY[item.celebration.type];
  const subtitle =
    item.celebration.type === "streak_milestone"
      ? `${item.celebration.metadata?.streak ?? ""}-day streak · ${item.habitName}`
      : item.habitName;

  return (
    <View style={styles.row}>
      <View style={[styles.badge, { backgroundColor: `${copy.color}33` }]}>
        <Text style={styles.badgeEmoji}>{copy.emoji}</Text>
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{copy.title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.date}>{item.celebration.date}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: 16,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 8,
    marginTop: 16,
  },
  statTile: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    flexBasis: "47%",
    flexGrow: 1,
    padding: 14,
    ...cardShadow,
  },
  statValue: {
    color: theme.primary,
    fontSize: 24,
    fontWeight: "800",
  },
  statLabel: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  sectionHeader: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 18,
    textTransform: "uppercase",
  },
  row: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderRadius: 12,
    flexDirection: "row",
    marginBottom: 10,
    padding: 14,
    ...cardShadow,
  },
  badge: {
    alignItems: "center",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    marginRight: 14,
    width: 48,
  },
  badgeEmoji: {
    fontSize: 24,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "700",
  },
  rowSubtitle: {
    color: theme.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  date: {
    color: theme.textMuted,
    fontSize: 12,
  },
  empty: {
    color: theme.textMuted,
    fontSize: 15,
    marginTop: 24,
    textAlign: "center",
  },
});
