import { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { FieldGroup, FieldLabel, HintText } from "../../components/ui/FormField";
import { PageTitle, Screen } from "../../components/ui/Screen";
import { useOnboarding } from "../../contexts/OnboardingContext";
import { exportAllData } from "../../services/dataExport";
import { importAllData } from "../../services/dataImport";
import {
  getFreezesEnabled,
  getSkipsEnabled,
  setFreezesEnabled,
  setSkipsEnabled,
} from "../../services/settings";
import { theme } from "../../theme";

export function SettingsScreen() {
  const { replay } = useOnboarding();
  const [exporting, setExporting] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);
  const [skipsEnabled, setSkipsEnabledState] = useState(true);
  const [freezesEnabled, setFreezesEnabledState] = useState(true);
  const [confirmImport, setConfirmImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSucceeded, setImportSucceeded] = useState(false);

  useEffect(() => {
    getSkipsEnabled().then(setSkipsEnabledState);
    getFreezesEnabled().then(setFreezesEnabledState);
  }, []);

  async function handleExport() {
    setExporting(true);
    try {
      await exportAllData();
    } catch {
      setExportFailed(true);
    } finally {
      setExporting(false);
    }
  }

  async function handleImport() {
    setConfirmImport(false);
    setImporting(true);
    try {
      const result = await importAllData();
      if (result.kind === "success") setImportSucceeded(true);
      if (result.kind === "error") setImportError(result.message);
    } catch {
      setImportError("Something went wrong reading that backup file.");
    } finally {
      setImporting(false);
    }
  }

  async function handleToggleSkips(value: boolean) {
    setSkipsEnabledState(value);
    await setSkipsEnabled(value);
  }

  async function handleToggleFreezes(value: boolean) {
    setFreezesEnabledState(value);
    await setFreezesEnabled(value);
  }

  return (
    <Screen>
      <PageTitle subtitle="Reminders, backups, and the walkthrough.">Settings</PageTitle>

      <FieldGroup>
        <HintText>
          Reminders run automatically from 10:30pm if anything's still pending — at 10:30pm, 11pm,
          11:30pm, and 11:50pm — no setup needed.
        </HintText>
      </FieldGroup>

      <FieldGroup>
        <View style={styles.switchRow}>
          <FieldLabel>Allow Skips</FieldLabel>
          <Switch value={skipsEnabled} onValueChange={handleToggleSkips} />
        </View>
        <HintText>Turning this off removes the Skip button everywhere — no more free passes.</HintText>
      </FieldGroup>

      <FieldGroup>
        <View style={styles.switchRow}>
          <FieldLabel>Allow Freeze Windows</FieldLabel>
          <Switch value={freezesEnabled} onValueChange={handleToggleFreezes} />
        </View>
        <HintText>Turning this off removes the option to freeze a habit for travel, illness, etc.</HintText>
      </FieldGroup>

      <FieldGroup>
        <Button title="Export Data" variant="secondary" onPress={handleExport} disabled={exporting} />
        <HintText>Shares a full backup of your database — every category, habit, goal, and logged entry.</HintText>
      </FieldGroup>

      <FieldGroup>
        <Button
          title="Import Data"
          variant="secondary"
          onPress={() => setConfirmImport(true)}
          disabled={importing}
        />
        <HintText>
          Restores from a backup file — useful when switching devices. This replaces everything currently
          on this device.
        </HintText>
      </FieldGroup>

      <FieldGroup>
        <Button title="Replay Walkthrough" variant="secondary" onPress={replay} />
      </FieldGroup>

      <Text style={styles.footer}>Notchy</Text>

      <ConfirmDialog
        visible={exportFailed}
        title="Export failed"
        message="Something went wrong putting your data together."
        confirmLabel="OK"
        onConfirm={() => setExportFailed(false)}
      />

      <ConfirmDialog
        visible={confirmImport}
        title="Import data?"
        message="This replaces everything currently on this device with the contents of the backup file you choose. This can't be undone."
        destructive
        confirmLabel="Choose File"
        onConfirm={handleImport}
        onCancel={() => setConfirmImport(false)}
      />

      <ConfirmDialog
        visible={importError !== null}
        title="Import failed"
        message={importError ?? ""}
        confirmLabel="OK"
        onConfirm={() => setImportError(null)}
      />

      <ConfirmDialog
        visible={importSucceeded}
        title="Import complete"
        message="Your data has been restored. Close and reopen Notchy for the changes to take effect."
        confirmLabel="OK"
        onConfirm={() => setImportSucceeded(false)}
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
  footer: {
    color: theme.textMuted,
    fontSize: 13,
    marginTop: 12,
    textAlign: "center",
  },
});
