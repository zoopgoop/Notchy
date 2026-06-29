import { useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../../components/ui/Button";
import { ColorSwatchPicker } from "../../components/ui/ColorSwatchPicker";
import { FieldGroup, FieldLabel, TextField } from "../../components/ui/FormField";
import { PageTitle, Screen } from "../../components/ui/Screen";
import { createCategory } from "../../db/repositories";
import { CATEGORY_COLOR_PALETTE } from "../../theme";
import { ManageStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<ManageStackParamList, "CategoryForm">;

export function CategoryFormScreen({ navigation }: Props) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(CATEGORY_COLOR_PALETTE[0]);
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length > 0 && !saving;

  async function handleSave() {
    setSaving(true);
    try {
      await createCategory({ name: name.trim(), color });
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <PageTitle>New Category</PageTitle>
      <FieldGroup>
        <FieldLabel>Name</FieldLabel>
        <TextField placeholder="e.g. Strength Training" value={name} onChangeText={setName} autoFocus />
      </FieldGroup>
      <FieldGroup>
        <FieldLabel>Color</FieldLabel>
        <ColorSwatchPicker value={color} onChange={setColor} />
      </FieldGroup>
      <Button title="Save Category" onPress={handleSave} disabled={!canSave} />
    </Screen>
  );
}
