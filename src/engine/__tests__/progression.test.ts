import { Habit, Goal, GoalSchedule, LoggedEntry } from "../../types";
import { computeHit, generateNextTarget } from "../progression";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "goal-1",
    habitId: "habit-1",
    startValue: 60,
    targetValue: 80,
    targetDate: "2026-01-11",
    curveType: "linear",
    adaptive: false,
    progressionMode: "static",
    step: 2,
    createdAt: "2026-01-01",
    active: true,
    ...overrides,
  };
}

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "habit-1",
    categoryId: "category-1",
    name: "Kick height",
    type: "numeric",
    direction: "increasing",
    unitLabel: "cm",
    createdAt: "2026-01-01",
    ...overrides,
  };
}

function makeSchedule(overrides: Partial<GoalSchedule> = {}): GoalSchedule[] {
  return [{ id: "schedule-1", goalId: "goal-1", effectiveDate: "2026-01-01", scheduledDays: ALL_DAYS, ...overrides }];
}

function makeEntry(overrides: Partial<LoggedEntry> = {}): LoggedEntry {
  return {
    id: "entry-1",
    goalId: "goal-1",
    date: "2026-01-05",
    actualValue: 70,
    hit: true,
    generatedTarget: 68,
    tagIds: [],
    ...overrides,
  };
}

describe("generateNextTarget", () => {
  it("bypasses the curve entirely for boolean habits", () => {
    const result = generateNextTarget(makeGoal(), makeHabit({ type: "boolean" }), makeSchedule(), [], "2026-01-06");
    expect(result).toEqual({ target: 1, reason: "boolean" });
  });

  it("computes the initial target from the goal's start/createdAt on day one", () => {
    const result = generateNextTarget(makeGoal(), makeHabit(), makeSchedule(), [], "2026-01-06");
    expect(result.reason).toBe("initial");
    expect(result.target).toBeCloseTo(70); // linear: 60 + 20*(5/10)
  });

  it("re-anchors to today's actual value after a hit, recomputing a steeper curve", () => {
    const entries = [makeEntry({ date: "2026-01-06", actualValue: 75, hit: true, generatedTarget: 70 })];
    const result = generateNextTarget(makeGoal(), makeHabit(), makeSchedule(), entries, "2026-01-07");
    expect(result.reason).toBe("advance");
    // anchor (75, day0) -> 5 periods remaining to day 11 -> 75 + 5*(1/5) = 76
    expect(result.target).toBeCloseTo(76);
  });

  it("holds the same target after a single miss", () => {
    const entries = [makeEntry({ date: "2026-01-06", actualValue: 65, hit: false, generatedTarget: 70 })];
    const result = generateNextTarget(makeGoal(), makeHabit(), makeSchedule(), entries, "2026-01-07");
    expect(result).toEqual({ target: 70, reason: "hold" });
  });

  it("deloads ~20% back toward the original start after 3 consecutive misses", () => {
    const entries = [
      makeEntry({ date: "2026-01-05", actualValue: 65, hit: false, generatedTarget: 70 }),
      makeEntry({ date: "2026-01-06", actualValue: 65, hit: false, generatedTarget: 70 }),
      makeEntry({ date: "2026-01-07", actualValue: 65, hit: false, generatedTarget: 70 }),
    ];
    const result = generateNextTarget(makeGoal(), makeHabit(), makeSchedule(), entries, "2026-01-08");
    expect(result.reason).toBe("deload");
    expect(result.target).toBeCloseTo(68); // 70 - 0.2*(70-60)
  });

  it("ignores targetDate for percentage curveType and compounds off the last value", () => {
    const goal = makeGoal({ curveType: "percentage", step: 0.02 });
    const entries = [makeEntry({ date: "2026-01-06", actualValue: 70, hit: true, generatedTarget: 68 })];
    const result = generateNextTarget(goal, makeHabit(), makeSchedule(), entries, "2026-01-07");
    expect(result.target).toBeCloseTo(71.4); // 70 * 1.02
  });

  it("boosts the rate when adaptive and recent hit-rate is high", () => {
    const goal = makeGoal({ curveType: "percentage", step: 0.02, adaptive: true });
    const history = [true, true, true, true, true].map((hit, i) =>
      makeEntry({ date: `2026-01-0${i + 1}`, hit, generatedTarget: 60 + i })
    );
    const entries = [...history, makeEntry({ date: "2026-01-06", actualValue: 70, hit: true, generatedTarget: 68 })];
    const result = generateNextTarget(goal, makeHabit(), makeSchedule(), entries, "2026-01-07");
    expect(result.target).toBeCloseTo(71.68); // 70 * (1 + 0.02*1.2)
  });

  it("clamps the generated target so it never overshoots the goal's targetValue", () => {
    const goal = makeGoal({ curveType: "percentage", step: 0.5, targetValue: 80 });
    const entries = [makeEntry({ date: "2026-01-06", actualValue: 75, hit: true, generatedTarget: 70 })];
    const result = generateNextTarget(goal, makeHabit(), makeSchedule(), entries, "2026-01-07");
    expect(result.target).toBe(80);
  });

  it("handles decreasing-direction goals symmetrically", () => {
    const goal = makeGoal({ startValue: 30, targetValue: 10, curveType: "linear" });
    const result = generateNextTarget(goal, makeHabit({ direction: "decreasing" }), makeSchedule(), [], "2026-01-06");
    expect(result.target).toBeCloseTo(20); // 30 - 20*(5/10)
  });

  it("counts only scheduled days toward pacing when the schedule is less than daily", () => {
    // Mon/Wed/Fri only -> 2026-01-01 is a Thursday, so scheduled days in (01-01, 01-11] are
    // 01-02(Fri), 01-05(Mon), 01-07(Wed), 01-09(Fri), 01-11(Sun is not scheduled) = 4 total.
    const schedule: GoalSchedule[] = [
      { id: "s1", goalId: "goal-1", effectiveDate: "2026-01-01", scheduledDays: [1, 3, 5] },
    ];
    const goal = makeGoal();
    const result = generateNextTarget(goal, makeHabit(), schedule, [], "2026-01-05");
    // periodsElapsed counts scheduled days in (01-01, 01-05] = 01-02, 01-05 = 2.
    // totalPeriods counts scheduled days in (01-01, 01-11] = 4.
    expect(result.target).toBeCloseTo(70); // 60 + 20*(2/4)
  });
});

describe("computeHit", () => {
  it("treats boolean actualValue 1 as a hit", () => {
    expect(computeHit(makeHabit({ type: "boolean" }), 1, 1)).toBe(true);
    expect(computeHit(makeHabit({ type: "boolean" }), 0, 1)).toBe(false);
  });

  it("delegates to direction-aware comparison for numeric habits", () => {
    expect(computeHit(makeHabit({ direction: "increasing" }), 80, 78)).toBe(true);
    expect(computeHit(makeHabit({ direction: "decreasing" }), 13, 12)).toBe(false);
  });
});
