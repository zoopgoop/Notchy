import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { Animated, Easing, FlatList, LayoutAnimation, Pressable, StyleSheet, Text, View } from "react-native";
import { CelebrationOverlay } from "../../components/celebration/CelebrationOverlay";
import { HabitLogCalendar } from "../../components/charts/HabitLogCalendar";
import { ProgressChart } from "../../components/charts/ProgressChart";
import { ActionSheet, ActionSheetOption } from "../../components/ui/ActionSheet";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { PageTitle, Screen } from "../../components/ui/Screen";
import {
  deleteEntry,
  getHabit,
  listAchievedGoals,
  listEntriesByGoal,
  listSkipsByGoal,
  setGoalActive,
  updateGoal,
} from "../../db/repositories";
import { useDailyGoals } from "../../hooks/useDailyGoals";
import { pickPrimaryCelebration } from "../../services/celebrations";
import { DailyGoalView } from "../../services/dailyGoals";
import { logGoalEntry, skipGoalToday, spendSkipsToSaveStreak } from "../../services/dailyStatus";
import { getFreezesEnabled, getSkipsEnabled, getUserName } from "../../services/settings";
import { forfeitCurrentStreak, recomputeStreak } from "../../services/streaks";
import { loadWeeklySummary, WeeklySummary } from "../../services/weeklySummary";
import { addDays, daysBetween, today } from "../../engine/dateUtils";
import { cardShadow, theme, UNCATEGORIZED_COLOR } from "../../theme";
import { Celebration, Goal, Habit, LoggedEntry, SkipLog } from "../../types";
import { formatNumber, unitSuffix } from "../../utils/format";
import { shouldShowMomentum } from "../../utils/momentum";
import { HomeStackParamList } from "../../navigation/types";
import { HabitAchievedPrompt } from "./HabitAchievedPrompt";
import { MissedDeadlinePrompt } from "./MissedDeadlinePrompt";
import { SaveStreakPrompt } from "./SaveStreakPrompt";
import { StreakLostPrompt } from "./StreakLostPrompt";

type Props = NativeStackScreenProps<HomeStackParamList, "Home">;

interface AchievedItem {
  goal: Goal;
  habit: Habit;
}

type DialogState =
  | { kind: "skipConfirm"; view: DailyGoalView }
  | { kind: "skipInfo"; view: DailyGoalView }
  | { kind: "cantSkip"; reason: string }
  | { kind: "deactivateConfirm"; view: DailyGoalView }
  | null;

function formatNextDue(nextDue: string | null): string | null {
  if (!nextDue) return null;
  const todayStr = today();
  if (nextDue === todayStr) return "Today";
  if (nextDue === addDays(todayStr, 1)) return "Tomorrow";
  return new Date(nextDue).toLocaleDateString(undefined, { weekday: "short" });
}

