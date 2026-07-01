# Notchy

A habit-tracking Android app built with Expo / React Native. Notchy is built around the idea that showing up consistently matters more than hitting a precise number every day — so the streak system rewards weekly check-in counts, not specific days, letting you log on whichever days suit you.

## Features

- **Habit management** — create habits grouped by colour-coded categories, set active/inactive, long-press to manage
- **Smart progression curves** — daily targets follow linear, incremental (ease-out), or exponential (ease-in) curves toward a goal value and date; adaptive mode watches your last 7 entries and nudges the pace up or down accordingly
- **Weekly quota streaks** — the streak tracks whether you hit your scheduled check-in count each week, not whether you logged on specific days; first and last partial weeks are pro-rated automatically
- **Skips** — a limited skip allowance (scales with your schedule density) lets you take a planned rest without breaking a streak
- **Freeze windows** — pause a habit for a date range without it counting against you
- **Per-habit per-day notification times** — configure the morning reminder time independently for each day of the week, per habit; end-of-day countdown notifications fire at 10:30, 11:00, and 11:30 pm for anything still pending
- **Progress chart** — actual vs daily target over time, with a projected future arc that updates as the goal or adaptive system changes
- **Calendar views** — month-grid calendar (category-coloured dots) with tap-to-expand detail; per-habit boolean calendar showing logged (green) and skipped (grey) days
- **Celebrations** — milestone and streak achievements trigger animated overlays with a chime sound
- **Onboarding** — animated intro screen and a short walkthrough on first launch

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Expo SDK 56 / React Native 0.85.3 (New Architecture) |
| Navigation | React Navigation v7 (bottom tabs + native stacks) |
| Database | expo-sqlite with migration-based schema (append-only) |
| Notifications | expo-notifications (DATE trigger, cancel-and-reschedule pattern) |
| Charts | react-native-svg (hand-rolled SVG, no chart library) |
| Date math | date-fns v4 |
| Background tasks | expo-background-task + expo-task-manager |

## Project structure

```
src/
  db/           SQLite client, schema migrations, mappers, repositories
  engine/       Pure business logic — curves, progression, schedule, date utils
  services/     Orchestration layer — daily goals, notifications, calendar, streaks
  hooks/        React hooks that wire services to component state
  screens/      All UI screens, grouped by nav stack
  components/   Shared UI components and charts
  navigation/   Navigator definitions and typed param lists
  theme/        Colours, shadows, spacing tokens
  types/        Core domain interfaces
  utils/        Pure utility functions (formatting, closeness, momentum)
assets/
  sounds/       ding.wav — ascending C-E-G chime played on celebrations
```

## Building

Requires Android Studio with NDK 27.1.12297006, and JDK 21 (use Android Studio's bundled JBR — system JDK 25 breaks CMake builds).

```bash
# Install dependencies
npm install

# Development build (with Metro dev server)
JAVA_HOME=/opt/android-studio/jbr npx expo run:android

# Release APK (all ABIs, debug-signed)
cd android && JAVA_HOME=/opt/android-studio/jbr ./gradlew assembleRelease
# Output: android/app/build/outputs/apk/release/app-release.apk

# Install on a connected device
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

If the app shows a blank screen after connecting via USB, re-run:
```bash
adb reverse tcp:8081 tcp:8081
```

## How the streak system works

Scheduled days are reminder triggers only — they determine when you get a morning notification, not whether a particular day is a deadline. What keeps a streak alive is hitting the weekly check-in **count** across any days you choose.

- A week's required count is the number of scheduled days that fall within the week **and** within the habit's active period (pro-rated for the first and last partial weeks)
- Freeze windows and skips can cover gaps without breaking the streak
- The streak resets when a completed week ends short of its quota
- The current (in-progress) week is never judged early

## Progression engine

Each goal has a `curveType` (linear / incremental / exponential / percentage) and optional `targetValue` + `targetDate`. The engine computes a daily target based on:

1. How many scheduled sessions have elapsed since the last "anchor" (the most recent logged hit, or the goal's start)
2. The adaptive multiplier — if hit-rate over the last 7 entries is ≥ 80%, pace goes up 20%; if ≤ 30%, it eases back 30%
3. Three consecutive misses trigger a deload (target steps back ~20% toward start value)

For open-ended habits (no target date or value), a decaying-step recurrence runs indefinitely.
