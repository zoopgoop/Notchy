import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { OnboardingContext } from "./src/contexts/OnboardingContext";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { IntroScreen } from "./src/screens/onboarding/IntroScreen";
import { OnboardingScreen } from "./src/screens/onboarding/OnboardingScreen";
import { registerBackgroundNotificationTask } from "./src/services/backgroundTask";
import { configureNotifications, requestNotificationPermissions } from "./src/services/notifications";
import { hasSeenOnboarding } from "./src/services/settings";

export default function App() {
  const [ready, setReady] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    configureNotifications().then(requestNotificationPermissions);
    registerBackgroundNotificationTask();
    hasSeenOnboarding().then((seen) => {
      setShowOnboarding(!seen);
      setReady(true);
    });
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