export function HomeScreen({ navigation }: Props) {
  const { items, refetch } = useDailyGoals();
  const [name, setName] = useState<string | null>(null);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [actionSheetView, setActionSheetView] = useState<DailyGoalView | null>(null);
  const [achievedItems, setAchievedItems] = useState<AchievedItem[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [celebrationState, setCelebrationState] = useState<{ celebration: Celebration; view: DailyGoalView } | null>(
    null
  );
  const [achievedView, setAchievedView] = useState<DailyGoalView | null>(null);
  const [daysEarly, setDaysEarly] = useState<number | null>(null);
  const [skipsEnabled, setSkipsEnabled] = useState(true);
  const [freezesEnabled, setFreezesEnabled] = useState(true);
  const [letGoFor, setLetGoFor] = useState<string | null>(null);

  const loadAchieved = useCallback(async () => {
    const goals = await listAchievedGoals();
    const habits = await Promise.all(goals.map((g) => getHabit(g.habitId)));
    setAchievedItems(
      goals
        .map((goal, i) => (habits[i] ? { goal, habit: habits[i] as Habit } : null))
        .filter((item): item is AchievedItem => item !== null)
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      refetch();
      getUserName().then(setName);
      loadWeeklySummary().then(setWeeklySummary);
      loadAchieved();
      getSkipsEnabled().then(setSkipsEnabled);
      getFreezesEnabled().then(setFreezesEnabled);
    }, [refetch, loadAchieved])
  );

  const missedDeadlineView = useMemo(
    () => items.find((item) => item.daysUntilTarget !== null && item.daysUntilTarget < 0) ?? null,
    [items]
  );

  const crisisView = useMemo(() => items.find((item) => item.isCrisis) ?? null, [items]);
  const canSpendSkips = !!crisisView && crisisView.skipsRemaining >= crisisView.skipsNeededToSave;
  const showSaveStreak = !!crisisView && canSpendSkips && letGoFor !== crisisView.goal.id;
  const showLostStreak = !!crisisView && (!canSpendSkips || letGoFor === crisisView.goal.id);

  async function performSkip(view: DailyGoalView) {
    const result = await skipGoalToday(view.goal, today());
    if (!result.ok) {
      setDialog({ kind: "cantSkip", reason: result.reason });
      return;
    }
    refetch();
  }

  async function performDeactivate(view: DailyGoalView) {
    await forfeitCurrentStreak(view.goal.id);
    await setGoalActive(view.goal.id, false);
    refetch();
  }

  /** One-tap completion for Yes/No habits — no value to enter, so skip the log screen entirely. */
  async function handleYes(view: DailyGoalView) {
    const { celebrations } = await logGoalEntry({
      goal: view.goal,
      habit: view.habit,
      date: today(),
      actualValue: 1,
      generatedTarget: 1,
      tagIds: [],
    });
    // The card updates right away regardless — the celebration overlay is a bonus
    // on top, not a gate the user has to clear before they see today's state change.
    refetch();
    const primary = pickPrimaryCelebration(celebrations);
    if (primary) {
      setCelebrationState({ celebration: primary, view });
    }
  }

  /** Deselecting a Yes/No habit just removes today's entry — nothing meaningful to "edit". */
  async function handleUndoYes(view: DailyGoalView) {
    if (view.status.kind !== "logged") return;
    await deleteEntry(view.status.entry.id);
    await recomputeStreak(view.goal);
    refetch();
  }

  function handleEditAndContinue() {
    if (!achievedView) return;
    navigation.navigate("HabitGoalForm", { editGoalId: achievedView.goal.id });
  }

  function handleMarkComplete() {
    setAchievedView(null);
    refetch();
  }

  function handleLongPress(view: DailyGoalView) {
    setActionSheetView(view);
  }

  async function handleExtendDeadline(newDate: string) {
    if (!missedDeadlineView) return;
    await updateGoal(missedDeadlineView.goal.id, { targetDate: newDate });
    refetch();
  }

  async function handleSpendSkips(view: DailyGoalView) {
    await spendSkipsToSaveStreak(view.goal, today(), view.skipsNeededToSave);
    refetch();
  }

  function handleLetItGo(view: DailyGoalView) {
    setLetGoFor(view.goal.id);
  }

  async function handleStartAgainAfterLoss(view: DailyGoalView) {
    await forfeitCurrentStreak(view.goal.id);
    setLetGoFor(null);
    refetch();
  }

  async function handleAdjustHabitAfterLoss(view: DailyGoalView) {
    await forfeitCurrentStreak(view.goal.id);
    setLetGoFor(null);
    navigation.navigate("HabitGoalForm", { editGoalId: view.goal.id });
  }

  const actionSheetOptions: ActionSheetOption[] = actionSheetView
    ? [
        {
          label: "View Details",
          onPress: () => navigation.navigate("HabitDetail", { habitId: actionSheetView.habit.id }),
        },
        ...(freezesEnabled
          ? [
              {
                label: "Add Freeze Window",
                onPress: () => navigation.navigate("FreezeWindowForm", { goalId: actionSheetView.goal.id }),
              },
            ]
          : []),
        {
          label: "Deactivate Habit",
          destructive: true,
          onPress: () => setDialog({ kind: "deactivateConfirm", view: actionSheetView }),
        },
      ]
    : [];

  const loggedCount = items.filter((item) => item.status.kind === "logged").length;

  return (
    <Screen scroll={false}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.goal.id}
        contentContainerStyle={styles.list}
        overScrollMode="never"
        ListHeaderComponent={
          <View style={styles.header}>
            <PageTitle
              subtitle={
                items.length > 0 ? `${loggedCount} of ${items.length} logged` : "Here are your goals for today"
              }
            >
              {name ? `Hi, ${name} 👋` : "Today"}
            </PageTitle>
            {weeklySummary && weeklySummary.totalPossible > 0 && (
              <View style={styles.weeklyCard}>
                <Text style={styles.weeklyHeadline}>
                  {weeklySummary.totalHits} of {weeklySummary.totalPossible} this week
                </Text>
                {weeklySummary.bestDay && (
                  <Text style={styles.weeklySubtext}>
                    Best day: {weeklySummary.bestDay.date} ({weeklySummary.bestDay.hits} hit
                    {weeklySummary.bestDay.hits === 1 ? "" : "s"})
                  </Text>
                )}
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <GoalCard
            view={item}
            skipsEnabled={skipsEnabled}
            onLog={() => navigation.navigate("LogEntry", { goalId: item.goal.id })}
            onYes={() => handleYes(item)}
            onUndoYes={() => handleUndoYes(item)}
            onSkip={() => setDialog({ kind: "skipConfirm", view: item })}
            onSkipInfo={() => setDialog({ kind: "skipInfo", view: item })}
            onLongPress={() => handleLongPress(item)}
          />
        )}
        ListFooterComponent={
          achievedItems.length > 0 ? (
            <View style={styles.completedSection}>
              <Pressable
                style={({ pressed }) => [styles.completedHeader, pressed && styles.logAgainPressed]}
                onPress={() => setShowCompleted((c) => !c)}
              >
                <Text style={styles.completedHeaderText}>Completed Habits ({achievedItems.length})</Text>
                <Ionicons
                  name={showCompleted ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={theme.textMuted}
                />
              </Pressable>
              {showCompleted &&
                achievedItems.map(({ goal, habit }) => (
                  <Pressable
                    key={goal.id}
                    style={styles.completedRow}
                    onPress={() => navigation.navigate("HabitDetail", { habitId: habit.id })}
                  >
                    <Text style={styles.completedRowText}>{habit.name}</Text>
                    <Text style={styles.completedRowDate}>{goal.achievedAt}</Text>
                  </Pressable>
                ))}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            Nothing to track yet. Tap + to create your first habit — log it daily and watch your
            progress build in Calendar and Trophy Case.
          </Text>
        }
      />
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => navigation.navigate("HabitGoalForm", undefined)}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      <ActionSheet
        visible={actionSheetView !== null}
        title={actionSheetView?.habit.name}
        options={actionSheetOptions}
        onClose={() => setActionSheetView(null)}
      />

      {missedDeadlineView && missedDeadlineView.goal.targetDate && dialog === null && (
        <MissedDeadlinePrompt
          currentTargetDate={missedDeadlineView.goal.targetDate}
          onExtend={handleExtendDeadline}
          onDeactivate={() => setDialog({ kind: "deactivateConfirm", view: missedDeadlineView })}
        />
      )}

      {crisisView && dialog === null && !missedDeadlineView && showSaveStreak && (
        <SaveStreakPrompt
          habitName={crisisView.habit.name}
          skipsNeeded={crisisView.skipsNeededToSave}
          onSpendSkips={() => handleSpendSkips(crisisView)}
          onLetItGo={() => handleLetItGo(crisisView)}
        />
      )}

      {crisisView && dialog === null && !missedDeadlineView && showLostStreak && (
        <StreakLostPrompt
          habitName={crisisView.habit.name}
          onAdjustHabit={() => handleAdjustHabitAfterLoss(crisisView)}
          onStartAgain={() => handleStartAgainAfterLoss(crisisView)}
        />
      )}

      {dialog?.kind === "skipConfirm" && (
        <ConfirmDialog
          visible
          title="Skip today?"
          message={`You'll have ${dialog.view.skipsRemaining - 1} skip${
            dialog.view.skipsRemaining - 1 === 1 ? "" : "s"
          } left this fortnight.`}
          confirmLabel="Skip"
          cancelLabel="Cancel"
          onConfirm={() => {
            setDialog(null);
            performSkip(dialog.view);
          }}
          onCancel={() => setDialog(null)}
        />
      )}

      {dialog?.kind === "skipInfo" && (
        <ConfirmDialog
          visible
          title="About Skip"
          message={`Skip is free, no explanation needed, and won't break your streak. You get ${dialog.view.skipLimit} per rolling fortnight for this habit — a release valve for genuine rest days, not a loophole.`}
          confirmLabel="Got it"
          onConfirm={() => setDialog(null)}
        />
      )}

      {dialog?.kind === "cantSkip" && (
        <ConfirmDialog
          visible
          title="Can't skip"
          message={dialog.reason}
          confirmLabel="OK"
          onConfirm={() => setDialog(null)}
        />
      )}

      {dialog?.kind === "deactivateConfirm" && (
        <ConfirmDialog
          visible
          title="Deactivate this habit?"
          message="This isn't a freeze or a skip — your current streak will be lost for good. Use those instead if you want a break without losing it. Deactivating just removes the habit from today's list; nothing is deleted, and you can reactivate it later from its detail screen or by pressing and holding it on the Habits tab."
          confirmLabel="Deactivate"
          cancelLabel="Cancel"
          destructive
          onConfirm={() => {
            setDialog(null);
            performDeactivate(dialog.view);
          }}
          onCancel={() => setDialog(null)}
        />
      )}

      {celebrationState && (
        <CelebrationOverlay
          celebration={celebrationState.celebration}
          habitName={celebrationState.view.habit.name}
          onDismiss={() => {
            const { celebration, view } = celebrationState;
            setCelebrationState(null);
            if (celebration.type === "goal_achieved") {
              setDaysEarly(view.goal.targetDate ? daysBetween(today(), view.goal.targetDate) : null);
              setAchievedView(view);
            } else {
              refetch();
            }
          }}
        />
      )}

      {achievedView && (
        <HabitAchievedPrompt
          habitName={achievedView.habit.name}
          daysEarly={daysEarly}
          onEditAndContinue={handleEditAndContinue}
          onMarkComplete={handleMarkComplete}
        />
      )}
    </Screen>
  );
}

/** A slow, continuous pulse on the streak badge — the one piece of UI worth drawing the eye to. */
function PulsingStreak({ value }: { value: number }) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.18, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);

  return (
    <Animated.Text style={[styles.streak, { transform: [{ scale }] }]}>🔥 {value}</Animated.Text>
  );
}

