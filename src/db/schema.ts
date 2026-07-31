/**
 * Migrations are applied in order and tracked via PRAGMA user_version.
 * Never edit a migration that has shipped — append a new one instead.
 */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE categories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE exercises (
    id TEXT PRIMARY KEY NOT NULL,
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    direction TEXT,
    unit_label TEXT
  );
  CREATE INDEX idx_exercises_category ON exercises(category_id);

  CREATE TABLE goals (
    id TEXT PRIMARY KEY NOT NULL,
    exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    start_value REAL NOT NULL,
    target_value REAL NOT NULL,
    target_date TEXT,
    curve_type TEXT NOT NULL,
    adaptive INTEGER NOT NULL DEFAULT 0,
    progression_mode TEXT NOT NULL,
    cadence TEXT NOT NULL,
    step REAL NOT NULL,
    frequency_per_week INTEGER NOT NULL,
    weekly_skip_limit INTEGER NOT NULL DEFAULT 2,
    is_stretch INTEGER NOT NULL DEFAULT 0,
    parent_goal_id TEXT REFERENCES goals(id),
    achieved_at TEXT,
    created_at TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX idx_goals_exercise ON goals(exercise_id);
  CREATE INDEX idx_goals_parent ON goals(parent_goal_id);

  CREATE TABLE logged_entries (
    id TEXT PRIMARY KEY NOT NULL,
    goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    actual_value REAL,
    hit INTEGER NOT NULL,
    generated_target REAL NOT NULL,
    UNIQUE(goal_id, date)
  );
  CREATE INDEX idx_entries_goal_date ON logged_entries(goal_id, date);

  CREATE TABLE exercise_sets (
    id TEXT PRIMARY KEY NOT NULL,
    entry_id TEXT NOT NULL REFERENCES logged_entries(id) ON DELETE CASCADE,
    reps INTEGER NOT NULL,
    weight REAL NOT NULL,
    set_order INTEGER NOT NULL
  );
  CREATE INDEX idx_sets_entry ON exercise_sets(entry_id);

  CREATE TABLE tags (
    id TEXT PRIMARY KEY NOT NULL,
    label TEXT NOT NULL,
    is_built_in INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE entry_tags (
    entry_id TEXT NOT NULL REFERENCES logged_entries(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (entry_id, tag_id)
  );

  CREATE TABLE skip_logs (
    id TEXT PRIMARY KEY NOT NULL,
    goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    UNIQUE(goal_id, date)
  );
  CREATE INDEX idx_skips_goal_date ON skip_logs(goal_id, date);

  CREATE TABLE freeze_windows (
    id TEXT PRIMARY KEY NOT NULL,
    goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL
  );
  CREATE INDEX idx_freezes_goal ON freeze_windows(goal_id);

  CREATE TABLE celebrations (
    id TEXT PRIMARY KEY NOT NULL,
    goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    date TEXT NOT NULL,
    metadata TEXT
  );
  CREATE INDEX idx_celebrations_goal ON celebrations(goal_id);

  CREATE TABLE streaks (
    goal_id TEXT PRIMARY KEY NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    current INTEGER NOT NULL DEFAULT 0,
    longest INTEGER NOT NULL DEFAULT 0
  );
  `,
  `
  ALTER TABLE exercises ADD COLUMN log_method TEXT;
  `,
  `
  -- Category becomes optional: rebuild the table since SQLite can't drop a NOT NULL
  -- or change a foreign key's ON DELETE behavior via plain ALTER TABLE. Deleting a
  -- category now uncategorizes its exercises (SET NULL) instead of cascading the
  -- delete through to their goals and history.
  CREATE TABLE exercises_new (
    id TEXT PRIMARY KEY NOT NULL,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    direction TEXT,
    unit_label TEXT,
    log_method TEXT
  );
  INSERT INTO exercises_new (id, category_id, name, type, direction, unit_label, log_method)
    SELECT id, category_id, name, type, direction, unit_label, log_method FROM exercises;
  DROP TABLE exercises;
  ALTER TABLE exercises_new RENAME TO exercises;
  CREATE INDEX idx_exercises_category ON exercises(category_id);
  `,
  `
  CREATE TABLE app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
  `
  DELETE FROM tags WHERE label = 'Martial Arts' AND is_built_in = 1;
  `,
  `
  -- Exercise -> Habit rename, plus trimming columns the new scheduling system
  -- supersedes (cadence, weekly_skip_limit) or that were never read at all
  -- (frequency_per_week). Renaming the referenced table also fixes up the
  -- goals.exercise_id foreign key's target automatically.
  ALTER TABLE exercises RENAME TO habits;
  ALTER TABLE habits ADD COLUMN created_at TEXT;
  UPDATE habits SET created_at = datetime('now') WHERE created_at IS NULL;
  ALTER TABLE exercise_sets RENAME TO habit_sets;

  ALTER TABLE goals RENAME COLUMN exercise_id TO habit_id;
  ALTER TABLE goals DROP COLUMN cadence;
  ALTER TABLE goals DROP COLUMN frequency_per_week;
  ALTER TABLE goals DROP COLUMN weekly_skip_limit;

  -- Per-goal weekly schedule, time-varying: edits only apply from a future
  -- effective_date (a Monday) onward, so replaying past streak history always
  -- knows which schedule was active on a given past date.
  CREATE TABLE goal_schedules (
    id TEXT PRIMARY KEY NOT NULL,
    goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    effective_date TEXT NOT NULL,
    scheduled_days TEXT NOT NULL
  );
  CREATE INDEX idx_goal_schedules_goal ON goal_schedules(goal_id, effective_date);

  -- Backfill: every existing goal defaults to "every day", effective from creation.
  INSERT INTO goal_schedules (id, goal_id, effective_date, scheduled_days)
  SELECT lower(hex(randomblob(16))), id, date(created_at), '0,1,2,3,4,5,6' FROM goals;
  `,
  `
  -- Stretch goals are gone: achieving a goal now offers in-place editing (same
  -- goal/habit id, streak preserved) instead of spawning a linked goal, so the
  -- linkage and flag are dead weight.
  DROP INDEX idx_goals_parent;
  ALTER TABLE goals DROP COLUMN is_stretch;
  ALTER TABLE goals DROP COLUMN parent_goal_id;
  `,
  `
  -- Sets/reps logging never worked well for this app's model — dropped entirely,
  -- along with the now-pointless log_method column (everything logs direct).
  DROP TABLE habit_sets;
  ALTER TABLE habits DROP COLUMN log_method;

  -- Goals can now be "open-ended" (no target value) for step-paced habits that
  -- run purely on streak/schedule motivation with no finish line. SQLite can't
  -- relax a NOT NULL via plain ALTER TABLE, hence the rebuild (safe: foreign_keys
  -- is OFF for the duration of every migration, so this doesn't cascade-delete
  -- the tables that reference goals.id).
  CREATE TABLE goals_new (
    id TEXT PRIMARY KEY NOT NULL,
    habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    start_value REAL NOT NULL,
    target_value REAL,
    target_date TEXT,
    curve_type TEXT NOT NULL,
    adaptive INTEGER NOT NULL DEFAULT 0,
    progression_mode TEXT NOT NULL,
    step REAL NOT NULL,
    achieved_at TEXT,
    created_at TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );
  INSERT INTO goals_new (
    id, habit_id, start_value, target_value, target_date, curve_type, adaptive,
    progression_mode, step, achieved_at, created_at, active
  )
  SELECT
    id, habit_id, start_value, target_value, target_date, curve_type, adaptive,
    progression_mode, step, achieved_at, created_at, active
  FROM goals;
  DROP TABLE goals;
  ALTER TABLE goals_new RENAME TO goals;
  CREATE INDEX idx_goals_habit ON goals(habit_id);

  -- Curve rename: "diminishing" -> "incremental" (same shape, clearer name) and
  -- the old "incremental" slot is freed up for a genuinely new exponential-growth
  -- curve (slow start, accelerating finish) going forward.
  UPDATE goals SET curve_type = 'incremental' WHERE curve_type = 'diminishing';
  `,
  `
  -- Per-goal, per-weekday initial check-in reminder time. Deliberately not part of
  -- goal_schedules: reminder time doesn't affect streak fairness, so it applies
  -- immediately rather than waiting for a future effective_date.
  CREATE TABLE goal_notification_times (
    goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL,
    hour INTEGER NOT NULL,
    minute INTEGER NOT NULL,
    PRIMARY KEY (goal_id, day_of_week)
  );
  CREATE INDEX idx_goal_notification_times_goal ON goal_notification_times(goal_id);
  `,
  `
  -- Per-goal toggle: whether to send notifications on days that aren't in the scheduled
  -- day list (e.g. overdue reminders that fall on non-scheduled days). On by default.
  ALTER TABLE goals ADD COLUMN notify_off_schedule INTEGER NOT NULL DEFAULT 1;
  `,
  `
  -- Set only when the user dismisses the lost-streak/quota-gone prompt without adjusting
  -- or restarting — silences every notification for the goal indefinitely (not just for
  -- the day). Cleared the moment the user logs an entry or adjusts the goal.
  ALTER TABLE goals ADD COLUMN on_ice INTEGER NOT NULL DEFAULT 0;
  `,
  `
  -- Set when the user hits "Start Again" or "Adjust Habit" on the lost-streak/quota-gone
  -- prompt — trims this week's required check-ins down to just this date forward (see
  -- tallyWeek's effectiveStart), the same way a goal's own createdAt does for its first
  -- week. Makes the week behave like it just started instead of staying mathematically lost.
  ALTER TABLE goals ADD COLUMN restarted_at TEXT;
  `,
  `
  -- App-wide achievement badges (see services/achievements.ts's static catalog) — distinct
  -- from "celebrations", which are per-goal and fire from the log flow. Existence of a row
  -- means earned; "key" is the catalog entry's stable id, never reused.
  CREATE TABLE achievements (
    key TEXT PRIMARY KEY NOT NULL,
    earned_at TEXT NOT NULL
  );
  `,
  `
  -- Free-text notes about a habit (why it matters, technique cues, etc.) — purely
  -- descriptive, never read by any engine/streak logic, so it's editable anytime
  -- regardless of whether the goal itself is locked in.
  ALTER TABLE habits ADD COLUMN description TEXT;
  `,
  `
  -- Master on/off switch for this habit's notifications (morning reminder + evening
  -- countdown). Lives on habits, not goals — the habit is the actual task being
  -- notified about, a goal is only the optional end target layered on top of it, and
  -- notifications need to keep working for goalless habits and across a goal being
  -- replaced (achieved/restarted) too. Separate from notify_off_schedule (see next
  -- migration), which only controls whether an already-enabled reminder also fires
  -- on non-scheduled days. Defaults on.
  ALTER TABLE habits ADD COLUMN notifications_enabled INTEGER NOT NULL DEFAULT 1;
  `,
  `
  -- notify_off_schedule moves from goals to habits, for the same reason as
  -- notifications_enabled above: it's a notification preference about the habit,
  -- not progression state about a goal, so it shouldn't reset every time a goal gets
  -- replaced (achieved/restarted). Resets to the default (on) in this move — a
  -- one-time cost, not worth a data-preserving migration for a single boolean.
  ALTER TABLE goals DROP COLUMN notify_off_schedule;
  ALTER TABLE habits ADD COLUMN notify_off_schedule INTEGER NOT NULL DEFAULT 1;
  `,
  `
  -- Numeric habits have always been whole-number-only end to end (see progression.ts's
  -- clampTowardTarget). Most habits genuinely are (reps, sessions) but some naturally
  -- want a fraction (weight in kg, distance in km) — this lets a habit opt into decimal
  -- values/targets/steps instead of rounding everything to the nearest whole number.
  -- A string enum rather than a boolean so a future value kind (e.g. "time") can slot in
  -- without a rename. NULL (not a default of 'whole') for boolean habits, same as
  -- direction/unit_label — there's no number at all on a boolean habit, so "whole vs
  -- decimal" isn't just irrelevant there, it's a category error to even set it.
  ALTER TABLE habits ADD COLUMN value_kind TEXT;
  `,
];

export const BUILT_IN_TAGS = ["Tired", "Sore"];
