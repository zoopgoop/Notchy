import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { OnboardingContext } from "./src/contexts/OnboardingContext";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { IntroScreen } from "./src/screens/onboarding/IntroScreen";
import { OnboardingScreen } from "./src/screens/onboarding/OnboardingScreen";
import { registerBackgroundNotificationTask } from "./src/services/backgroundTask";
import { configureNotifications, dismissAllActiveNotifications, requestExactAlarmPermission, requestNotificationPermissions } from "./src/services/notifications";
import { hasSeenOnboarding } from "./src/services/settings";

export default function App() {
  const [ready, setReady] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    configureNotifications()
      .then(requestNotificationPermissions)
      .then(() => requestExactAlarmPermission());
    registerBackgroundNotificationTask();
    hasSeenOnboarding().then((seen) => {
      setShowOnboarding(!seen);
      setReady(true);
    });

    // Clear all notifications whenever the user opens the app.
    dismissAllActiveNotifications();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") dismissAllActiveNotifications();
    });
    return () => sub.remove();
  }, []);

  if (!ready) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {showIntro ? (
          <IntroScreen onDone={() => setShowIntro(false)} />
        ) : (
          <OnboardingContext.Provider value={{ replay: () => setShowOnboarding(true) }}>
            {showOnboarding ? (
              <OnboardingScreen onDone={() => setShowOnboarding(false)} />
            ) : (
              <RootNavigator />
            )}
          </OnboardingContext.Provider>
        )}
        <StatusBar style="light" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
