import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../../components/ui/Button";
import { FieldLabel } from "../../components/ui/FormField";
import { TextField } from "../../components/ui/FormField";
import { setFreezesEnabled, setHasSeenOnboarding, setSkipsEnabled, setUserName } from "../../services/settings";
import { theme } from "../../theme";

const INFO_STEPS = [
  {
    title: "Habits and goals are different things",
    body: "A habit is the thing you keep doing — log it and watch your streak grow for as long as you like. A goal is optional: give it a target value or date and we'll work out exactly what to hit each day to get there. No target? Run it open-ended on streaks and daily targets alone, no finish line required.",
  },
  {
    title: "Scheduled days are just reminders",
    body: "Pick which days you want to be reminded on — but what actually keeps your streak alive is getting that many check-ins in somewhere across the week, on whichever days suit you. Missing a specific scheduled day doesn't matter as long as the week's total comes in. Hitting the exact daily target doesn't matter either — showing up is what counts.",
  },
  {
    title: "Protect your streak the right way",
    body: "If the week's getting tight, we'll nudge you before it's too late, and offer to spend a skip to bail you out if you've got one spare. Skips and freeze windows are the sanctioned ways to protect a streak — deactivating a habit isn't. Set a goal and it's locked in until you hit it or its date passes; reaching it lets you adjust and keep the streak going, or call it complete and add it to your collection.",
  },
  {
    title: "Managing a habit",
    body: "Press and hold any habit — on Home or the Habits tab — to view its details, add a freeze window, or deactivate it. Deactivating doesn't delete anything, and you can reactivate from the same menu anytime.",
  },
];

const NAME_STEP = 0;
const SETTINGS_STEP = INFO_STEPS.length + 1;
const TOTAL_STEPS = INFO_STEPS.length + 2;

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [skipsEnabled, setSkipsEnabledState] = useState(true);
  const [freezesEnabled, setFreezesEnabledState] = useState(true);

  async function finish() {
    await setHasSeenOnboarding(true);
    if (name.trim()) {
      await setUserName(name.trim());
    }
    await setSkipsEnabled(skipsEnabled);
    await setFreezesEnabled(freezesEnabled);
    onDone();
  }

  function next() {
    if (step === TOTAL_STEPS - 1) {
      finish();
    } else {
      setStep((s) => s + 1);
    }
  }

  const isNameStep = step === NAME_STEP;
  const isSettingsStep = step === SETTINGS_STEP;
  const info = !isNameStep && !isSettingsStep ? INFO_STEPS[step - 1] : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <Pressable style={styles.skip} onPress={finish}>
        <Text style={styles.skipText}>Skip</Text>
      </Pressable>

      <View style={styles.content}>
        {isNameStep && (
          <>
            <Text style={styles.title}>Welcome to Notchy</Text>
            <Text style={styles.body}>What should we call you?</Text>
            <TextField
              placeholder="Your name (optional)"
              value={name}
              onChangeText={setName}
              autoFocus
              style={styles.nameInput}
            />
          </>
        )}
        {info && (
          <>
            <Text style={styles.title}>{info.title}</Text>
            <Text style={styles.body}>{info.body}</Text>
          </>
        )}
        {isSettingsStep && (
          <>
            <Text style={styles.title}>Set your guardrails</Text>
            <Text style={styles.body}>
              Skips and freeze windows protect your streak through rest days, travel, or illness. You
              can turn either off if you'd rather rely on willpower alone — change this anytime in
              Settings.
            </Text>
            <View style={styles.switchRow}>
              <FieldLabel>Allow Skips</FieldLabel>
              <Switch value={skipsEnabled} onValueChange={setSkipsEnabledState} />
            </View>
            <View style={styles.switchRow}>
              <FieldLabel>Allow Freeze Windows</FieldLabel>
              <Switch value={freezesEnabled} onValueChange={setFreezesEnabledState} />
            </View>
          </>
        )}
      </View>

      <View style={styles.dots}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.footer}>
        {step > 0 && (
          <View style={styles.footerButton}>
            <Button title="Back" variant="secondary" onPress={() => setStep((s) => s - 1)} />
          </View>
        )}
        <View style={styles.footerButton}>
          <Button title={step === TOTAL_STEPS - 1 ? "Get Started" : "Next"} onPress={next} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.background,
    flex: 1,
    paddingHorizontal: 24,
  },
  skip: {
    alignSelf: "flex-end",
    padding: 8,
  },
  skipText: {
    color: theme.textMuted,
    fontSize: 15,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    justifyContent: "center",
  },
  title: {
    color: theme.text,
    fontSize: 26,
    fontWeight: "800",
    marginBottom: 16,
  },
  body: {
    color: theme.textMuted,
    fontSize: 16,
    lineHeight: 24,
  },
  nameInput: {
    marginTop: 20,
  },
  switchRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
  },
  dots: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginBottom: 24,
  },
  dot: {
    backgroundColor: theme.border,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  dotActive: {
    backgroundColor: theme.primary,
  },
  footer: {
    flexDirection: "row",
    gap: 12,
  },
  footerButton: {
    flex: 1,
  },
});
