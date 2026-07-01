import { useEffect, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StyleSheet, Switch, View } from "react-native";
import { CurveShapePreview } from "../../components/charts/CurveShapePreview";
import { Button } from "../../components/ui/Button";
import { ChipSelector } from "../../components/ui/ChipSelector";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { DayTime, notificationTimesFromMap } from "../../components/ui/DayNotificationTimes";
import { DateField, FieldGroup, FieldLabel, HintText, TextField } from "../../components/ui/FormField";
import { PageTitle, Screen } from "../../components/ui/Screen";
import { ScheduleDayPicker } from "../../components/ui/ScheduleDayPicker";
import { createGoal, createGoalSchedule, getHabit, setGoalNotificationTimes, updateHabit } from "../../db/repositories";
import { directionFromValues } from "../../engine/curves";
import { formatDateLocal } from "../../engine/dateUtils";
import { CurveType, Direction, Habit, ProgressionMode } from "../../types";
import { ManageStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<ManageStackParamList, "GoalForm">;
type PacingMode = "date" | "step";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

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

const PROGRESSION_OPTIONS: { value: ProgressionMode; label: string }[] = [
  { value: "static", label: "Static (+N)" },
  { value: "relative", label: "Relative (+N%)" },
];

export function GoalFormScreen({ route, navigation }: Props) {
  const { habitId } = route.params;
  const [habit, setHabit] = useState<Habit | null>(null);

  const [startValue, setStartValue] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [openEnded, setOpenEnded] = useState(false);
  const [manualDirection, setManualDirection] = useState<Direction>("increasing");
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

  useEffect(() => {
    getHabit(habitId).then(setHabit);
  }, [habitId]);

  const isBoolean = habit?.type === "boolean";
  const usesDate = pacingMode === "date";
  const hasTarget = usesDate || !openEnded;

  // Numeric habits (reps, sessions, etc.) are whole-number-only — see progression.ts.
  const parsedStart = parseInt(startValue, 10);
  const parsedTarget = parseInt(targetValue, 10);
  // Relative rate is entered as a percentage (e.g. "1.5") and converted to a fraction here,
  // the one place every downstream curve calculation reads from.
  const parsedStep = progressionMode === "relative" ? parseFloat(step) / 100 : parseInt(step, 10);

  const direction: Direction =
    hasTarget && !isNaN(parsedStart) && !isNaN(parsedTarget)
      ? directionFromValues(parsedStart, parsedTarget)
      : manualDirection;

  const canSave =
    !saving &&
    scheduledDays.length > 0 &&
    (isBoolean ||
      (!isNaN(parsedStart) &&
        (!hasTarget || (!isNaN(parsedTarget) && parsedTarget !== parsedStart)) &&
        !isNaN(parsedStep) &&
        (progressionMode === "relative" || parsedStep >= 1)));

  function handleChangeNotificationTime(day: number, time: DayTime) {
    setNotificationTimes((prev) => ({ ...prev, [day]: time }));
  }

  async function performSave() {
    if (!habit) return;
    setSaving(true);
    try {
      await updateHabit(habit.id, { direction: isBoolean ? undefined : direction });
      const goal = await createGoal({
        habitId,
        startValue: isBoolean ? 0 : parsedStart,
        targetValue: isBoolean ? 1 : hasTarget ? parsedTarget : undefined,
        targetDate: !isBoolean && usesDate ? formatDateLocal(targetDate) : undefined,
        curveType: isBoolean
          ? "linear"
          : usesDate
            ? curveType
            : progressionMode === "relative"
              ? "percentage"
              : "linear",
        adaptive: isBoolean || usesDate ? false : adaptive,
        progressionMode: isBoolean ? "static" : progressionMode,
        step: isBoolean ? 1 : parsedStep,
        active: true,
      });
      await createGoalSchedule(goal.id, goal.createdAt.slice(0, 10), scheduledDays);
      await setGoalNotificationTimes(goal.id, notificationTimesFromMap(goal.id, scheduledDays, notificationTimes));
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  }

  function handleSave() {
    if (!hasTarget) {
      performSave();
      return;
    }
    setConfirmCommit(true);
  }

  return (
    <Screen>
      <PageTitle>New Goal</PageTitle>
      {!isBoolean && (
        <>
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

          <FieldGroup>
            <FieldLabel>Pacing</FieldLabel>
            <ChipSelector options={PACING_OPTIONS} value={pacingMode} onChange={setPacingMode} />
          </FieldGroup>

          {!usesDate && (
            <FieldGroup>
              <View style={styles.switchRow}>
                <FieldLabel>Open-ended (no end goal)</FieldLabel>
                <Switch value={openEnded} onValueChange={setOpenEnded} />
              </View>
              <HintText>
                Runs forever on streaks and daily targets alone, with no finish line. You can change
                this to a goal — or back — anytime, since there's nothing to lock in without one.
              </HintText>
            </FieldGroup>
          )}

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
            </FieldGroup>
          )}
        </>
      )}

      <FieldGroup>
        <FieldLabel>Days you'll log on</FieldLabel>
        <ScheduleDayPicker
          days={scheduledDays}
          onChangeDays={setScheduledDays}
          times={notificationTimes}
          onChangeTime={handleChangeNotificationTime}
        />
        <HintText>
          These are your check-in days — when you'll be reminded. You can log on any day and it still counts toward your weekly quota.
        </HintText>
      </FieldGroup>

      <Button title="Save Goal" onPress={handleSave} disabled={!canSave} />

      <ConfirmDialog
        visible={confirmCommit}
        title="Lock these settings in?"
        message="Once saved, this goal is final until you hit it or its date passes. The only other way to change it is deleting and starting over."
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
  switchRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
});
