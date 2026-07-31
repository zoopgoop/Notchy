# Notchy

A habit-tracking Android app built with Expo / React Native. Notchy was an app built to solve a personal problem, I wanted an app that rewards progress not just a flat yes no log. No habit tracking app I found rewarded both showing with a streak as well as hitting a target and reaching a goal. This app does both.

## Features

- **Habit management** — create habits grouped by colour-coded categories, set active/inactive, long-press to manage; each habit can carry a free-text description (why it matters, technique cues) editable anytime
- **Smart progression curves** — daily targets follow linear, incremental (ease-out), or exponential (ease-in) curves toward a goal value and date, or a fixed step each hit for open-ended goals; adaptive mode watches your last 5 entries and nudges the pace up or down accordingly. The habit detail screen shows the effective step (base value plus whatever adaptive is currently doing to it) and lets you toggle adaptive pacing inline
- **Multi-range progress chart** — Current (dots, hit/miss colour, live projection, and a tappable goal marker), 7D/2W/30D trend lines (offered once they'd show something new), and All — one toggle, five peer views
- **Weekly quota streaks** — the streak tracks whether you hit your scheduled check-in count each week (weeks run Monday–Sunday), not whether you logged on specific days; first and last partial weeks are pro-rated automatically
- **Skips** — a limited skip allowance (scales with your schedule density) lets you take a planned rest without breaking a streak
- **Freeze windows** — pause a habit for a date range without it counting against you
- **Per-habit per-day notification times** — configure the morning reminder time independently for each day of the week, per habit; end-of-day countdown notifications fire at 10:30pm, 11pm, 11:30pm, and 11:50pm for anything still pending
- **Calendar views** — month-grid calendar (category-coloured dots, Monday-first) with tap-to-expand detail; per-habit boolean calendar showing logged (green) and skipped (grey) days, with weekday headers and day numbers
- **Achievements** — a Trophy Case of badges (streaks, variety, consistency, and more) that unlock automatically as you use the app
- **Celebrations** — milestone and streak achievements trigger animated overlays with a chime sound
- **Backup / restore** — Export Data shares a raw copy of the on-device database; Import Data restores from one, for moving to a new device or just keeping a safety net
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
  contexts/     React context providers (onboarding state)
  screens/      All UI screens, grouped by nav stack
  components/   Shared UI components and charts
  navigation/   Navigator definitions and typed param lists
  theme/        Colours, shadows, spacing tokens
  types/        Core domain interfaces
  utils/        Pure utility functions (formatting, closeness, momentum)
assets/
  sounds/       ding.wav (inline celebration chime), fanfare.wav (full-screen celebration)
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

Scheduled days are reminder triggers only — they determine when you get a morning notification, not whether a particular day is a deadline. What keeps a streak alive is hitting the weekly check-in **count** across any days you choose. Weeks are Monday–Sunday throughout — schedule effective-dates, weekly tallies, and every day-of-week picker/label all anchor to Monday.

- A week's required count is the number of scheduled days that fall within the week **and** within the habit's active period (pro-rated for the first and last partial weeks)
- Freeze windows and skips can cover gaps without breaking the streak
- A week that simply runs its course is only ever judged once it's actually over — never mid-week
- The exception is a **crisis**: the moment a week's quota becomes mathematically unreachable, the app acts immediately instead of waiting for the week to end — if enough skips remain, they're spent automatically to cover it; if not, the streak is forfeited right then, with the usual "start again" / "adjust habit" options offered afterward

## Progression engine

Each goal has a `curveType` (linear / incremental / exponential / percentage) and optional `targetValue` + `targetDate`. The engine computes a daily target based on:

1. How many scheduled sessions have elapsed since the last "anchor" (the most recent logged hit, or the goal's start)
2. The adaptive multiplier — if hit-rate over the last 5 entries is ≥ 80%, pace goes up 20%; if ≤ 40%, it eases back 30%
3. Three consecutive misses trigger a deload (target steps back ~20% toward start value)

For open-ended habits (no target date), the target moves by a fixed step each hit — only the user (editing the step) or the adaptive multiplier can change it. Its live projection simulates a bounded number of future sessions forward (assuming hits) — the full distance to an actual target value if one exists, otherwise a short fixed preview — so the chart's projected line stays close to one real session per visual point instead of several averaged together.

## License

[PolyForm Noncommercial 1.0.0](LICENSE) — free to use, study, modify, and share for any noncommercial purpose. Commercial use (including republishing a build of this app) requires the author's permission.
