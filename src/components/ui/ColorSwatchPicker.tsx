import { Pressable, StyleSheet, View } from "react-native";
import { CATEGORY_COLOR_PALETTE, theme } from "../../theme";

export function ColorSwatchPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <View style={styles.row}>
      {CATEGORY_COLOR_PALETTE.map((color) => {
        const selected = color === value;
        return (
          <Pressable
            key={color}
            onPress={() => onChange(color)}
            style={[
              styles.swatch,
              { backgroundColor: color },
              selected && styles.selected,
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  swatch: {
    borderRadius: 18,
    height: 36,
    width: 36,
  },
  selected: {
    borderColor: theme.text,
    borderWidth: 3,
  },
});
