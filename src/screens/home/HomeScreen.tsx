import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { Animated, AppState, Easing, FlatList, LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AchievementToast } from "../../components/celebration/AchievementToast";
import { CelebrationOverlay } from "../../components/celebration/CelebrationOverlay";
import { EncouragementToast } from "../../components/celebration/EncouragementToast";
import { HabitLogCalendar } from "../../components/charts/HabitLogCalendar";
import { HabitProgressChart } from "../../components/charts/HabitProgressChart";
import { ActionSheet, ActionSheetOption } from "../../components/ui/ActionSheet";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { PageTitle, Screen } from "../../components/ui/Screen";
import {
  deleteEntry,
  getHabit,
  listAchievedGoals,
  listEntriesByGoal,
  listGoalSchedules,
  listSkipsByGoal,
  restartGoalWeek,
  setGoalActive,
  setGoalOnIce,
  updateGoal,
} from "../../db/repositories";
import { projectFutureTargets } from "../../engine/progression";
import { useCategories } from "../../hooks/useCategories";
import { useDailyGoals } from "../../hooks/useDailyGoals";
import { recordRestartedStreak } from "../../services/achievements";
import { pickPrimaryCelebration } from "../../services/celebrations";
import { autoApplyCrisisSkipsIfNeeded, DailyGoalView } from "../../services/dailyGoals";
import { takePendingCelebration, takePendingEncouragement } from "../../services/pendingCelebration";
import { logGoalEntry, skipGoalToday } from "../../services/dailyStatus";
import { getFreezesEnabled, getSkipsEnabled, getUserName } from "../../services/settings";
import { forfeitCurrentStreak, recomputeStreak } from "../../services/streaks";
import { loadWeeklySummary, WeeklySummary } from "../../services/weeklySummary";
import { addDays, daysBetween, localDateOf, today } from "../../engine/dateUtils";
import { cardShadow, theme, UNCATEGORIZED_COLOR } from "../../theme";
import { Celebration, Goal, Habit, HabitType, LoggedEntry, SkipLog } from "../../types";
import { formatNumber, unitSuffix } from "../../utils/format";
import { mediumTap } from "../../utils/haptics";
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

function tierOf(item: DailyGoalView): number {
  // On ice — the user already dismissed this one, sort below every other active habit.
  if (item.isOnIce) return 5;
  if (item.isCrisis || item.isUrgentToday || item.isOverdue || item.isQuotaGone) return 0;
  if (item.daysUntilTarget !== null && item.daysUntilTarget <= 7) return 1;
  if (daysBetween(localDateOf(item.goal.createdAt), today()) <= 7) return 2;
  if (item.streak.current > 0) return 3;
  return 4;
}

function FilterPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.pill, active && styles.pillActive]} onPress={onPress}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </Pressable>
  );
}

function emptyMessage(totalHabits: number, activeFilter: string): string {
  if (totalHabits === 0) {
    return "Nothing to track yet. Tap + to create your first habit — log it daily and watch your progress build in Calendar and Trophy Case.";
  }
  if (activeFilter === "urgent") {
    return "Nothing urgent right now. Habits land here when they're overdue, at risk of losing a streak, or behind on their weekly quota.";
  }
  if (activeFilter === "new") {
    return "No new habits. Habits show up here for their first week, then move back in with the rest.";
  }
  return "No habits in this category yet. Open a habit's details to assign it a category.";
}

function formatNextDue(nextDue: string | null): string | null {
  if (!nextDue) return null;
  const todayStr = today();
  if (nextDue === todayStr) return "Today";
  if (nextDue === addDays(todayStr, 1)) return "Tomorrow";
  return new Date(nextDue).toLocaleDateString(undefined, { weekday: "short" });
}