function GoalCard({
  view,
  skipsEnabled,
  onLog,
  onYes,
  onUndoYes,
  onSkip,
  onSkipInfo,
  onLongPress,
}: {
  view: DailyGoalView;
  skipsEnabled: boolean;
  onLog: () => void;
  onYes: () => void;
  onUndoYes: () => void;
  onSkip: () => void;
  onSkipInfo: () => void;
  onLongPress: () => void;
}) {
  const {
    goal,
    habit,
    category,
    status,
    momentum,
    streak,
    skipsRemaining,
    weeklyProgress,
    daysUntilTarget,
    nextDue,
    isUrgentToday,
    isCrisis,
  } = view;
  const unit = unitSuffix(habit.unitLabel);
  const color = category?.color ?? UNCATEGORIZED_COLOR;
  const statusColor =
    status.kind === "logged" ? "#4CAF50" : isUrgentToday || isCrisis ? theme.danger : theme.warning;

  const [expanded, setExpanded] = useState(false);
  const [entries, setEntries] = useState<LoggedEntry[] | null>(null);
  const [skips, setSkips] = useState<SkipLog[]>([]);

  // Refetches whenever the card opens, and again whenever a log/undo changes status while
  // it's already open — otherwise the chart silently shows whatever was logged as of the
  // last time it was opened.
  useEffect(() => {
    if (!expanded) return;
    listEntriesByGoal(goal.id).then(setEntries);
    listSkipsByGoal(goal.id).then(setSkips);
  }, [expanded, goal.id, status.kind]);

  function toggleExpanded() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((current) => !current);
  }

  const nextDueLabel = formatNextDue(nextDue);

  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      <Pressable
        style={({ pressed }) => [styles.cardHeader, pressed && styles.cardHeaderPressed]}
        onPress={toggleExpanded}
        onLongPress={onLongPress}
      >
        <View style={styles.cardHeaderLeft}>
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
          <Text style={styles.habitName}>{habit.name}</Text>
          {streak.current > 0 &&
            (isUrgentToday || isCrisis ? (
              <PulsingStreak value={streak.current} />
            ) : (
              <Text style={styles.streak}>🔥 {streak.current}</Text>
            ))}
          {shouldShowMomentum(momentum) && (
            <Text style={styles.momentum}>{momentum === "up" ? "↗" : "→"}</Text>
          )}
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={theme.textMuted} />
      </Pressable>

      <View style={styles.metaRow}>
        {weeklyProgress.required < 7 && (
          <Text style={styles.metaText}>
            {weeklyProgress.earned}/{weeklyProgress.required} check-ins this week
          </Text>
        )}
        {daysUntilTarget !== null && (
          <Text style={styles.metaText}>{Math.max(daysUntilTarget, 0)} days left</Text>
        )}
        {nextDueLabel && <Text style={styles.metaText}>Next due: {nextDueLabel}</Text>}
      </View>
      {isUrgentToday && (
        <Text style={styles.urgentText}>⚠️ Complete a check-in today to keep your streak alive!</Text>
      )}

      {expanded && (
        <View style={styles.chartBox}>
          {entries === null ? (
            <Text style={styles.muted}>Loading…</Text>
          ) : habit.type === "boolean" ? (
            <HabitLogCalendar entries={entries} skips={skips} />
          ) : (
            <ProgressChart entries={entries} targetValue={goal.targetValue} color={color} unit={unit} />
          )}
        </View>
      )}

      {status.kind === "frozen" && (
        <View style={styles.statusRow}>
          <Ionicons name="snow-outline" size={16} color={theme.frozen} />
          <Text style={styles.muted}>Frozen — no target today</Text>
        </View>
      )}

      {status.kind === "skipped" && (
        <View style={styles.statusRow}>
          <Ionicons name="play-skip-forward-outline" size={16} color={theme.warning} />
          <Text style={styles.muted}>Skipped today</Text>
        </View>
      )}

      {status.kind === "logged" && (
        <>
          <View style={styles.statusRow}>
            <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
            <Text style={styles.success}>
              {habit.type !== "boolean" && status.entry.actualValue !== undefined
                ? `Logged: ${formatNumber(status.entry.actualValue)}${unit}`
                : "Done"}
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.logAgainButton, pressed && styles.logAgainPressed]}
            onPress={habit.type === "boolean" ? onUndoYes : onLog}
          >
            <Text style={styles.logAgainText}>{habit.type === "boolean" ? "Reset Log" : "Edit Log"}</Text>
          </Pressable>
        </>
      )}

      {status.kind === "pending" && (
        <>
          {habit.type !== "boolean" && (
            <Text style={styles.target}>
              Daily target: {formatNumber(status.target)}
              {unit}
            </Text>
          )}
          <View style={styles.actions}>
            {habit.type === "boolean" ? (
              <Pressable
                style={({ pressed }) => [styles.yesButton, pressed && styles.pressedButton]}
                onPress={onYes}
              >
                <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                <Text style={styles.logButtonText}>Yes</Text>
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.logButton, pressed && styles.pressedButton]}
                onPress={onLog}
              >
                <Text style={styles.logButtonText}>Log</Text>
              </Pressable>
            )}
            {skipsEnabled && (
              <>
                <Pressable
                  style={({ pressed }) => [
                    styles.skipButton,
                    skipsRemaining <= 0 && styles.skipButtonDisabled,
                    pressed && skipsRemaining > 0 && styles.pressedButton,
                  ]}
                  onPress={onSkip}
                  disabled={skipsRemaining <= 0}
                >
                  <Text style={styles.skipButtonText}>Skip</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.skipInfoButton, pressed && styles.logAgainPressed]}
                  onPress={onSkipInfo}
                >
                  <Ionicons name="information-circle-outline" size={20} color={theme.textMuted} />
                </Pressable>
              </>
            )}
          </View>
          {skipsEnabled && skipsRemaining <= 0 && (
            <Text style={styles.skipExhausted}>No skips left this fortnight.</Text>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: 16,
    paddingBottom: 88,
  },
  fab: {
    alignItems: "center",
    backgroundColor: theme.primary,
    borderRadius: 28,
    bottom: 24,
    elevation: 6,
    height: 56,
    justifyContent: "center",
    position: "absolute",
    right: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    width: 56,
  },
  fabPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.93 }],
  },
  fabText: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "400",
    lineHeight: 32,
  },
  header: {
    marginBottom: 20,
  },
  weeklyCard: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    marginTop: 16,
    padding: 14,
    ...cardShadow,
  },
  weeklyHeadline: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "700",
  },
  weeklySubtext: {
    color: theme.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  streak: {
    color: theme.warning,
    fontSize: 15,
    fontWeight: "700",
    marginLeft: 8,
  },
  card: {
    backgroundColor: theme.surface,
    borderLeftWidth: 4,
    borderRadius: 12,
    marginBottom: 12,
    padding: 16,
    ...cardShadow,
  },
  cardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  cardHeaderPressed: {
    opacity: 0.7,
  },
  cardHeaderLeft: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 10,
  },
  metaText: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  urgentText: {
    color: theme.warning,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 10,
  },
  chartBox: {
    borderTopColor: theme.border,
    borderTopWidth: 1,
    marginBottom: 14,
    marginTop: 12,
    paddingTop: 12,
  },
  dot: {
    borderRadius: 6,
    height: 12,
    marginRight: 8,
    width: 12,
  },
  habitName: {
    color: theme.text,
    fontSize: 17,
    fontWeight: "700",
  },
  momentum: {
    color: "#4CAF50",
    fontSize: 16,
    fontWeight: "700",
    marginLeft: 6,
  },
  target: {
    color: theme.text,
    fontSize: 15,
    marginBottom: 12,
  },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  muted: {
    color: theme.textMuted,
    fontSize: 15,
  },
  success: {
    color: "#4CAF50",
    fontSize: 15,
    fontWeight: "600",
  },
  logAgainButton: {
    alignSelf: "flex-start",
    marginTop: 8,
  },
  logAgainPressed: {
    opacity: 0.6,
  },
  logAgainText: {
    color: theme.primary,
    fontSize: 13,
    fontWeight: "700",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  pressedButton: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  logButton: {
    backgroundColor: theme.primary,
    borderRadius: 8,
    flex: 1,
    paddingVertical: 10,
  },
  yesButton: {
    alignItems: "center",
    backgroundColor: theme.primary,
    borderRadius: 8,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    paddingVertical: 10,
  },
  logButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  skipButton: {
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  skipButtonText: {
    color: theme.textMuted,
    fontSize: 15,
    fontWeight: "600",
  },
  skipButtonDisabled: {
    opacity: 0.4,
  },
  skipExhausted: {
    color: theme.textMuted,
    fontSize: 12,
    marginTop: 8,
  },
  skipInfoButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  empty: {
    color: theme.textMuted,
    fontSize: 15,
    marginTop: 24,
    textAlign: "center",
  },
  completedSection: {
    marginTop: 8,
  },
  completedHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  completedHeaderText: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  completedRow: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    padding: 14,
    ...cardShadow,
  },
  completedRowText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "600",
  },
  completedRowDate: {
    color: theme.textMuted,
    fontSize: 12,
  },
});
