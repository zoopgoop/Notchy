import { useCallback, useEffect, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { ActionSheet, ActionSheetOption } from "../../components/ui/ActionSheet";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { PageTitle, Screen } from "../../components/ui/Screen";
import { deleteCategory, getCategory, getCurrentGoalForHabit, setGoalActive } from "../../db/repositories";
import { useHabits } from "../../hooks/useHabits";
import { getFreezesEnabled } from "../../services/settings";
import { forfeitCurrentStreak } from "../../services/streaks";
import { cardShadow, theme, UNCATEGORIZED_COLOR, UNCATEGORIZED_LABEL } from "../../theme";
import { Category, Goal, Habit } from "../../types";
import { ManageStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<ManageStackParamList, "CategoryDetail">;

type DialogState = { kind: "deactivateConfirm"; habit: Habit; goal: Goal } | { kind: "deleteCategory" } | null;

export function CategoryDetailScreen({ route, navigation }: Props) {
  const { categoryId } = route.params;
  const [category, setCategory] = useState<Category | null>(null);
  const { habits, refetch } = useHabits(categoryId);
  const [goalsByHabit, setGoalsByHabit] = useState<Record<string, Goal | null>>({});
  const [freezesEnabled, setFreezesEnabled] = useState(true);
  const [actionSheetHabit, setActionSheetHabit] = useState<Habit | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);

  useEffect(() => {
    if (categoryId) getCategory(categoryId).then(setCategory);
  }, [categoryId]);

  useFocusEffect(
    useCallback(() => {
      refetch();
      getFreezesEnabled().then(setFreezesEnabled);
    }, [refetch])
  );

  useEffect(() => {
    Promise.all(habits.map((h) => getCurrentGoalForHabit(h.id))).then((goals) => {
      setGoalsByHabit(Object.fromEntries(habits.map((h, i) => [h.id, goals[i]])));
    });
  }, [habits]);

  async function performDelete() {
    if (!categoryId) return;
    await deleteCategory(categoryId);
    navigation.goBack();
  }

  async function handleToggleActive(habit: Habit, goal: Goal) {
    setActionSheetHabit(null);
    if (goal.active) {
      setDialog({ kind: "deactivateConfirm", habit, goal });
      return;
    }
    await setGoalActive(goal.id, true);
    refetch();
  }

  async function performDeactivate(goal: Goal) {
    await forfeitCurrentStreak(goal.id);
    await setGoalActive(goal.id, false);
    refetch();
  }

  const title = categoryId ? category?.name : UNCATEGORIZED_LABEL;
  const accentColor = category?.color ?? UNCATEGORIZED_COLOR;
  const actionSheetGoal = actionSheetHabit ? goalsByHabit[actionSheetHabit.id] : null;

  const actionSheetOptions: ActionSheetOption[] = actionSheetHabit
    ? [
        {
          label: "View Details",
          onPress: () => navigation.navigate("HabitDetail", { habitId: actionSheetHabit.id }),
        },
        ...(freezesEnabled && actionSheetGoal
          ? [
              {
                label: "Add Freeze Window",
                onPress: () => navigation.navigate("FreezeWindowForm", { goalId: actionSheetGoal.id }),
              },
            ]
          : []),
        ...(actionSheetGoal
          ? [
              {
                label: actionSheetGoal.active ? "Deactivate Habit" : "Activate Habit",
                destructive: actionSheetGoal.active,
                onPress: () => handleToggleActive(actionSheetHabit, actionSheetGoal),
              },
            ]
          : []),
      ]
    : [];

  return (
    <Screen scroll={false}>
      <FlatList
        overScrollMode="never"
        data={habits}
        keyExtractor={(h) => h.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={title ? <PageTitle>{title}</PageTitle> : null}
        renderItem={({ item }) => {
          const goal = goalsByHabit[item.id];
          const isActive = goal ? goal.active : true;
          return (
            <Pressable
              style={[styles.row, { borderLeftColor: accentColor }]}
              onPress={() => navigation.navigate("HabitDetail", { habitId: item.id })}
              onLongPress={() => setActionSheetHabit(item)}
            >
              <View style={styles.rowHeader}>
                <View style={[styles.statusDot, isActive ? styles.statusDotActive : styles.statusDotInactive]} />
                <Text style={styles.rowText}>{item.name}</Text>
              </View>
              <Text style={styles.rowSubtext}>
                {item.type} · {isActive ? "Active" : "Inactive"}
              </Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>No habits yet. Add one to define what you're tracking.</Text>
        }
      />
      <View style={styles.footer}>
        <Button
          title="+ New Habit"
          onPress={() => navigation.navigate("HabitGoalForm", { categoryId })}
        />
        {categoryId && (
          <>
            <View style={styles.spacer} />
            <Button title="Delete Category" variant="danger" onPress={() => setDialog({ kind: "deleteCategory" })} />
          </>
        )}
      </View>

      <ActionSheet
        visible={actionSheetHabit !== null}
        title={actionSheetHabit?.name}
        options={actionSheetOptions}
        onClose={() => setActionSheetHabit(null)}
      />

      <ConfirmDialog
        visible={dialog?.kind === "deactivateConfirm"}
        title="Deactivate this habit?"
        message="This isn't a freeze or a skip — your current streak will be lost for good. Use those instead if you want a break without losing it. Deactivating just removes the habit from today's list; nothing is deleted, and you can reactivate it later from here."
        confirmLabel="Deactivate"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          if (dialog?.kind === "deactivateConfirm") performDeactivate(dialog.goal);
          setDialog(null);
        }}
        onCancel={() => setDialog(null)}
      />

      <ConfirmDialog
        visible={dialog?.kind === "deleteCategory"}
        title="Delete category?"
        message={`This deletes "${category?.name}". Its habits and goals stay, just uncategorized.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          setDialog(null);
          performDelete();
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
  row: {
    backgroundColor: theme.surface,
    borderLeftWidth: 4,
    borderRadius: 10,
    marginBottom: 10,
    padding: 16,
    ...cardShadow,
  },
  rowHeader: {
    alignItems: "center",
    flexDirection: "row",
  },
  statusDot: {
    borderRadius: 4,
    height: 8,
    marginRight: 8,
    width: 8,
  },
  statusDotActive: {
    backgroundColor: "#4CAF50",
  },
  statusDotInactive: {
    backgroundColor: theme.textMuted,
  },
  rowText: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "600",
  },
  rowSubtext: {
    color: theme.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  empty: {
    color: theme.textMuted,
    fontSize: 15,
    marginTop: 24,
    textAlign: "center",
  },
  footer: {
    borderTopColor: theme.border,
    borderTopWidth: 1,
    padding: 16,
  },
  spacer: {
    height: 10,
  },
});
