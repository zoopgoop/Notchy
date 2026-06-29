import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { TextField } from "../../components/ui/FormField";
import { createTag } from "../../db/repositories";
import { theme } from "../../theme";
import { Tag } from "../../types";

export function TagPicker({
  tags,
  selectedIds,
  onToggle,
  onTagCreated,
}: {
  tags: Tag[];
  selectedIds: string[];
  onToggle: (tagId: string) => void;
  onTagCreated: (tag: Tag) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");

  async function handleCreate() {
    const trimmed = label.trim();
    if (!trimmed) {
      setAdding(false);
      return;
    }
    const tag = await createTag(trimmed);
    onTagCreated(tag);
    setLabel("");
    setAdding(false);
  }

  return (
    <View>
      <View style={styles.row}>
        {tags.map((tag) => {
          const selected = selectedIds.includes(tag.id);
          return (
            <Pressable
              key={tag.id}
              onPress={() => onToggle(tag.id)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{tag.label}</Text>
            </Pressable>
          );
        })}
        {!adding && (
          <Pressable style={styles.chip} onPress={() => setAdding(true)}>
            <Text style={styles.chipText}>+ Custom</Text>
          </Pressable>
        )}
      </View>
      {adding && (
        <View style={styles.addRow}>
          <TextField
            placeholder="Tag name"
            value={label}
            onChangeText={setLabel}
            autoFocus
            onSubmitEditing={handleCreate}
          />
          <Pressable style={styles.addButton} onPress={handleCreate}>
            <Text style={styles.addButtonText}>Add</Text>
          </Pressable>
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
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipSelected: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  chipText: {
    color: theme.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  chipTextSelected: {
    color: "#FFFFFF",
  },
  addRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  addButton: {
    alignItems: "center",
    backgroundColor: theme.primary,
    borderRadius: 10,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  addButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