export function HomeScreen({ navigation }: Props) {
  const { items, refetch, newlyEarnedAchievements, clearNewlyEarnedAchievements } = useDailyGoals();
  const { categories, refetch: refetchCategories } = useCategories();
  const [name, setName] = useState<string | null>(null);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [actionSheetView, setActionSheetView] = useState<DailyGoalView | null>(null);
  const [achievedItems, setAchievedItems] = useState<AchievedItem[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [celebrationState, setCelebrationState] = useState<{
    celebration: Celebration;
    habitName: string;
    habitType: HabitType;
    goalId: string;
    targetDate?: string;
  } | null>(null);
  const [achievedGoal, setAchievedGoal] = useState<{ habitName: string; goalId: string; daysEarly: number | null } | null>(null);
  const [skipsEnabled, setSkipsEnabled] = useState(true);
  const [freezesEnabled, setFreezesEnabled] = useState(true);
  const [lossPrompt, setLossPrompt] = useState<{ view: DailyGoalView; hadStreak: boolean } | null>(null);
  const [autoSkipNotice, setAutoSkipNotice] = useState<{ habitName: string; skipsUsed: number } | null>(null);
  const autoSkipHandled = useRef<string | null>(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [showEncouragement, setShowEncouragement] = useState(false);

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
      refetchCategories();
      getUserName().then(setName);
      loadWeeklySummary().then(setWeeklySummary);
      loadAchieved();
      getSkipsEnabled().then(setSkipsEnabled);
      getFreezesEnabled().then(setFreezesEnabled);
      if (takePendingEncouragement()) setShowEncouragement(true);
      const pending = takePendingCelebration();
      if (pending) {
        setCelebrationState({
          celebration: pending.celebration,
          habitName: pending.habitName,
          habitType: pending.habitType,
          goalId: pending.goalId,
          targetDate: pending.targetDate,
        });
      }
    }, [refetch, refetchCategories, loadAchieved])
  );

  const filteredItems = useMemo(() => {
    if (activeFilter === "all") return items;
    if (activeFilter === "urgent") return items.filter((i) => i.isCrisis || i.isUrgentToday || i.isOverdue || i.isQuotaGone);
    if (activeFilter === "new") {
      return items.filter((i) => daysBetween(localDateOf(i.goal.createdAt), today()) <= 7);
    }
    return items.filter((i) => i.category?.id === activeFilter);
  }, [items, activeFilter]);

  const behindCount = items.filter((i) => i.isCrisis || i.isUrgentToday || i.isOverdue || i.isQuotaGone).length;

  const missedDeadlineView = useMemo(
    () => items.find((item) => item.daysUntilTarget !== null && item.daysUntilTarget < 0) ?? null,
    [items]
  );

  const crisisView = useMemo(() => items.find((item) => item.isCrisis) ?? null, [items]);
  const canSpendSkips = !!crisisView && crisisView.skipsRemaining >= crisisView.skipsNeededToSave;

  // No streak at stake, but the week's quota is already gone and not yet dismissed. Only the
  // first such goal is surfaced at a time (same pattern as missedDeadlineView below) — once it's
  // resolved and refetch() runs, this naturally picks up the next one on the following render,
  // so multiple simultaneous crisis/quota-gone goals queue through one at a time rather than
  // getting stuck.
  const quotaGoneView = useMemo(() => items.find((item) => item.isQuotaGone) ?? null, [items]);

  // The moment a crisis can no longer be saved with skips, the streak is already gone —
  // forfeit it immediately rather than waiting for the week to close out naturally. The
  // snapshot in lossPrompt keeps the prompt showing even once the forfeit flips isCrisis
  // back to false on refetch (0 streak means no streak is "at stake" anymore).
  //
  // If it CAN be saved with skips, there's no real choice to offer — letting it go anyway
  // would just be throwing away a fully-recoverable streak for no reason — so the skips are
  // applied automatically and SaveStreakPrompt just informs rather than asks.
  useEffect(() => {
    if (!crisisView) {
      autoSkipHandled.current = null;
      if (quotaGoneView && lossPrompt?.view.goal.id !== quotaGoneView.goal.id) {
        setLossPrompt({ view: quotaGoneView, hadStreak: false });
      }
      return;
    }
    if (!canSpendSkips) {
      if (lossPrompt?.view.goal.id !== crisisView.goal.id) {
        setLossPrompt({ view: crisisView, hadStreak: true });
        forfeitCurrentStreak(crisisView.goal.id).then(refetch);
      }
      return;
    }
    if (autoSkipHandled.current !== crisisView.goal.id) {
      autoSkipHandled.current = crisisView.goal.id;
      autoApplyCrisisSkipsIfNeeded(crisisView).then((saved) => {
        if (saved) setAutoSkipNotice(saved);
        refetch();
      });
    }
  }, [crisisView, canSpendSkips, quotaGoneView, lossPrompt, refetch]);

  // Backgrounding/closing the app while the prompt is up counts as a dismissal — same as
  // tapping the ✕, it puts the goal on ice rather than leaving it in limbo. Only "background"
  // qualifies — "inactive" also fires for transient interruptions (Control Center, the app
  // switcher preview, a phone call) that aren't the user actually leaving the app.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "background" && lossPrompt) {
        const goalId = lossPrompt.view.goal.id;
        setLossPrompt(null);
        setGoalOnIce(goalId, true);
      }
    });
    return () => subscription.remove();
  }, [lossPrompt]);

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
      setCelebrationState({
        celebration: primary,
        habitName: view.habit.name,
        habitType: view.habit.type,
        goalId: view.goal.id,
        targetDate: view.goal.targetDate,
      });
    }
  }

  /** Deletes today's entry and recomputes the streak as if it were never logged. */
  async function handleRemoveLog(view: DailyGoalView) {
    if (view.status.kind !== "logged") return;
    await deleteEntry(view.status.entry.id);
    await recomputeStreak(view.goal);
    refetch();
  }

  function handleEditAndContinue() {
    if (!achievedGoal) return;
    const goalId = achievedGoal.goalId;
    setAchievedGoal(null);
    navigation.navigate("HabitGoalForm", { editGoalId: goalId });
  }

  function handleMarkComplete() {
    setAchievedGoal(null);
    refetch();
  }

  function handleLongPress(view: DailyGoalView) {
    mediumTap();
    setActionSheetView(view);
  }

  async function handleExtendDeadline(newDate: string) {
    if (!missedDeadlineView) return;
    await updateGoal(missedDeadlineView.goal.id, { targetDate: newDate });
    refetch();
  }


  // Clearing lossPrompt before the restart's refetch lands would re-render with a still-stale
  // items list — the reopening effect below sees the same still-quota-gone view and pops the
  // prompt right back up, so it looks like the button needs a second press to "take". Awaiting
  // refetch() before clearing means items are already fresh by the time lossPrompt goes null.
  async function handleStartAgainAfterLoss() {
    if (!lossPrompt) return;
    const goalId = lossPrompt.view.goal.id;
    const hadStreak = lossPrompt.hadStreak;
    await restartGoalWeek(goalId, today());
    if (hadStreak) await recordRestartedStreak();
    await refetch();
    setLossPrompt(null);
  }

  async function handleAdjustHabitAfterLoss(view: DailyGoalView) {
    const hadStreak = lossPrompt?.hadStreak ?? false;
    await restartGoalWeek(view.goal.id, today());
    if (hadStreak) await recordRestartedStreak();
    setLossPrompt(null);
    navigation.navigate("HabitGoalForm", { editGoalId: view.goal.id });
  }

  async function handleDismissLossPrompt(view: DailyGoalView) {
    await setGoalOnIce(view.goal.id, true);
    await refetch();
    setLossPrompt(null);
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
        data={[...filteredItems].sort((a, b) => tierOf(a) - tierOf(b))}
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
                {behindCount > 0 && (
                  <Text style={styles.weeklyAlert}>{behindCount} habit{behindCount === 1 ? "" : "s"} behind this week</Text>
                )}
                {weeklySummary.bestDay && (
                  <Text style={styles.weeklySubtext}>
                    Best day: {weeklySummary.bestDay.date} ({weeklySummary.bestDay.hits} hit
                    {weeklySummary.bestDay.hits === 1 ? "" : "s"})
                  </Text>
                )}
              </View>
            )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow} contentContainerStyle={styles.pillRowContent}>
            <FilterPill label="All" active={activeFilter === "all"} onPress={() => setActiveFilter("all")} />
            <FilterPill label="Urgent" active={activeFilter === "urgent"} onPress={() => setActiveFilter("urgent")} />
            <FilterPill label="New" active={activeFilter === "new"} onPress={() => setActiveFilter("new")} />
            {categories.map((cat) => (
              <FilterPill key={cat.id} label={cat.name} active={activeFilter === cat.id} onPress={() => setActiveFilter(cat.id)} />
            ))}
          </ScrollView>
          </View>
        }
        renderItem={({ item }) => (
          <GoalCard
            view={item}
            skipsEnabled={skipsEnabled}
            onLog={() => navigation.navigate("LogEntry", { goalId: item.goal.id })}
            onYes={() => handleYes(item)}
            onRemoveLog={() => handleRemoveLog(item)}
            onSkip={() => setDialog({ kind: "skipConfirm", view: item })}
            onSkipInfo={() => setDialog({ kind: "skipInfo", view: item })}
            onMenu={() => handleLongPress(item)}
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
        ListEmptyComponent={<Text style={styles.empty}>{emptyMessage(items.length, activeFilter)}</Text>}
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

      {autoSkipNotice && dialog === null && (
        <SaveStreakPrompt
          habitName={autoSkipNotice.habitName}
          skipsUsed={autoSkipNotice.skipsUsed}
          onDismiss={() => setAutoSkipNotice(null)}
        />
      )}

      {lossPrompt && dialog === null && !missedDeadlineView && (
        <StreakLostPrompt
          habitName={lossPrompt.view.habit.name}
          hadStreak={lossPrompt.hadStreak}
          onAdjustHabit={() => handleAdjustHabitAfterLoss(lossPrompt.view)}
          onStartAgain={handleStartAgainAfterLoss}
          onDismiss={() => handleDismissLossPrompt(lossPrompt.view)}
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
          habitName={celebrationState.habitName}
          habitType={celebrationState.habitType}
          onDismiss={() => {
            const { celebration, habitName, goalId, targetDate } = celebrationState;
            setCelebrationState(null);
            if (celebration.type === "goal_achieved") {
              setAchievedGoal({ habitName, goalId, daysEarly: targetDate ? daysBetween(today(), targetDate) : null });
            } else {
              refetch();
            }
          }}
        />
      )}

      {showEncouragement && (
        <EncouragementToast onDismiss={() => { setShowEncouragement(false); refetch(); }} />
      )}

      {newlyEarnedAchievements.length > 0 && (
        <AchievementToast defs={newlyEarnedAchievements} onDismiss={clearNewlyEarnedAchievements} />
      )}

      {achievedGoal && (
        <HabitAchievedPrompt
          habitName={achievedGoal.habitName}
          daysEarly={achievedGoal.daysEarly}
          onEditAndContinue={handleEditAndContinue}
          onMarkComplete={handleMarkComplete}
        />
      )}
    </Screen>
  );
}

