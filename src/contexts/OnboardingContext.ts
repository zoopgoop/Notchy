import { createContext, useContext } from "react";

/** Lets screens nested deep in the nav tree (e.g. Settings) re-trigger the onboarding overlay App.tsx owns. */
export const OnboardingContext = createContext<{ replay: () => void }>({ replay: () => {} });

export function useOnboarding() {
  return useContext(OnboardingContext);
}
