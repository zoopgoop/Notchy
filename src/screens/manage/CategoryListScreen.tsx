import { useCallback } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "../../components/ui/Button";
import { PageTitle, Screen } from "../../components/ui/Screen";
import { useCategories } from "../../hooks/useCategories";
import { useHabits } from "../../hooks/useHabits";
import { cardShadow, theme, UNCATEGORIZED_COLOR, UNCATEGORIZED_LABEL } from "../../theme";
import { ManageStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<ManageStackParamList, "CategoryList">;

export function CategoryListScreen({ navigation }: Props) {
  const { categories, refetch } = useCategories();
  const { habits: uncategorized, refetch: refetchUncategorized } = useHabits(undefined);

  useFocusEffect(
    useCallback(() => {
      refetch();
      refetchUncategorized();
    }, [refetch, refetchUncategorized])
  );

  return (
    <Screen scroll={false}>
      <FlatList
        overScrollMode="never"
        data={categories}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <PageTitle subtitle="Every habit, active or not, organized by category.">Habits</PageTitle>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate("CategoryDetail", { categoryId: item.id })}
          >
            <View style={[styles.dot, { backgroundColor: item.color }]} />
            <Text style={styles.rowText}>{item.name}</Text>
          </Pressable>
        )}
        ListFooterComponent={
          uncategorized.length > 0 ? (
            <Pressable
              style={styles.row}
              onPress={() => navigation.navigate("CategoryDetail", { categoryId: undefined })}
            >
              <View style={[styles.dot, { backgroundColor: UNCATEGORIZED_COLOR }]} />
              <Text style={styles.rowText}>{UNCATEGORIZED_LABEL}</Text>
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          uncategorized.length === 0 ? (
            <Text style={styles.empty}>
              No categories yet — they're optional. Create one if you want to color-code and group
              your habits; otherwise just create habits from the Home tab.
            </Text>
          ) : null
        }
      />
      <View style={styles.footer}>
        <Button title="+ New Category" onPress={() => navigation.navigate("CategoryForm")} />
      </View>
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => navigation.navigate("HabitGoalForm", undefined)}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: 16,
  },
  row: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderRadius: 10,
    flexDirection: "row",
    marginBottom: 10,
    padding: 16,
    ...cardShadow,
  },
  dot: {
    borderRadius: 8,
    height: 16,
    marginRight: 12,
    width: 16,
  },
  rowText: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "600",
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
  fab: {
    alignItems: "center",
    backgroundColor: theme.primary,
    borderRadius: 28,
    bottom: 96,
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
});
