import { useCallback, useEffect, useMemo, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { FlatList, Modal, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Button } from "../../components/ui/Button";
import { HabitLogCalendar } from "../../components/charts/HabitLogCalendar";
import { HabitProgressChart } from "../../components/charts/HabitProgressChart";
import { CategoryPicker } from "../../components/ui/CategoryPicker";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { DayTime, notificationTimesFromMap, notificationTimesToMap } from "../../components/ui/DayNotificationTimes";
import { FieldGroup, FieldLabel, HintText, TextField } from "../../components/ui/FormField";
import { PageTitle, Screen } from "../../components/ui/Screen";
import { ScheduleDayPicker } from "../../components/ui/ScheduleDayPicker";
import {
  createGoalSchedule,
  deleteFreezeWindow,
  deleteHabit,
  getCurrentGoalForHabit,
  getHabit,
  getStreak,
  listEntriesByGoal,
  listFreezeWindowsByGoal,
  listGoalAchievementsByHabit,
  listGoalNotificationTimes,
  listGoalSchedules,
  listSkipsByGoal,
  setGoalActive,
  setGoalAdaptive,
  setGoalNotificationTimes,
  setGoalNotifyOffSchedule,
  setHabitCategory,
  setHabitDescription,
} from "../../db/repositories";
import { cancelGoalNotifications } from "../../services/notifications";
import { today } from "../../engine/dateUtils";
import { adaptiveMultiplier } from "../../engine/curves";
import { projectFutureTargets } from "../../engine/progression";
import { scheduledDaysAsOf, weeklySkipLimitFor } from "../../engine/schedule";
import { useCategories } from "../../hooks/useCategories";
import { getFreezesEnabled } from "../../services/settings";
import { forfeitCurrentStreak } from "../../services/streaks";
import { cardShadow, theme, UNCATEGORIZED_COLOR } from "../../theme";
import { Category, Celebration, FreezeWindow, Goal, GoalSchedule, Habit, LoggedEntry, SkipLog, Streak } from "../../types";
import { formatNumber, unitSuffix } from "../../utils/format";
import { ManageStackParamList, HomeStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<ManageStackParamList & HomeStackParamList, "HabitDetail">;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type DialogState = { kind: "removeFreeze"; id: string } | { kind: "deleteHabit" } | { kind: "deactivateConfirm" } | null;

export function HabitDetailScreen({ route, navigation }: Props) {
  const { habitId } = route.params;
  const [habit, setHabit] = useState<Habit | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [freezeWindows, setFreezeWindows] = useState<FreezeWindow[]>([]);
  const [entries, setEntries] = useState<LoggedEntry[]>([]);
  const [skips, setSkips] = useState<SkipLog[]>([]);
  const [schedules, setSchedules] = useState<GoalSchedule[]>([]);
  const [achievements, setAchievements] = useState<Celebration[]>([]);
  const [description, setDescription] = useState("");
  const { categories, refetch: refetchCategories } = useCategories();

  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [editedDays, setEditedDays] = useState<number[]>([]);
  const [editedTimes, setEditedTimes] = useState<Record<number, DayTime>>({});
  const [editedNotifyOffSchedule, setEditedNotifyOffSchedule] = useState(true);
  // Set only when the goal has a target — the day *count* is that goal's weekly quota (see
  // tallyWeek), so it's locked until achieved, even though which days/times remain editable.
  const [lockedDayCount, setLockedDayCount] = useState<number | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [freezesEnabled, setFreezesEnabled] = useState(true);

  const refetch = useCallback(async () => {
    const loadedHabit = await getHabit(habitId);
    if (!loadedHabit) return;
    setHabit(loadedHabit);
    setDescription(loadedHabit.description ?? "");

    const loadedGoal = await getCurrentGoalForHabit(habitId);
    setGoal(loadedGoal);
    if (!loadedGoal) {
      setStreak(null);
      setFreezeWindows([]);
      setEntries([]);
      setSkips([]);
      setSchedules([]);
      return;
    }

    const [loadedStreak, loadedFreezes, loadedEntries, loadedSkips, loadedSchedules, loadedAchievements] = await Promise.all([
      getStreak(loadedGoal.id),
      listFreezeWindowsByGoal(loadedGoal.id),
      listEntriesByGoal(loadedGoal.id),
      listSkipsByGoal(loadedGoal.id),
      listGoalSchedules(loadedGoal.id),
      listGoalAchievementsByHabit(habitId),
    ]);
    setStreak(loadedStreak);
    setFreezeWindows(loadedFreezes);
    setEntries(loadedEntries);
    setSkips(loadedSkips);
    setSchedules(loadedSchedules);
    setAchievements(loadedAchievements);
  }, [habitId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useFocusEffect(
    useCallback(() => {
      refetch();
      refetchCategories();
      getFreezesEnabled().then(setFreezesEnabled);
    }, [refetch, refetchCategories])
  );

  const currentDays = useMemo(() => scheduledDaysAsOf(schedules, today()), [schedules]);
  // No "next" target once a goal is achieved — projecting forward from an already-hit
  // target just extrapolates the old curve into nonsense (e.g. sliding back toward
  // startValue), not a real forecast.
  const projectedTargets = useMemo(
    () => (goal && habit && !goal.achievedAt ? projectFutureTargets(goal, habit, schedules, entries) : []),
    [goal, habit, schedules, entries]
  );

  // Step only drives progression for step-paced goals (no targetDate — see computeBaseTarget
  // in progression.ts, which only reaches for goal.step on that branch). The only thing that
  // can move this off the base value the user typed in is the adaptive plateau nudge
  // (recomputed from recent hit history) — nothing else should touch it.
  const stepInfo = useMemo(() => {
    if (!goal || !habit || habit.type === "boolean" || goal.targetDate !== undefined) return null;
    const multiplier = goal.adaptive ? adaptiveMultiplier(entries.map((e) => e.hit)) : 1;
    const isRelative = goal.progressionMode === "relative";
    const effective = goal.step * multiplier;
    const format = (v: number) => (isRelative ? `${formatNumber(v * 100)}%` : `${formatNumber(v)}${unitSuffix(habit.unitLabel)}`);
    return { base: format(goal.step), effective: format(effective), changed: format(effective) !== format(goal.step) };
  }, [goal, habit, entries]);

  async function handleCategoryChange(categoryId: string | undefined) {
    await setHabitCategory(habitId, categoryId);
    refetch();
  }

  function handleCategoryCreated(category: Category) {
    refetchCategories();
    handleCategoryChange(category.id);
  }

  async function handleDescriptionBlur() {
    await setHabitDescription(habitId, description.trim() || undefined);
  }

  async function handleAdaptiveChange(value: boolean) {
    if (!goal) return;
    await setGoalAdaptive(goal.id, value);
    refetch();
  }

  async function openScheduleEditor() {
    if (!goal || !habit) return;
    setEditedDays(currentDays);
    // Boolean goals always carry targetValue=1 as an implementation detail — no real goal
    // to protect, so they never lock, same as a goalless numeric habit.
    setLockedDayCount(habit.type !== "boolean" && goal.targetValue !== undefined ? currentDays.length : null);
    const savedTimes = await listGoalNotificationTimes(goal.id);
    setEditedTimes(notificationTimesToMap(savedTimes));
    setEditedNotifyOffSchedule(goal.notifyOffSchedule);
    setScheduleModalVisible(true);
  }

  function handleChangeNotificationTime(day: number, time: DayTime) {
    setEditedTimes((prev) => ({ ...prev, [day]: time }));
  }

  async function handleSaveSchedule() {
    if (!goal || editedDays.length === 0) return;
    if (lockedDayCount !== null && editedDays.length !== lockedDayCount) return;
    await Promise.all([
      createGoalSchedule(goal.id, today(), editedDays),
      setGoalNotificationTimes(goal.id, notificationTimesFromMap(goal.id, editedDays, editedTimes)),
      setGoalNotifyOffSchedule(goal.id, editedNotifyOffSchedule),
    ]);
    setScheduleModalVisible(false);
    refetch();
  }

  async function performRemoveFreeze(id: string) {
    await deleteFreezeWindow(id);
    refetch();
  }

  async function handleToggleActive() {
    if (!goal) return;
    if (goal.active) {
      setDialog({ kind: "deactivateConfirm" });
      return;
    }
    await setGoalActive(goal.id, true);
    refetch();
  }

  async function performDeactivate() {
    if (!goal) return;
    await cancelGoalNotifications(goal.id);
    await forfeitCurrentStreak(goal.id);
    await setGoalActive(goal.id, false);
    refetch();
  }

  async function performDeleteHabit() {
    if (goal) await cancelGoalNotifications(goal.id);
    await deleteHabit(habitId);
    navigation.goBack();
  }

  if (!habit) {
    return <Screen />;
  }

  const unit = unitSuffix(habit.unitLabel);
  const scheduleSummary =
    currentDays.length === 7 ? "Every day" : currentDays.map((d) => DAY_NAMES[d]).join(", ");
  const summary = goal
    ? habit.type === "boolean"
      ? scheduleSummary
      : `${goal.startValue}${goal.targetValue !== undefined ? ` → ${goal.targetValue}` : ""}${unit} · ${
          goal.targetValue !== undefined ? goal.curveType : "open-ended"
        }${goal.adaptive ? " · adaptive" : ""} · ${scheduleSummary}`
    : undefined;

  return (
    <Screen scroll={false}>
      <FlatList
        overScrollMode="never"
        data={goal ? freezeWindows : []}
        keyExtractor={(f) => f.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <PageTitle subtitle={summary}>{habit.name}</PageTitle>

            <FieldGroup>
              <FieldLabel>Category</FieldLabel>
              <CategoryPicker
                categories={categories}
                selectedId={habit.categoryId}
                onChange={handleCategoryChange}
                onCategoryCreated={handleCategoryCreated}
              />
            </FieldGroup>

            {/* Once achieved, the description is frozen like the rest of the goal's settled
                state — and if there was never one, there's nothing worth inviting an edit to
                an already-closed-out habit for. */}
            {goal?.achievedAt ? (
              description.length > 0 && (
                <FieldGroup>
                  <FieldLabel>Description</FieldLabel>
                  <Text style={styles.descriptionLocked}>{description}</Text>
                </FieldGroup>
              )
            ) : (
              <FieldGroup>
                <FieldLabel>Description</FieldLabel>
                <TextField
                  placeholder="Notes about this habit — why it matters, technique cues, anything you want to remember."
                  value={description}
                  onChangeText={setDescription}
                  onBlur={handleDescriptionBlur}
                  multiline
                  numberOfLines={4}
                  style={styles.description}
                />
              </FieldGroup>
            )}

            {stepInfo && (
              <FieldGroup>
                <FieldLabel>Step</FieldLabel>
                <Text style={styles.stepValue}>
                  {stepInfo.changed ? `${stepInfo.effective} (base ${stepInfo.base})` : stepInfo.base}
                </Text>
                {stepInfo.changed && <HintText>Adjusted from the base step by adaptive pacing.</HintText>}
              </FieldGroup>
            )}

            {stepInfo && goal && (
              <FieldGroup>
                <View style={styles.switchRow}>
                  <FieldLabel>Adaptive (plateau-aware pacing)</FieldLabel>
                  <Switch value={goal.adaptive} onValueChange={handleAdaptiveChange} />
                </View>
                <HintText>
                  Watches your last 5 entries. Hitting ≥80% of them pushes the pace up; ≤40% eases it back.
                </HintText>
              </FieldGroup>
            )}

            {achievements.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Achievements</Text>
                {achievements.map((a) => {
                  const targetVal = a.metadata?.targetValue;
                  const targetDate = a.metadata?.targetDate;
                  const goalPart = targetVal !== undefined ? ` ${targetVal}${unit}` : "";
                  const datePart = targetDate ? ` (target: ${targetDate})` : "";
                  return (
                    <Text key={a.id} style={styles.achieved}>
                      ✓ Reached{goalPart} on {a.date}{datePart}
                    </Text>
                  );
                })}
              </>
            )}
            {goal && streak && (
              <Text style={styles.streak}>
                Streak: {streak.current} (best {streak.longest}) · {weeklySkipLimitFor(currentDays)} skips/fortnight
              </Text>
            )}

            {goal && (
              <>
                <Text style={styles.sectionLabel}>Progress</Text>
                {habit.type === "boolean" ? (
                  <HabitLogCalendar entries={entries} skips={skips} />
                ) : (
                  <HabitProgressChart
                    entries={entries}
                    projectedTargets={projectedTargets}
                    targetValue={goal.targetValue}
                    color={categories.find((c) => c.id === habit.categoryId)?.color ?? UNCATEGORIZED_COLOR}
                    unit={unit}
                  />
                )}
              </>
            )}

            {goal && <Text style={styles.sectionLabel}>Freeze windows</Text>}
            {!goal && <Text style={styles.empty}>No goal yet. Set a target to start generating daily targets.</Text>}
          </>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.freezeRow} onPress={() => setDialog({ kind: "removeFreeze", id: item.id })}>
            <Text style={styles.freezeText}>
              {item.startDate} → {item.endDate}
            </Text>
            <Text style={styles.freezeRemove}>Remove</Text>
          </Pressable>
        )}
        ListEmptyComponent={goal ? <Text style={styles.empty}>No freeze windows declared.</Text> : null}
      />
      <View style={styles.footer}>
        {goal && !goal.achievedAt && (
          <>
            {goal.targetValue === undefined && (
              <>
                <Button
                  title="Edit Habit"
                  variant="secondary"
                  onPress={() => navigation.navigate("HabitGoalForm", { editGoalId: goal.id })}
                />
                <View style={styles.spacer} />
              </>
            )}
            {/* The day count doubles as the weekly quota (see tallyWeek) — once a goal has a
                target, that count locks until achieved, but which days/times remain editable. */}
            <Button title="Edit Schedule" variant="secondary" onPress={openScheduleEditor} />
            <View style={styles.spacer} />
            {freezesEnabled && (
              <>
                <Button
                  title="+ Freeze Window"
                  variant="secondary"
                  onPress={() => navigation.navigate("FreezeWindowForm", { goalId: goal.id })}
                />
                <View style={styles.spacer} />
              </>
            )}
            <Button
              title={goal.active ? "Deactivate Habit" : "Activate Habit"}
              variant="secondary"
              onPress={handleToggleActive}
            />
          </>
        )}
        {(!goal || goal.achievedAt) && (
          <Button title="+ New Goal" onPress={() => navigation.navigate("GoalForm", { habitId })} />
        )}
        <View style={styles.spacer} />
        <Button title="Delete Habit" variant="danger" onPress={() => setDialog({ kind: "deleteHabit" })} />
      </View>

      {goal && (
        <Modal
          transparent
          animationType="fade"
          visible={scheduleModalVisible}
          onRequestClose={() => setScheduleModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Edit Schedule</Text>
              <HintText>
                {lockedDayCount !== null
                  ? `Which days you pick and their reminder times are yours to change — it's only the number of days (${lockedDayCount} this week) that's locked in, since that sets your weekly quota.`
                  : "These are your check-in days — when you'll be reminded. You can log on any day and it still counts toward your weekly quota. To stop you dodging a quota you're already behind on, day changes only take effect from next week onward — reminders update right away, though."}
              </HintText>
              <View style={styles.modalPickerSpacer}>
                <ScheduleDayPicker
                  days={editedDays}
                  onChangeDays={setEditedDays}
                  times={editedTimes}
                  onChangeTime={handleChangeNotificationTime}
                />
              </View>
              {lockedDayCount !== null && editedDays.length !== lockedDayCount && (
                <HintText danger>
                  Pick exactly {lockedDayCount} day{lockedDayCount === 1 ? "" : "s"} to save.
                </HintText>
              )}
              <HintText>Reminder times apply right away. Tap a time above to change it.</HintText>
              <View style={styles.offScheduleRow}>
                <View style={styles.offScheduleText}>
                  <Text style={styles.offScheduleLabel}>Notify on non-scheduled days</Text>
                  <Text style={styles.offScheduleHint}>Send overdue reminders even on days not in your schedule</Text>
                </View>
                <Switch
                  value={editedNotifyOffSchedule}
                  onValueChange={setEditedNotifyOffSchedule}
                />
              </View>
              <View style={styles.modalButtonSpacer} />
              <Button
                title="Save"
                onPress={handleSaveSchedule}
                disabled={editedDays.length === 0 || (lockedDayCount !== null && editedDays.length !== lockedDayCount)}
              />
              <View style={styles.spacer} />
              <Button title="Cancel" variant="secondary" onPress={() => setScheduleModalVisible(false)} />
            </View>
          </View>
        </Modal>
      )}

      <ConfirmDialog
        visible={dialog?.kind === "removeFreeze"}
        title="Remove freeze window?"
        confirmLabel="Remove"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          if (dialog?.kind === "removeFreeze") performRemoveFreeze(dialog.id);
          setDialog(null);
        }}
        onCancel={() => setDialog(null)}
      />

      <ConfirmDialog
        visible={dialog?.kind === "deleteHabit"}
        title="Delete habit?"
        message="This deletes the habit and every goal, logged entry, freeze window, and celebration tied to it. This can't be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          setDialog(null);
          performDeleteHabit();
        }}
        onCancel={() => setDialog(null)}
      />

      <ConfirmDialog
        visible={dialog?.kind === "deactivateConfirm"}
        title="Deactivate this habit?"
        message="This isn't a freeze or a skip — your current streak will be lost for good. Use those instead if you want a break without losing it. Deactivating just removes the habit from today's list; nothing is deleted, and you can reactivate it later from here."
        confirmLabel="Deactivate"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          setDialog(null);
          performDeactivate();
        }}
        onCancel={() => setDialog(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: 16,
  },
  // A light underline instead of TextField's default boxed/bordered look — this field is
  // always sitting right there on the screen, editable anytime, so it should read more like
  // a tappable label than a form input demanding to be filled in.
  description: {
    backgroundColor: "transparent",
    borderBottomColor: theme.border,
    borderBottomWidth: 1,
    borderRadius: 0,
    borderWidth: 0,
    color: theme.text,
    fontSize: 15,
    height: 90,
    paddingHorizontal: 0,
    paddingVertical: 6,
    textAlignVertical: "top",
  },
  descriptionLocked: {
    color: theme.textMuted,
    fontSize: 15,
    lineHeight: 21,
    paddingVertical: 4,
  },
  switchRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  stepValue: {
    color: theme.text,
    fontSize: 15,
  },
  achieved: {
    color: "#4CAF50",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 8,
  },
  streak: {
    color: theme.text,
    fontSize: 14,
    marginTop: 8,
  },
  sectionLabel: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 24,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  freezeRow: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    padding: 14,
    ...cardShadow,
  },
  freezeText: {
    color: theme.text,
    fontSize: 14,
  },
  freezeRemove: {
    color: theme.danger,
    fontSize: 13,
    fontWeight: "600",
  },
  empty: {
    color: theme.textMuted,
    fontSize: 14,
  },
  footer: {
    borderTopColor: theme.border,
    borderTopWidth: 1,
    padding: 16,
  },
  spacer: {
    height: 10,
  },
  modalBackdrop: {
    backgroundColor: "rgba(0,0,0,0.5)",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 20,
    ...cardShadow,
  },
  modalTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
  },
  modalPickerSpacer: {
    marginVertical: 16,
  },
  modalButtonSpacer: {
    height: 16,
  },
  offScheduleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  offScheduleText: {
    flex: 1,
  },
  offScheduleLabel: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "600",
  },
  offScheduleHint: {
    color: theme.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
});
