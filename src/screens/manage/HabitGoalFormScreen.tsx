import { useCallback, useEffect, useMemo, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { StyleSheet, Switch, Text, View } from "react-native";
import { CurveShapePreview } from "../../components/charts/CurveShapePreview";
import { Button } from "../../components/ui/Button";
import { CategoryPicker } from "../../components/ui/CategoryPicker";
import { ChipSelector } from "../../components/ui/ChipSelector";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { DayTime, notificationTimesFromMap, notificationTimesToMap } from "../../components/ui/DayNotificationTimes";
import { DateField, FieldGroup, FieldLabel, HintText, TextField } from "../../components/ui/FormField";
import { PageTitle, Screen } from "../../components/ui/Screen";
import { ScheduleDayPicker } from "../../components/ui/ScheduleDayPicker";
import {
  clearGoalAchievement,
  clearGoalTarget,
  createGoal,
  createGoalSchedule,
  createHabit,
  getGoal,
  getHabit,
  listGoalNotificationTimes,
  listGoalSchedules,
  setGoalNotificationTimes,
  setHabitCategory,
  setHabitDescription,
  updateGoal,
  updateHabit,
} from "../../db/repositories";
import { directionFromValues } from "../../engine/curves";
import { formatDateLocal, localDateOf, today } from "../../engine/dateUtils";
import { generateNextTarget } from "../../engine/progression";
import { scheduledDaysAsOf } from "../../engine/schedule";
import { useCategories } from "../../hooks/useCategories";
import { theme } from "../../theme";
import { formatNumber, unitSuffix } from "../../utils/format";
import {
  Category,
  CurveType,
  Direction,
  Goal,
  GoalSchedule,
  Habit,
  HabitType,
  ProgressionMode,
} from "../../types";
import { HomeStackParamList, ManageStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<ManageStackParamList & HomeStackParamList, "HabitGoalForm">;
type PacingMode = "date" | "step";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const TYPE_OPTIONS: { value: HabitType; label: string }[] = [
  { value: "numeric", label: "Numeric" },
  { value: "boolean", label: "Yes / No" },
];

const DIRECTION_OPTIONS: { value: Direction; label: string }[] = [
  { value: "increasing", label: "Increasing" },
  { value: "decreasing", label: "Decreasing" },
];

const PACING_OPTIONS: { value: PacingMode; label: string }[] = [
  { value: "date", label: "By Date" },
  { value: "step", label: "By Step" },
];

/** Percentage is deliberately excluded — it's meaningless once a target date is set (see progression.ts). */
const DATE_CURVE_OPTIONS: { value: CurveType; label: string }[] = [
  { value: "linear", label: "Linear" },
  { value: "incremental", label: "Incremental" },
  { value: "exponential", label: "Exponential" },
];

const CURVE_DESCRIPTIONS: Record<"linear" | "incremental" | "exponential", string> = {
  linear: "Steady, even pace — the same-size step every day. Best for rep counts, measurements, savings: things that improve at a constant rate.",
  incremental: "Fast progress early, flattens out as the deadline nears. Best for flexibility/mobility goals, which genuinely behave this way.",
  exponential: "Slow start, accelerating toward the deadline. Best when you need to ramp up gradually before the real push, like building a base before a race.",
};

const PROGRESSION_OPTIONS: { value: ProgressionMode; label: string }[] = [
  { value: "static", label: "Static (+N)" },
  { value: "relative", label: "Relative (+N%)" },
];

const PROGRESSION_DESCRIPTIONS: Record<ProgressionMode, string> = {
  static: "Adds the same fixed amount each session — predictable, linear-feeling progress with no deadline.",
  relative: "No deadline needed — each target compounds off whatever you actually logged last time. Best for strength/weight training.",
};

export function HabitGoalFormScreen({ route, navigation }: Props) {
  const editGoalId = route.params?.editGoalId;
  const isEditMode = !!editGoalId;

  const { categories, refetch: refetchCategories } = useCategories();
  const [categoryId, setCategoryId] = useState<string | undefined>(route.params?.categoryId);
  const [habitId, setHabitId] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEditMode);

  useFocusEffect(
    useCallback(() => {
      refetchCategories();
    }, [refetchCategories])
  );

  // Habit fields
  const [name, setName] = useState("");
  const [type, setType] = useState<HabitType>("numeric");
  const [manualDirection, setManualDirection] = useState<Direction>("increasing");
  const [unitLabel, setUnitLabel] = useState("");
  const [description, setDescription] = useState("");

  // Goal fields
  const [startValue, setStartValue] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [openEnded, setOpenEnded] = useState(false);
  const [pacingMode, setPacingMode] = useState<PacingMode>("step");
  const [targetDate, setTargetDate] = useState(new Date());
  const [curveType, setCurveType] = useState<CurveType>("linear");
  const [adaptive, setAdaptive] = useState(false);
  const [progressionMode, setProgressionMode] = useState<ProgressionMode>("static");
  const [step, setStep] = useState("2");
  const [scheduledDays, setScheduledDays] = useState<number[]>(ALL_DAYS);
  const [notificationTimes, setNotificationTimes] = useState<Record<number, DayTime>>({});
  const [saving, setSaving] = useState(false);
  const [confirmCommit, setConfirmCommit] = useState(false);
  // Whether the goal we loaded already had a target and wasn't achieved — fixed at load time,
  // not from live form state, so flipping "Open-ended" mid-edit can't be used to sneak the
  // schedule back open. Which days are picked and their reminder times stay freely editable
  // even while locked — only the *count* of scheduled days is locked, since that's what
  // actually doubles as the weekly quota (see tallyWeek). lockedDayCount is that count.
  const [scheduleLocked, setScheduleLocked] = useState(false);
  const [lockedDayCount, setLockedDayCount] = useState<number | null>(null);
  // Switching type mid-progression would strand a half-finished numeric curve (or vice
  // versa) — only safe once there's no active progression left to strand: the goal's
  // already achieved, its date has passed, or it was never date/target-bound to begin
  // with (goalless numeric, or boolean — which has no real "goal" in this sense either).
  const [canChangeType, setCanChangeType] = useState(true);

  useEffect(() => {
    if (!editGoalId) return;
    (async () => {
      const goal = await getGoal(editGoalId);
      if (!goal) return;
      const habit = await getHabit(goal.habitId);
      if (!habit) return;
      const [schedules, savedTimes] = await Promise.all([
        listGoalSchedules(goal.id),
        listGoalNotificationTimes(goal.id),
      ]);

      setHabitId(habit.id);
      setName(habit.name);
      setType(habit.type);
      setManualDirection(habit.direction ?? "increasing");
      setUnitLabel(habit.unitLabel ?? "");
      setCategoryId(habit.categoryId);
      setDescription(habit.description ?? "");

      // After achievement: old target becomes new starting point, new target left blank.
      if (goal.achievedAt && goal.targetValue !== undefined) {
        setStartValue(String(goal.targetValue));
        setOpenEnded(false);
        setTargetValue("");
      } else {
        setStartValue(String(goal.startValue));
        setOpenEnded(goal.targetValue === undefined);
        if (goal.targetValue !== undefined) setTargetValue(String(goal.targetValue));
      }
      // Boolean goals always carry targetValue=1 as an implementation detail (it just means
      // "done"), not a real goal to protect — so they never lock, same as a goalless habit.
      const isLocked = habit.type !== "boolean" && goal.targetValue !== undefined && !goal.achievedAt;
      setScheduleLocked(isLocked);
      const currentDays = scheduledDaysAsOf(schedules, today());
      setLockedDayCount(isLocked ? currentDays.length : null);
      const dateComplete = goal.targetDate !== undefined && goal.targetDate < today();
      setCanChangeType(
        habit.type === "boolean" || goal.targetValue === undefined || goal.achievedAt !== undefined || dateComplete
      );
      setPacingMode(goal.targetDate ? "date" : "step");
      if (goal.targetDate) setTargetDate(new Date(goal.targetDate));
      setCurveType(goal.curveType === "linear" ? "linear" : goal.curveType === "exponential" ? "exponential" : "incremental");
      setAdaptive(goal.adaptive);
      setProgressionMode(goal.progressionMode);
      setStep(String(goal.step));
      setScheduledDays(currentDays);
      setNotificationTimes(notificationTimesToMap(savedTimes));
      setLoading(false);
    })();
  }, [editGoalId]);

  const needsDirection = type !== "boolean";
  const isBoolean = type === "boolean";
  const usesDate = pacingMode === "date";
  const hasTarget = usesDate || !openEnded;
  // scheduleLocked itself is only set once, at load — but if the user flips Type to
  // boolean mid-edit, the lock needs to fall away immediately, not just after saving.
  const effectiveScheduleLocked = scheduleLocked && !isBoolean;

  // Numeric habits (reps, sessions, etc.) are whole-number-only — see progression.ts.
  const parsedStart = parseInt(startValue, 10);
  const parsedTarget = parseInt(targetValue, 10);
  // Relative rate is entered as a percentage (e.g. "1.5") and converted to a fraction here,
  // the one place every downstream curve/preview calculation reads from.
  const parsedStep = progressionMode === "relative" ? parseFloat(step) / 100 : parseInt(step, 10);

  // Direction is implied by the goal's own numbers once there's a target to compare
  // against — only goalless habits need it picked manually, since there's nothing to derive it from.
  const direction: Direction =
    hasTarget && !isNaN(parsedStart) && !isNaN(parsedTarget)
      ? directionFromValues(parsedStart, parsedTarget)
      : manualDirection;

  const canSave =
    !saving &&
    !loading &&
    name.trim().length > 0 &&
    scheduledDays.length > 0 &&
    (!effectiveScheduleLocked || scheduledDays.length === lockedDayCount) &&
    (isBoolean ||
      (!isNaN(parsedStart) &&
        (!hasTarget || (!isNaN(parsedTarget) && parsedTarget !== parsedStart)) &&
        !isNaN(parsedStep) &&
        (progressionMode === "relative" || parsedStep >= 1)));

  const previewSchedule: GoalSchedule[] = useMemo(
    () => [{ id: "preview", goalId: "preview", effectiveDate: today(), scheduledDays }],
    [scheduledDays]
  );

  const previewTarget = useMemo(() => {
    if (isBoolean || isNaN(parsedStart) || isNaN(parsedStep) || (hasTarget && isNaN(parsedTarget))) {
      return null;
    }
    const previewGoal: Goal = {
      id: "preview",
      habitId: "preview",
      startValue: parsedStart,
      targetValue: hasTarget ? parsedTarget : undefined,
      targetDate: usesDate ? formatDateLocal(targetDate) : undefined,
      curveType: usesDate ? curveType : progressionMode === "relative" ? "percentage" : "linear",
      adaptive: usesDate ? false : adaptive,
      progressionMode,
      step: parsedStep,
      createdAt: today(),
      active: true,
      onIce: false,
    };
    const previewHabit: Habit = {
      id: "preview",
      name: name || "Goal",
      type,
      direction,
      unitLabel,
      createdAt: today(),
      notificationsEnabled: true,
      notifyOffSchedule: true,
    };
    return generateNextTarget(previewGoal, previewHabit, previewSchedule, [], today()).target;
  }, [
    isBoolean,
    parsedStart,
    parsedTarget,
    parsedStep,
    hasTarget,
    usesDate,
    targetDate,
    curveType,
    adaptive,
    progressionMode,
    name,
    type,
    direction,
    unitLabel,
    previewSchedule,
  ]);

  function handleCategoryCreated(category: Category) {
    refetchCategories();
    setCategoryId(category.id);
  }

  function handleChangeNotificationTime(day: number, time: DayTime) {
    setNotificationTimes((prev) => ({ ...prev, [day]: time }));
  }

  async function performSave() {
    setSaving(true);
    try {
      const goalCurveType: CurveType = isBoolean
        ? "linear"
        : usesDate
          ? curveType
          : progressionMode === "relative"
            ? "percentage"
            : "linear";
      const goalFields = {
        startValue: isBoolean ? 0 : parsedStart,
        targetValue: isBoolean ? 1 : hasTarget ? parsedTarget : undefined,
        targetDate: !isBoolean && usesDate ? formatDateLocal(targetDate) : undefined,
        curveType: goalCurveType,
        adaptive: isBoolean || usesDate ? false : adaptive,
        progressionMode: (isBoolean ? "static" : progressionMode) as ProgressionMode,
        step: isBoolean ? 1 : parsedStep,
      };

      let goalId: string;

      if (isEditMode && editGoalId && habitId) {
        await updateHabit(habitId, {
          name: name.trim(),
          type,
          direction: needsDirection ? direction : undefined,
          unitLabel: isBoolean ? undefined : unitLabel.trim() || undefined,
        });
        await setHabitCategory(habitId, categoryId);
        await setHabitDescription(habitId, description.trim() || undefined);
        await updateGoal(editGoalId, goalFields);
        if (!hasTarget) await clearGoalTarget(editGoalId);
        // Editing here only happens via "Edit & Keep Going" off the achievement prompt, or
        // freely for an already-goalless habit — either way the streak carries over.
        await clearGoalAchievement(editGoalId);

        const schedules = await listGoalSchedules(editGoalId);
        if (scheduledDaysAsOf(schedules, today()).join(",") !== scheduledDays.join(",")) {
          await createGoalSchedule(editGoalId, today(), scheduledDays);
        }
        goalId = editGoalId;
      } else {
        const habit = await createHabit({
          categoryId,
          name: name.trim(),
          type,
          direction: needsDirection ? direction : undefined,
          unitLabel: isBoolean ? undefined : unitLabel.trim() || undefined,
          description: description.trim() || undefined,
        });

        const goal = await createGoal({
          habitId: habit.id,
          ...goalFields,
          active: true,
        });
        await createGoalSchedule(goal.id, localDateOf(goal.createdAt), scheduledDays);
        goalId = goal.id;
      }

      await setGoalNotificationTimes(goalId, notificationTimesFromMap(goalId, scheduledDays, notificationTimes));

      navigation.goBack();
    } finally {
      setSaving(false);
    }
  }

  function handleSave() {
    // Nothing new to warn about if there's no target, the goal was already locked in
    // (this same save can't lock anything further than it already is), or it's a boolean
    // habit (no progression curve or weekly quota to protect, so nothing ever locks).
    if (isBoolean || !hasTarget || effectiveScheduleLocked) {
      performSave();
      return;
    }
    setConfirmCommit(true);
  }

  const unit = unitSuffix(unitLabel);

  return (
    <Screen>
      <PageTitle>{isEditMode ? "Adjust Habit" : "New Habit"}</PageTitle>
      <Text style={styles.sectionHeader}>Habit</Text>

      <FieldGroup>
        <FieldLabel>Name</FieldLabel>
        <TextField placeholder="e.g. Kick height" value={name} onChangeText={setName} autoFocus />
      </FieldGroup>

      <FieldGroup>
        <FieldLabel>Category (optional)</FieldLabel>
        <CategoryPicker
          categories={categories}
          selectedId={categoryId}
          onChange={setCategoryId}
          onCategoryCreated={handleCategoryCreated}
        />
      </FieldGroup>

      <FieldGroup>
        <FieldLabel>Description (optional)</FieldLabel>
        <TextField
          placeholder="Notes about this habit — why it matters, technique cues, anything you want to remember."
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
          style={styles.description}
        />
      </FieldGroup>

      <FieldGroup>
        <FieldLabel>Type</FieldLabel>
        {canChangeType ? (
          <ChipSelector options={TYPE_OPTIONS} value={type} onChange={setType} />
        ) : (
          <>
            <Text style={styles.readOnlyValue}>{TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type}</Text>
            <HintText>
              Locked while this goal is in progress — free to change once it's achieved, its date
              passes, or you make it open-ended.
            </HintText>
          </>
        )}
      </FieldGroup>
      {!isBoolean && (
        <FieldGroup>
          <FieldLabel>Unit Label (optional)</FieldLabel>
          <TextField placeholder="e.g. cm, reps, kg" value={unitLabel} onChangeText={setUnitLabel} />
        </FieldGroup>
      )}

      {!isBoolean && (
        <>
          <Text style={styles.sectionHeader}>Progress</Text>

          <View style={styles.startingPointSpacer}>
            <FieldGroup>
              <FieldLabel>Starting Point</FieldLabel>
              <TextField
                placeholder="e.g. 60"
                keyboardType="number-pad"
                value={startValue}
                onChangeText={setStartValue}
              />
              <HintText>Where you're starting from, how fast you'll move, and what you're aiming for.</HintText>
            </FieldGroup>
          </View>

          <FieldGroup>
            <View style={styles.switchRow}>
              <FieldLabel>Open-ended (no end goal)</FieldLabel>
              <Switch
                value={openEnded}
                onValueChange={(value) => {
                  setOpenEnded(value);
                  // A date-paced goal always has an end goal by definition — force step
                  // pacing so the Pacing choice below (hidden while open-ended) can't
                  // silently contradict the toggle next time it's revealed.
                  if (value) setPacingMode("step");
                }}
                disabled={effectiveScheduleLocked}
              />
            </View>
            <HintText>
              {openEnded
                ? "Runs forever on streaks and daily targets alone, with no finish line — your schedule stays fully unlocked, so you can change the days (and how many) anytime."
                : effectiveScheduleLocked
                  ? `This has an end goal, so the number of days you check in each week (${lockedDayCount}) is locked in until you achieve it or its date passes.`
                  : "This has an end goal — once you save, the number of days you check in each week locks in until you achieve it."}
            </HintText>
          </FieldGroup>

          {hasTarget ? (
            <FieldGroup>
              <FieldLabel>End Goal</FieldLabel>
              <TextField
                placeholder="e.g. 90"
                keyboardType="number-pad"
                value={targetValue}
                onChangeText={setTargetValue}
              />
            </FieldGroup>
          ) : (
            <FieldGroup>
              <FieldLabel>Direction</FieldLabel>
              <ChipSelector options={DIRECTION_OPTIONS} value={manualDirection} onChange={setManualDirection} />
              <HintText>With no goal to compare against, you need to say which way counts as progress.</HintText>
            </FieldGroup>
          )}

          {!openEnded && (
            <FieldGroup>
              <FieldLabel>Pacing</FieldLabel>
              <ChipSelector options={PACING_OPTIONS} value={pacingMode} onChange={setPacingMode} />
            </FieldGroup>
          )}

          {usesDate ? (
            <>
              <FieldGroup>
                <FieldLabel>Target Date</FieldLabel>
                <DateField value={targetDate} onChange={setTargetDate} />
              </FieldGroup>
              <FieldGroup>
                <FieldLabel>Curve</FieldLabel>
                <ChipSelector options={DATE_CURVE_OPTIONS} value={curveType} onChange={setCurveType} />
                <CurveShapePreview value={curveType} />
                <HintText>{CURVE_DESCRIPTIONS[curveType as "linear" | "incremental" | "exponential"]}</HintText>
              </FieldGroup>
            </>
          ) : (
            <>
              <FieldGroup>
                <FieldLabel>Progression Mode</FieldLabel>
                <ChipSelector
                  options={PROGRESSION_OPTIONS}
                  value={progressionMode}
                  onChange={setProgressionMode}
                />
                <HintText>{PROGRESSION_DESCRIPTIONS[progressionMode]}</HintText>
              </FieldGroup>
              <FieldGroup>
                <FieldLabel>{progressionMode === "relative" ? "Rate (%)" : "Step Amount"}</FieldLabel>
                <TextField
                  placeholder={progressionMode === "relative" ? "1.5" : "2"}
                  keyboardType={progressionMode === "relative" ? "decimal-pad" : "number-pad"}
                  value={step}
                  onChangeText={setStep}
                />
                {progressionMode === "relative" ? (
                  <HintText>e.g. 1.5 for 1.5% per session.</HintText>
                ) : (
                  <HintText>Whole numbers only, minimum 1.</HintText>
                )}
              </FieldGroup>
            </>
          )}

          {!usesDate && (
            <FieldGroup>
              <View style={styles.switchRow}>
                <FieldLabel>Adaptive (plateau-aware pacing)</FieldLabel>
                <Switch value={adaptive} onValueChange={setAdaptive} />
              </View>
              <HintText>
                Watches your last 5 entries. Hitting ≥80% of them pushes the pace up; ≤40% eases it back.
              </HintText>
            </FieldGroup>
          )}

          {previewTarget !== null && (
            <View style={styles.previewBox}>
              <Text style={styles.previewLabel}>Day 1 target</Text>
              <Text style={styles.previewValue}>
                {formatNumber(previewTarget)}
                {unit}
              </Text>
            </View>
          )}
        </>
      )}

      <Text style={styles.sectionHeader}>Schedule</Text>
      <FieldGroup>
        <ScheduleDayPicker
          days={scheduledDays}
          onChangeDays={setScheduledDays}
          times={notificationTimes}
          onChangeTime={handleChangeNotificationTime}
        />
        {effectiveScheduleLocked && scheduledDays.length !== lockedDayCount && (
          <HintText danger>
            Pick exactly {lockedDayCount} day{lockedDayCount === 1 ? "" : "s"} to save.
          </HintText>
        )}
        <HintText>
          {usesDate
            ? effectiveScheduleLocked
              ? `Which days you pick and their reminder times are yours to change — it's only the number of days (${lockedDayCount} this week) that's locked in, since that's what sets your weekly quota.`
              : "Once you save, the number of days you check in each week locks in until you achieve this goal or its date passes. You can still change which days and their reminder times."
            : "These are your check-in days — when you'll be reminded. You can log on any day and it still counts toward your weekly quota."}
        </HintText>
      </FieldGroup>

      <Button title="Save" onPress={handleSave} disabled={!canSave} />

      <ConfirmDialog
        visible={confirmCommit}
        title="Lock in your weekly quota?"
        message="Once saved, you won't be able to switch this back to open-ended, and the number of days per week is locked, until you achieve this goal (or its date passes). You'll still be able to change which days and reminder times — just not how many. Ready to lock it in?"
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        onConfirm={() => {
          setConfirmCommit(false);
          performSave();
        }}
        onCancel={() => setConfirmCommit(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  readOnlyValue: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "600",
    paddingVertical: 4,
  },
  description: {
    height: 80,
    paddingTop: 8,
    textAlignVertical: "top",
  },
  switchRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  startingPointSpacer: {
    marginTop: 6,
  },
  sectionHeader: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 14,
    marginTop: 6,
    textTransform: "uppercase",
  },
  previewBox: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  previewLabel: {
    color: theme.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  previewValue: {
    color: theme.primary,
    fontSize: 16,
    fontWeight: "700",
  },
});
