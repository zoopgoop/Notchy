"""
Wipes and repopulates a Notchy SQLite db with a varied set of test habits —
covering every card state the app can show (healthy streak, adaptive pacing,
goalless, frozen, on-ice, crisis, quota-gone, achieved). Run against a db
that's already been through the app's own migrations (schema.ts) — this
script only touches rows, never table structure.

Usage: python3 seed_test_data.py <path-to-notchy.db>
Pair with reload_test_data.sh to push the result onto a connected device.
"""
import datetime, random, uuid, sqlite3, sys

def uid():
    return str(uuid.uuid4())

DB = sys.argv[1]
conn = sqlite3.connect(DB)
c = conn.cursor()

# Anchor date for the whole dataset — keep in sync with whatever "today" is
# when you run this, or the crisis/streak/frozen scenarios won't land right.
TODAY = "2026-07-24"

# This script only touches rows, not schema — but a device db that's been recycled
# through many pull/edit/push cycles (rather than a real app cold start) can lag behind
# the app's own migrations in schema.ts, since those only run once at native startup.
# Patch known-missing columns here rather than fail on a column that the *code* has
# expected for a while now.
try:
    c.execute("ALTER TABLE habits ADD COLUMN description TEXT")
except sqlite3.OperationalError:
    pass  # already there

def iso(date, h=8, m=0):
    return f"{date}T{h:02d}:{m:02d}:00.000Z"

TABLES_TO_CLEAR = [
    "entry_tags", "logged_entries", "skip_logs", "freeze_windows", "streaks",
    "celebrations", "goal_notification_times", "goal_schedules", "goals",
    "habits", "categories", "achievements",
]
for t in TABLES_TO_CLEAR:
    c.execute(f"DELETE FROM {t}")

cats = {
    "Reading": "#4CAF50",
    "Wellness": "#26A69A",
    "Music": "#9C6ADE",
    "Education": "#FFB74D",
}
cat_ids = {}
for name, color in cats.items():
    cid = uid()
    cat_ids[name] = cid
    c.execute("INSERT INTO categories (id, name, color, created_at) VALUES (?,?,?,?)",
              (cid, name, color, iso("2026-06-01")))

def add_habit(name, type_, category, direction=None, unit=None, created_at="2026-07-01", description=None):
    hid = uid()
    c.execute(
        "INSERT INTO habits (id, category_id, name, type, direction, unit_label, created_at, description) VALUES (?,?,?,?,?,?,?,?)",
        (hid, cat_ids.get(category) if category else None, name, type_, direction, unit, iso(created_at), description),
    )
    return hid

def add_goal(habit_id, start, target, target_date, curve, progression, step, created_at,
             adaptive=0, achieved_at=None, on_ice=0):
    gid = uid()
    c.execute(
        """INSERT INTO goals (id, habit_id, start_value, target_value, target_date, curve_type,
           adaptive, progression_mode, step, achieved_at, created_at, active, notify_off_schedule, on_ice, restarted_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,1,1,?,NULL)""",
        (gid, habit_id, start, target, target_date, curve, adaptive, progression, step,
         achieved_at, iso(created_at), on_ice),
    )
    return gid

def add_schedule(goal_id, effective_date, days):
    c.execute("INSERT INTO goal_schedules (id, goal_id, effective_date, scheduled_days) VALUES (?,?,?,?)",
              (uid(), goal_id, effective_date, ",".join(str(d) for d in days)))

def add_entry(goal_id, date, actual, hit, target):
    c.execute(
        "INSERT INTO logged_entries (id, goal_id, date, actual_value, hit, generated_target) VALUES (?,?,?,?,?,?)",
        (uid(), goal_id, date, actual, 1 if hit else 0, target),
    )

def add_skip(goal_id, date):
    c.execute("INSERT INTO skip_logs (id, goal_id, date) VALUES (?,?,?)", (uid(), goal_id, date))

def add_freeze(goal_id, start, end):
    c.execute("INSERT INTO freeze_windows (id, goal_id, start_date, end_date) VALUES (?,?,?,?)",
              (uid(), goal_id, start, end))

def set_streak(goal_id, current, longest):
    c.execute("INSERT INTO streaks (goal_id, current, longest) VALUES (?,?,?)", (goal_id, current, longest))

DAILY = [0, 1, 2, 3, 4, 5, 6]
WEEKDAYS = [1, 2, 3, 4, 5]

# 1. Reading — healthy 10-day streak, boolean, daily
h = add_habit("Reading", "boolean", "Reading", created_at="2026-07-09",
              description="At least 10 pages a night — helps me wind down before bed instead of scrolling.")
g = add_goal(h, 0, 1, None, "linear", "static", 1, "2026-07-09")
add_schedule(g, "2026-07-09", DAILY)
for d in range(14, 24):
    add_entry(g, f"2026-07-{d:02d}", 1, True, 1)
set_streak(g, 10, 10)

# 2. Water Intake — numeric, date-driven, increasing, 13 days of history (>7, so the
# chart's 7D/2W/30D/All range picker actually has something to show off).
h = add_habit("Water Intake", "numeric", "Wellness", direction="increasing", unit="glasses", created_at="2026-07-10",
              description="Doctor recommended 2.5L/day minimum after the kidney stone scare.")
