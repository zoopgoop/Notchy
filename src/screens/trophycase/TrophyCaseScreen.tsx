import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { Modal, Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import { PageTitle, Screen } from "../../components/ui/Screen";
import { CELEBRATION_COPY, TROPHY_CASE_SECTION_ORDER } from "../../components/celebration/celebrationCopy";
import {
  AchievementFamily,
  AchievementProgress,
  evaluateAchievements,
  FAMILY_LABELS,
  FAMILY_ORDER,
} from "../../services/achievements";
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
  const [achievements, setAchievements] = useState<AchievementProgress[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<AchievementProgress | null>(null);

  const refetch = useCallback(async () => {
    setItems(await loadTrophyCaseItems());
    setStats(await loadTrophyCaseStats());
    setAchievements((await evaluateAchievements()).progress);
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
            <AchievementGrid achievements={achievements} onSelect={setSelectedBadge} />
            {items.length > 0 && <Text style={styles.sectionHeader}>Recent Celebrations</Text>}
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
      {selectedBadge && (
        <AchievementDetailModal item={selectedBadge} onClose={() => setSelectedBadge(null)} />
      )}
    </Screen>
  );
}

function groupByFamily(achievements: AchievementProgress[]): { family: AchievementFamily; items: AchievementProgress[] }[] {
  return FAMILY_ORDER.map((family) => ({
    family,
    items: achievements.filter((a) => a.def.family === family),
  })).filter((group) => group.items.length > 0);
}

function AchievementGrid({
  achievements,
  onSelect,
}: {
  achievements: AchievementProgress[];
  onSelect: (item: AchievementProgress) => void;
}) {
  if (achievements.length === 0) return null;
  const groups = groupByFamily(achievements);
  const earnedCount = achievements.filter((a) => a.earnedAt !== null).length;

  return (
    <View style={styles.achievementsSection}>
      <Text style={styles.sectionHeader}>
        Achievements · {earnedCount} of {achievements.length}
      </Text>
      {groups.map(({ family, items }) => (
        <View key={family} style={styles.familyBlock}>
          <Text style={styles.familyHeader}>
            {FAMILY_LABELS[family]} · {items.filter((a) => a.earnedAt !== null).length} of {items.length}
          </Text>
          <View style={styles.badgeGrid}>
            {items.map((item) => (
              <AchievementBadge key={item.def.key} item={item} onPress={() => onSelect(item)} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function AchievementBadge({ item, onPress }: { item: AchievementProgress; onPress: () => void }) {
  const earned = item.earnedAt !== null;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.badgeTile, !earned && styles.badgeTileLocked, pressed && styles.badgeTilePressed]}
    >
      <Text style={[styles.badgeTileEmoji, !earned && styles.badgeTileEmojiLocked]}>{item.def.emoji}</Text>
      <Text style={[styles.badgeTileTitle, !earned && styles.badgeTileTitleLocked]} numberOfLines={2}>
        {item.def.title}
      </Text>
    </Pressable>
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

function AchievementDetailModal({ item, onClose }: { item: AchievementProgress; onClose: () => void }) {
  const earned = item.earnedAt !== null;
  const { target } = item.def;
  const showProgress = !earned && target !== undefined && item.current !== undefined;
  const progressFraction = showProgress ? Math.min(item.current! / target!, 1) : 0;

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.modalEmoji, !earned && styles.badgeTileEmojiLocked]}>{item.def.emoji}</Text>
          <Text style={styles.modalTitle}>{item.def.title}</Text>
          <Text style={styles.modalDescription}>{item.def.description}</Text>
          {showProgress && (
            <View style={styles.progressWrap}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progressFraction * 100}%` }]} />
              </View>
              <Text style={styles.progressLabel}>
                {Math.min(item.current!, target!)} of {target}
              </Text>
            </View>
          )}
          <Text style={styles.modalStatus}>{earned ? `Earned ${item.earnedAt}` : "Not earned yet"}</Text>
          <Pressable style={styles.modalCloseButton} onPress={onClose}>
            <Text style={styles.modalCloseText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: 16,
  },
  achievementsSection: {
    marginTop: 8,
  },
  familyBlock: {
    marginBottom: 16,
  },
  familyHeader: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  badgeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  badgeTile: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 10,
    width: 88,
    ...cardShadow,
  },
  badgeTileLocked: {
    opacity: 0.4,
  },
  badgeTilePressed: {
    opacity: 0.7,
  },
  badgeTileEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  badgeTileEmojiLocked: {
    opacity: 0.5,
  },
  badgeTileTitle: {
    color: theme.text,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  badgeTileTitleLocked: {
    color: theme.textMuted,
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
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    flex: 1,
    justifyContent: "center",
    padding: 32,
  },
  modalCard: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 24,
    width: "100%",
    ...cardShadow,
  },
  modalEmoji: {
    fontSize: 48,
    marginBottom: 12,
    textAlign: "center",
  },
  modalTitle: {
    color: theme.text,
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center",
  },
  modalDescription: {
    color: theme.textMuted,
    fontSize: 14,
    marginBottom: 12,
    textAlign: "center",
  },
  progressWrap: {
    marginBottom: 16,
  },
  progressTrack: {
    backgroundColor: theme.background,
    borderRadius: 4,
    height: 8,
    overflow: "hidden",
    width: "100%",
  },
  progressFill: {
    backgroundColor: theme.primary,
    borderRadius: 4,
    height: "100%",
  },
  progressLabel: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 6,
    textAlign: "center",
  },
  modalStatus: {
    color: theme.primary,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 20,
    textAlign: "center",
  },
  modalCloseButton: {
    alignItems: "center",
    backgroundColor: theme.primary,
    borderRadius: 10,
    paddingVertical: 12,
  },
  modalCloseText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
