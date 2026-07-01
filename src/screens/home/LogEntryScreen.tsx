import { useEffect, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../../components/ui/Button";
import { FieldGroup, FieldLabel, TextField } from "../../components/ui/FormField";
import { PageTitle, Screen } from "../../components/ui/Screen";
import { getHabit, getGoal, listEntriesByGoal, updateGoal } from "../../db/repositories";
import { today } from "../../engine/dateUtils";
import { pickPrimaryCelebration } from "../../services/celebrations";
import { getDailyStatus, logGoalEntry } from "../../services/dailyStatus";
import { detectPacingMismatch, PacingMismatch } from "../../services/pacingAdjustment";
import { setPendingCelebration, setPendingEncouragement } from "../../services/pendingCelebration";
import { theme } from "../../theme";
import { Goal, Habit } from "../../types";
import { unitSuffix } from "../../utils/format";
import { HomeStackParamList } from "../../navigation/types";
import { PacingAdjustmentPrompt } from "./PacingAdjustmentPrompt";

type Props = NativeStackScreenProps<HomeStackParamList, "LogEntry">;

export function LogEntryScreen({ route, navigation }: Props) {
  const { goalId } = route.params;

  const [goal, setGoal] = useState<Goal | null>(null);
  const [habit, setHabit] = useState<Habit | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [actualValue, setActualValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [pacingMismatch, setPacingMismatch] = useState<PacingMismatch | null>(null);
  const [isFrozen, setIsFrozen] = useState(false);

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

  const isBoolean = habit?.type === "boolean";
  const parsedValue = parseInt(actualValue, 10);
  const canSave =
    !saving &&
    !isFrozen &&
    goal !== null &&
    habit !== null &&
    (isBoolean || !isNaN(parsedValue));

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
        tagIds: [],
      });

      const primary = pickPrimaryCelebration(celebrations);
      if (primary) {
        setPendingCelebration({ celebration: primary, habitName: habit.name, goalId: goal.id, targetDate: goal.targetDate });
        navigation.goBack();
        return;
      }

      if (!entry.hit) {
        setPendingEncouragement();
        navigation.goBack();
        return;
      }

      await checkPacingAndFinish();
    } finally {
      setSaving(false);
    }
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
              <FieldLabel>{target !== null ? `Today's target: ${target}${unit}` : "Value"}</FieldLabel>
              <TextField
                placeholder={`e.g. ${target ?? ""}`}
                keyboardType="number-pad"
                value={actualValue}
                onChangeText={(text) => setActualValue(text.replace(/[^0-9]/g, ""))}
                autoFocus
              />
            </FieldGroup>
          )}
        </>
      )}

      <Button title="Save" onPress={handleSave} disabled={!canSave} />

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
