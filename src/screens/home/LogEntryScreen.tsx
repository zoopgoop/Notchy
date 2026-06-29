import { useEffect, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../../components/ui/Button";
import { CelebrationOverlay } from "../../components/celebration/CelebrationOverlay";
import { EncouragementToast } from "../../components/celebration/EncouragementToast";
import { FieldGroup, FieldLabel, TextField } from "../../components/ui/FormField";
import { PageTitle, Screen } from "../../components/ui/Screen";
import { getHabit, getGoal, listEntriesByGoal, updateGoal } from "../../db/repositories";
import { daysBetween, today } from "../../engine/dateUtils";
import { useTags } from "../../hooks/useTags";
import { pickPrimaryCelebration } from "../../services/celebrations";
import { getDailyStatus, logGoalEntry } from "../../services/dailyStatus";
import { detectPacingMismatch, PacingMismatch } from "../../services/pacingAdjustment";
import { theme } from "../../theme";
import { Celebration, Goal, Habit, Tag } from "../../types";
import { unitSuffix } from "../../utils/format";
import { HomeStackParamList } from "../../navigation/types";
import { HabitAchievedPrompt } from "./HabitAchievedPrompt";
import { PacingAdjustmentPrompt } from "./PacingAdjustmentPrompt";
import { TagPicker } from "./TagPicker";

type Props = NativeStackScreenProps<HomeStackParamList, "LogEntry">;

export function LogEntryScreen({ route, navigation }: Props) {
  const { goalId } = route.params;
  const { tags, refetch: refetchTags } = useTags();

  const [goal, setGoal] = useState<Goal | null>(null);
  const [habit, setHabit] = useState<Habit | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [actualValue, setActualValue] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [showAchievedPrompt, setShowAchievedPrompt] = useState(false);
  const [daysEarly, setDaysEarly] = useState<number | null>(null);
  const [pacingMismatch, setPacingMismatch] = useState<PacingMismatch | null>(null);
  const [isFrozen, setIsFrozen] = useState(false);
  const [showEncouragement, setShowEncouragement] = useState(false);

  useEffect(() => {
    (async () => {
      const loadedGoal = await getGoal(goalId);
      if (!loadedGoal) return;
      const loadedHabit = await getHabit(loadedGoal.habitId);
      if (!loadedHabit) return;
      setGoal(loadedGoal);
      setHabit(loadedHabit);
      const status = await getDailyStatus(loadedGoal, loadedHabit, today());
      if (status.kind === "pending") {
        setTarget(status.target);
      } else if (status.kind === "logged") {
        setTarget(status.entry.generatedTarget);
        if (status.entry.actualValue !== undefined) {
          setActualValue(String(status.entry.actualValue));
        }
      } else if (status.kind === "frozen") {
        setIsFrozen(true);
      }
    })();
  }, [goalId]);

  function toggleTag(tagId: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  }

  function handleTagCreated(tag: Tag) {
    refetchTags();
    setSelectedTagIds((prev) => [...prev, tag.id]);
  }

  const isBoolean = habit?.type === "boolean";
  // Numeric logging (reps, sessions, etc.) is whole-number-only — see progression.ts.
  const parsedValue = parseInt(actualValue, 10);
  const canSave =
    !saving &&
    !isFrozen &&
    goal !== null &&
    habit !== null &&
    (isBoolean || !isNaN(parsedValue));

  /** Shared tail of every "done logging" path — checked regardless of whether today hit or missed. */
  async function checkPacingAndFinish() {
    if (goal && habit && goal.targetDate) {
      const entries = await listEntriesByGoal(goal.id);
      const mismatch = detectPacingMismatch(goal, habit, entries);
      if (mismatch) {
        setPacingMismatch(mismatch);
        return;
      }
    }
    navigation.goBack();
  }

  async function handleSave() {
    if (!goal || !habit) return;
    setSaving(true);
    try {
      const value = isBoolean ? 1 : parsedValue;
      const effectiveTarget = target ?? value;
      const { entry, celebrations } = await logGoalEntry({
        goal,
        habit,
        date: today(),
        actualValue: value,
        generatedTarget: effectiveTarget,
        tagIds: selectedTagIds,
      });

      const primary = pickPrimaryCelebration(celebrations);
      if (primary) {
        setCelebration(primary);
        return;
      }

      // Missed today's number but still logged — the streak doesn't care, just acknowledge it kindly.
      if (!entry.hit) {
        setShowEncouragement(true);
        return;
      }

      await checkPacingAndFinish();
    } finally {
      setSaving(false);
    }
  }

  function handleEditAndContinue() {
    navigation.replace("HabitGoalForm", { editGoalId: goal!.id });
  }

  function handleMarkComplete() {
    navigation.goBack();
  }

  async function handlePacingAdjustDate(newDate: string) {
    if (!goal) return;
    await updateGoal(goal.id, { targetDate: newDate });
    setPacingMismatch(null);
    navigation.goBack();
  }

  async function handlePacingAdjustTarget(newTarget: number) {
    if (!goal) return;
    await updateGoal(goal.id, { targetValue: newTarget });
    setPacingMismatch(null);
    navigation.goBack();
  }

  if (!goal || !habit) {
    return <Screen />;
  }

  const unit = unitSuffix(habit.unitLabel);

  return (
    <Screen>
      <PageTitle subtitle={isBoolean ? "Mark today as done." : undefined}>{habit.name}</PageTitle>

      {isFrozen ? (
        <View style={styles.frozenBanner}>
          <Ionicons name="snow-outline" size={28} color={theme.frozen} />
          <Text style={styles.frozenText}>
            This habit is frozen right now — no logs can be taken until the freeze window ends.
          </Text>
        </View>
      ) : (
        <>
          {!isBoolean && (
            <FieldGroup>
              <FieldLabel>{target !== null ? `Daily target: ${target}${unit}` : "Value"}</FieldLabel>
              <TextField
                placeholder={`e.g. ${target ?? ""}`}
                keyboardType="number-pad"
                value={actualValue}
                onChangeText={setActualValue}
                autoFocus
              />
            </FieldGroup>
          )}

          <FieldGroup>
            <FieldLabel>Tags (optional)</FieldLabel>
            <TagPicker
              tags={tags}
              selectedIds={selectedTagIds}
              onToggle={toggleTag}
              onTagCreated={handleTagCreated}
            />
          </FieldGroup>
        </>
      )}

      <Button title="Save" onPress={handleSave} disabled={!canSave} />

      {celebration && (
        <CelebrationOverlay
          celebration={celebration}
          habitName={habit.name}
          onDismiss={() => {
            setCelebration(null);
            if (celebration.type === "goal_achieved") {
              setDaysEarly(goal.targetDate ? daysBetween(today(), goal.targetDate) : null);
              setShowAchievedPrompt(true);
            } else {
              checkPacingAndFinish();
            }
          }}
        />
      )}

      {showEncouragement && (
        <EncouragementToast
          onDismiss={() => {
            setShowEncouragement(false);
            checkPacingAndFinish();
          }}
        />
      )}

      {showAchievedPrompt && (
        <HabitAchievedPrompt
          habitName={habit.name}
          daysEarly={daysEarly}
          onEditAndContinue={handleEditAndContinue}
          onMarkComplete={handleMarkComplete}
        />
      )}

      {pacingMismatch && goal.targetDate && goal.targetValue !== undefined && (
        <PacingAdjustmentPrompt
          mismatch={pacingMismatch}
          currentTargetDate={goal.targetDate}
          currentTargetValue={goal.targetValue}
          unit={unit}
          onAdjustDate={handlePacingAdjustDate}
          onAdjustTarget={handlePacingAdjustTarget}
          onDismiss={() => {
            setPacingMismatch(null);
            navigation.goBack();
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  frozenBanner: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 24,
  },
  frozenText: {
    color: theme.textMuted,
    fontSize: 15,
    marginTop: 12,
    textAlign: "center",
  },
});