g = add_goal(h, 4, 10, "2026-08-03", "linear", "static", 1, "2026-07-10")
add_schedule(g, "2026-07-10", DAILY)
add_entry(g, "2026-07-11", 4, True, 4)
add_entry(g, "2026-07-12", 4, True, 4)
add_entry(g, "2026-07-13", 5, True, 5)
add_entry(g, "2026-07-14", 4, False, 5)
add_entry(g, "2026-07-15", 5, True, 5)
add_entry(g, "2026-07-16", 6, True, 5)
add_entry(g, "2026-07-17", 5, False, 6)
add_entry(g, "2026-07-18", 6, True, 6)
add_entry(g, "2026-07-19", 6, True, 6)
add_entry(g, "2026-07-20", 7, True, 6)
add_entry(g, "2026-07-21", 6, False, 7)
add_entry(g, "2026-07-22", 7, True, 7)
add_entry(g, "2026-07-23", 8, True, 7)
set_streak(g, 13, 13)

# 3. Guitar Practice — numeric, open-ended, adaptive pacing. Properly re-simulates the real
# engine's adaptiveMultiplier (curves.ts) session by session, rather than hand-authoring a
# few plausible-looking numbers, so the target's slope actually demonstrates the mechanic:
# a hot streak (>=80% hit rate over the trailing 5 entries) boosts the step 1.2x, a cold
# streak (<=30%) eases it 0.7x. Three back-to-back phases — hot, cold, hot again — put both
# directions on the same chart instead of just one.
h = add_habit("Guitar Practice", "numeric", "Music", direction="increasing", unit="min", created_at="2026-06-15",
              description="Working through the CAGED system. 20 min minimum of focused practice, not noodling.")
g = add_goal(h, 10, None, None, "linear", "static", 3, "2026-06-15", adaptive=1)
add_schedule(g, "2026-06-15", WEEKDAYS)
random.seed(11)
_gp_start, _gp_step = 10, 3
_d = datetime.date(2026, 6, 15)
_end = datetime.date(2026, 7, 23)
_target = _gp_start
_hits_hist = []
_i = 0
while _d <= _end:
    if _d.isoweekday() <= 5:
        # Phase A (sessions 0-8): a hot streak, sustained long enough to pull the trailing
        # window's hit rate above the 0.8 boost threshold. Phase B (9-18): misses roughly
        # two out of three sessions — spaced so no 3 land in a row (that's deload's own
        # trigger, a separate mechanic) but still enough to pull the window below the 0.3
        # ease threshold. Phase C (19+): recovery back into a hot streak.
        _want_hit = _i < 9 or _i >= 19 or _i % 3 == 0
        _window = _hits_hist[-5:]
        _rate = sum(_window) / len(_window) if len(_window) >= 3 else None
        _mult = 1.2 if _rate is not None and _rate >= 0.8 else 0.7 if _rate is not None and _rate <= 0.3 else 1.0
        _actual = _target if _i == 0 else _target + (random.randint(0, 2) if _want_hit else -random.randint(1, 3))
        _hit = _actual >= _target
        add_entry(g, _d.isoformat(), _actual, _hit, _target)
        _hits_hist.append(_hit)
        if _hit:
            _target = round(_actual + _gp_step * _mult)
        _i += 1
    _d += datetime.timedelta(days=1)
set_streak(g, 5, 5)

# 4. Meditation — goalless habit (no goal row at all)
add_habit("Meditation", "boolean", "Wellness", created_at="2026-07-20")

# 5. Cold Shower — frozen today
h = add_habit("Cold Shower", "boolean", "Wellness", created_at="2026-07-04")
g = add_goal(h, 0, 1, None, "linear", "static", 1, "2026-07-04")
add_schedule(g, "2026-07-04", DAILY)
for d in range(14, 19):
    add_entry(g, f"2026-07-{d:02d}", 1, True, 1)
add_skip(g, "2026-07-19")
add_freeze(g, "2026-07-22", "2026-07-27")
set_streak(g, 5, 5)

# 6. Journaling — quota gone / lost streak (long stale gap, uncategorized)
h = add_habit("Journaling", "boolean", None, created_at="2026-05-01")
g = add_goal(h, 0, 1, None, "linear", "static", 1, "2026-05-01")
add_schedule(g, "2026-05-01", DAILY)
for d in range(1, 23):
    add_entry(g, f"2026-06-{d:02d}", 1, True, 1)
set_streak(g, 0, 22)

# 7. Yoga — on ice (dismissed lost-streak prompt)
h = add_habit("Yoga", "boolean", "Wellness", created_at="2026-07-01")
g = add_goal(h, 0, 1, None, "linear", "static", 1, "2026-07-01", on_ice=1)
add_schedule(g, "2026-07-01", DAILY)
for d in range(1, 6):
    add_entry(g, f"2026-07-{d:02d}", 1, True, 1)
set_streak(g, 0, 5)

