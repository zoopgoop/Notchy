import { useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../../components/ui/Button";
import { DateField, FieldGroup, FieldLabel, HintText } from "../../components/ui/FormField";
import { PageTitle, Screen } from "../../components/ui/Screen";
import { createFreezeWindow } from "../../db/repositories";
import { formatDateLocal } from "../../engine/dateUtils";
import { ManageStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<ManageStackParamList, "FreezeWindowForm">;

function oneMonthAfter(date: Date): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + 1);
  return result;
}

export function FreezeWindowFormScreen({ route, navigation }: Props) {
  const { goalId } = route.params;
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [saving, setSaving] = useState(false);

  const maxEndDate = oneMonthAfter(startDate);
  const invalidRange = formatDateLocal(endDate) < formatDateLocal(startDate);
  const tooLong = formatDateLocal(endDate) > formatDateLocal(maxEndDate);
  const canSave = !saving && !invalidRange && !tooLong;

  async function handleSave() {
    setSaving(true);
    try {
      await createFreezeWindow(goalId, formatDateLocal(startDate), formatDateLocal(endDate));
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <PageTitle>Freeze Window</PageTitle>
      <FieldGroup>
        <FieldLabel>From</FieldLabel>
        <DateField value={startDate} onChange={setStartDate} />
      </FieldGroup>
      <FieldGroup>
        <FieldLabel>To</FieldLabel>
        <DateField value={endDate} onChange={setEndDate} />
        {invalidRange && <HintText danger>End date must be on or after the start date.</HintText>}
        {!invalidRange && tooLong && (
          <HintText danger>A freeze window can't run longer than 1 month from the start date.</HintText>
        )}
      </FieldGroup>
      <HintText>
        The habit stays active but frozen during the window — no daily targets are generated, no logs
        can be taken, and it won't count against your skip limit. Capped at 1 month from the start date.
      </HintText>
      <Button title="Save Freeze Window" onPress={handleSave} disabled={!canSave} />
    </Screen>
  );
}
