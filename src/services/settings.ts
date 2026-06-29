import { getSetting, setSetting } from "../db/repositories";

const KEY_USER_NAME = "userName";
const KEY_HAS_SEEN_ONBOARDING = "hasSeenOnboarding";
const KEY_SKIPS_ENABLED = "skipsEnabled";
const KEY_FREEZES_ENABLED = "freezesEnabled";

export async function getUserName(): Promise<string | null> {
  return getSetting(KEY_USER_NAME);
}

export async function setUserName(name: string): Promise<void> {
  await setSetting(KEY_USER_NAME, name);
}

export async function hasSeenOnboarding(): Promise<boolean> {
  return (await getSetting(KEY_HAS_SEEN_ONBOARDING)) === "true";
}

export async function setHasSeenOnboarding(seen: boolean): Promise<void> {
  await setSetting(KEY_HAS_SEEN_ONBOARDING, seen ? "true" : "false");
}

/** Both default on — these are app-wide opt-outs, not per-habit settings. */
export async function getSkipsEnabled(): Promise<boolean> {
  return (await getSetting(KEY_SKIPS_ENABLED)) !== "false";
}

export async function setSkipsEnabled(enabled: boolean): Promise<void> {
  await setSetting(KEY_SKIPS_ENABLED, enabled ? "true" : "false");
}

export async function getFreezesEnabled(): Promise<boolean> {
  return (await getSetting(KEY_FREEZES_ENABLED)) !== "false";
}

export async function setFreezesEnabled(enabled: boolean): Promise<void> {
  await setSetting(KEY_FREEZES_ENABLED, enabled ? "true" : "false");
}