# 8. Spanish Vocabulary — achieved goal
h = add_habit("Spanish Vocabulary", "numeric", "Education", direction="increasing", unit="words", created_at="2026-06-01")
g = add_goal(h, 0, 100, "2026-07-20", "linear", "static", 5, "2026-06-01", achieved_at=iso("2026-07-18", 9, 0))
add_schedule(g, "2026-06-01", DAILY)
add_entry(g, "2026-07-10", 60, True, 55)
add_entry(g, "2026-07-14", 85, True, 80)
add_entry(g, "2026-07-18", 100, True, 95)
set_streak(g, 0, 8)

# 9. Screen Time — a real target (180 -> 60 min) rather than open-ended, so this reads as
# an actual goal someone's working toward. Logged through yesterday (7/23) with no gap, so
# every range — 7D included — has real data to show; the crisis scenario lives on its own
# dedicated habit below instead of competing with this one for "enough recent data to plot".
#
# The historical target trajectory is generated by actually re-simulating the real engine's
# own step-paced rules (generateNextTarget/stepTarget in progression.ts/curves.ts) session by
# session — a hit advances the target by `step`, a miss holds it flat, three misses in a row
# trigger a 20% deload back toward the start value — rather than hand-authoring an arbitrary
# curve. That keeps the dashed historical "Target" line and the live app's own forward
# projection mathematically the same process instead of two disconnected numbers that happen
# to look similar. `step` is deliberately small (2.5) so ~39 noisy sessions land in the
# mid-70s — comfortably short of the true 60 goal, since achievement is only ever detected as
# a side effect of a live logGoalEntry() call, never from these raw seed rows.
random.seed(7)
h = add_habit("Screen Time", "numeric", "Wellness", direction="decreasing", unit="min", created_at="2026-06-01")
g = add_goal(h, 180, 60, None, "linear", "static", 2.5, "2026-06-01")
add_schedule(g, "2026-06-01", WEEKDAYS)
_start, _step, _deload_frac = 180, 2.5, 0.2
_d = datetime.date(2026, 6, 1)
_end = datetime.date(2026, 7, 23)
_target = _start
_misses_in_row = 0
_i = 0
while _d <= _end:
    if _d.isoweekday() <= 5:  # Mon-Fri only, matching WEEKDAYS
        _rough_patch = 13 <= _i <= 19  # a bad week or so, roughly mid-June
        _noise = random.randint(-3, 9 if _rough_patch else 4)
        _actual = _target + _noise
        _hit = _actual <= _target
        add_entry(g, _d.isoformat(), _actual, _hit, _target)
        if _hit:
            _target = round(_actual - _step)
            _misses_in_row = 0
        else:
            _misses_in_row += 1
            if _misses_in_row >= 3:
                _target = round(_target - _deload_frac * (_target - _start))
                _misses_in_row = 0
        _i += 1
    _d += datetime.timedelta(days=1)
set_streak(g, 12, 12)

# 9b. Late Night Phone Use — the crisis habit (streak at stake, weekly quota now
# unreachable). Kept separate from Screen Time so the crisis's necessarily-sparse recent
# week doesn't leave the "flagship" chart-picker demo habit looking empty on 7D.
h = add_habit("Late Night Phone Use", "numeric", "Wellness", direction="decreasing", unit="min", created_at="2026-06-15")
g = add_goal(h, 90, None, None, "linear", "static", 5, "2026-06-15")
add_schedule(g, "2026-06-15", WEEKDAYS)
add_entry(g, "2026-07-20", 70, True, 75)
# Nothing logged 7/21-7/24 on purpose — only 1 check-in so far this Monday-start week
# against a 5-day quota with 3 days left (Fri/Sat/Sun), which is what actually makes the
# crisis math trigger.
set_streak(g, 6, 9)

# 10. Cycling Distance — numeric, logged for two weeks then stopped three weeks ago.
# Nothing in the last 7 or 14 days, so those tabs shouldn't even be offered — only 30D
# and All should show up, defaulting straight to 30D.
h = add_habit("Cycling Distance", "numeric", None, direction="increasing", unit="km", created_at="2026-06-10")
g = add_goal(h, 5, None, None, "linear", "static", 1, "2026-06-10")
add_schedule(g, "2026-06-10", [2, 4, 6])
add_entry(g, "2026-06-11", 5, True, 5)
add_entry(g, "2026-06-13", 6, True, 6)
add_entry(g, "2026-06-15", 6, False, 7)
add_entry(g, "2026-06-18", 8, True, 7)
add_entry(g, "2026-06-20", 8, True, 8)
add_entry(g, "2026-06-22", 9, True, 8)
set_streak(g, 0, 6)

# 11. Pushups — numeric, open-ended, a couple of real hand-logged days to poke at
h = add_habit("Pushups", "numeric", None, direction="increasing", unit="reps", created_at="2026-07-24")
g = add_goal(h, 5, 100, None, "linear", "static", 5, "2026-07-24")
add_schedule(g, "2026-07-24", [1, 3, 5])

conn.commit()
conn.close()
print("seed complete:", DB)