// isUrgentToday can be true from the moment the day rolls over — pulsing an urgency animation
// at 12:01am, before the user's even had a normal chance at the day, reads as premature nagging.
// Giving it until midday means it only starts drawing the eye once "today" has actually had a
// chance to happen.
function isPastMidday(): boolean {
  return new Date().getHours() >= 12;
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
  onRemoveLog,
  onSkip,
  onSkipInfo,
  onMenu,
}: {
  view: DailyGoalView;
  skipsEnabled: boolean;
  onLog: () => void;
  onYes: () => void;
  onRemoveLog: () => void;
  onSkip: () => void;
  onSkipInfo: () => void;
  onMenu: () => void;
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
    isOverdue,
    isCrisis,
    isQuotaGone,
    isOnIce,
    dueToday,
    nextTarget,
  } = view;
  const unit = unitSuffix(habit.unitLabel);
  const color = category?.color ?? UNCATEGORIZED_COLOR;
  const statusColor =
    status.kind === "logged"
      ? "#4CAF50"
      : isOnIce
        ? theme.frozen
        : isCrisis || isUrgentToday || isOverdue || isQuotaGone
          ? theme.danger
          : dueToday
            ? theme.warning
            : theme.textMuted;

  const [expanded, setExpanded] = useState(false);
  const [entries, setEntries] = useState<LoggedEntry[] | null>(null);
  const [skips, setSkips] = useState<SkipLog[]>([]);
  const [projectedTargets, setProjectedTargets] = useState<number[]>([]);
  const [confirmRemoveLog, setConfirmRemoveLog] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    Promise.all([
      listEntriesByGoal(goal.id),
      listSkipsByGoal(goal.id),
      listGoalSchedules(goal.id),
    ]).then(([loadedEntries, loadedSkips, loadedSchedules]) => {
      if (cancelled) return;
      setEntries(loadedEntries);
      setSkips(loadedSkips);
      if (habit.type !== "boolean") {
        setProjectedTargets(projectFutureTargets(goal, habit, loadedSchedules, loadedEntries));
      }
    });
    return () => { cancelled = true; };
  // goal.id and habit.type are stable primitives — avoids re-firing on every object reference change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, goal.id, habit.type, status.kind, status.kind === "logged" ? status.entry.actualValue : null]);

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
        onLongPress={onMenu}
      >
        <View style={styles.cardHeaderLeft}>
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
          <Text style={styles.habitName}>{habit.name}</Text>
          {streak.current > 0 &&
            ((isUrgentToday || isCrisis) && isPastMidday() ? (
              <PulsingStreak value={streak.current} />
            ) : (
              <Text style={styles.streak}>🔥 {streak.current}</Text>
            ))}
          {shouldShowMomentum(momentum) && (
            <Text style={styles.momentum}>{momentum === "up" ? "↗" : "→"}</Text>
          )}
        </View>
        <View style={styles.cardHeaderRight}>
          <Pressable
            hitSlop={8}
            onPress={onMenu}
            style={({ pressed }) => [styles.menuButton, pressed && styles.menuButtonPressed]}
          >
            <Ionicons name="ellipsis-horizontal" size={18} color={theme.textMuted} />
          </Pressable>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={theme.textMuted} />
        </View>
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
        {nextDueLabel && !isOverdue && !isOnIce && <Text style={styles.metaText}>Next due: {nextDueLabel}</Text>}
      </View>
      {isUrgentToday && streak.current > 0 && (
        <Text style={styles.urgentText}>⚠️ Check in today to keep your streak alive!</Text>
      )}
      {isOverdue && !isUrgentToday && (
        <Text style={styles.overdueText}>⚠️ Overdue — you're behind this week. Check in today to catch up.</Text>
      )}

      {expanded && (
        <View style={styles.chartBox}>
          {entries === null ? (
            <Text style={styles.muted}>Loading…</Text>
          ) : habit.type === "boolean" ? (
            <HabitLogCalendar entries={entries} skips={skips} />
          ) : (
            <HabitProgressChart
              entries={entries}
              targetValue={goal.targetValue}
              color={color}
              unit={unit}
              projectedTargets={projectedTargets}
              todayTarget={status.kind === "pending" ? status.target : undefined}
            />
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
            {nextTarget !== null && (
              <Text style={styles.nextTarget}>
                · Tomorrow's target: {formatNumber(nextTarget)}{unit}
              </Text>
            )}
          </View>
          {habit.type === "boolean" ? (
            <Pressable
              style={({ pressed }) => [styles.logAgainButton, pressed && styles.logAgainPressed]}
              onPress={() => setConfirmRemoveLog(true)}
            >
              <Text style={styles.logAgainText}>Remove Log</Text>
            </Pressable>
          ) : (
            <View style={styles.logAgainRow}>
              <Pressable
                style={({ pressed }) => [styles.logAgainButton, pressed && styles.logAgainPressed]}
                onPress={onLog}
              >
                <Text style={styles.logAgainText}>Edit Log</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.logAgainButton, pressed && styles.logAgainPressed]}
                onPress={onRemoveLog}
              >
                <Text style={styles.removeLogText}>Remove Log</Text>
              </Pressable>
            </View>
          )}
        </>
      )}

      {status.kind === "pending" && (
        <>
          {habit.type !== "boolean" && (
            <Text style={styles.target}>
              Today's target: {formatNumber(status.target)}
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
      <ConfirmDialog
        visible={confirmRemoveLog}
        title="Remove log?"
        message={`This clears today's check-in for "${habit.name}" and recomputes your streak as if it were never logged.`}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          setConfirmRemoveLog(false);
          onRemoveLog();
        }}
        onCancel={() => setConfirmRemoveLog(false)}
      />
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
  overdueText: {
    color: theme.warning,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 10,
  },
  weeklyAlert: {
    color: theme.warning,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
  },
  pillRow: {
    marginTop: 12,
  },
  pillRowContent: {
    gap: 8,
    paddingBottom: 4,
  },
  pill: {
    borderColor: theme.border,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  pillActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  pillText: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  pillTextActive: {
    color: "#FFFFFF",
  },
  chartBox: {
    marginBottom: 14,
    marginTop: 12,
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
  logAgainRow: {
    flexDirection: "row",
    gap: 16,
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
  removeLogText: {
    color: theme.danger,
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
  cardHeaderRight: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  menuButton: {
    padding: 2,
  },
  menuButtonPressed: {
    opacity: 0.5,
  },
  nextTarget: {
    color: theme.textMuted,
    fontSize: 13,
    marginLeft: 4,
  },
});
