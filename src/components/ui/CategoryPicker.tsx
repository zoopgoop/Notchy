import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { TextField } from "./FormField";
import { ColorSwatchPicker } from "./ColorSwatchPicker";
import { createCategory } from "../../db/repositories";
import { CATEGORY_COLOR_PALETTE, theme } from "../../theme";
import { Category } from "../../types";

/** Single-select and skippable — tap the selected chip again to clear it. */
export function CategoryPicker({
  categories,
  selectedId,
  onChange,
  onCategoryCreated,
}: {
  categories: Category[];
  selectedId: string | undefined;
  onChange: (categoryId: string | undefined) => void;
  onCategoryCreated: (category: Category) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(CATEGORY_COLOR_PALETTE[0]);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      setAdding(false);
      return;
    }
    const category = await createCategory({ name: trimmed, color });
    onCategoryCreated(category);
    setName("");
    setAdding(false);
  }

  return (
    <View>
      <View style={styles.row}>
        {categories.map((category) => {
          const selected = category.id === selectedId;
          return (
            <Pressable
              key={category.id}
              onPress={() => onChange(selected ? undefined : category.id)}
              style={[styles.chip, selected && { backgroundColor: category.color, borderColor: category.color }]}
            >
              <View style={[styles.dot, { backgroundColor: category.color }]} />
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{category.name}</Text>
            </Pressable>
          );
        })}
        {!adding && (
          <Pressable style={styles.chip} onPress={() => setAdding(true)}>
            <Text style={styles.chipText}>+ New</Text>
          </Pressable>
        )}
      </View>

      {adding && (
        <View style={styles.addPanel}>
          <TextField placeholder="Category name" value={name} onChangeText={setName} autoFocus />
          <View style={styles.swatchSpacer}>
            <ColorSwatchPicker value={color} onChange={setColor} />
          </View>
          <View style={styles.addActions}>
            <Pressable onPress={() => setAdding(false)} style={styles.addActionButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleCreate} style={styles.addActionButton}>
              <Text style={styles.createText}>Add</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dot: {
    borderRadius: 5,
    height: 10,
    marginRight: 6,
    width: 10,
  },
  chipText: {
    color: theme.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  chipTextSelected: {
    color: "#FFFFFF",
  },
  addPanel: {
    backgroundColor: theme.surface,
    borderRadius: 10,
    marginTop: 10,
    padding: 12,
  },
  swatchSpacer: {
    marginTop: 10,
  },
  addActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 12,
  },
  addActionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  cancelText: {
    color: theme.textMuted,
    fontWeight: "600",
  },
  createText: {
    color: theme.primary,
    fontWeight: "700",
  },
});
