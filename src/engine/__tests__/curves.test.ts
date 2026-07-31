import { LoggedEntry } from "../../types";
import {
  adaptiveMultiplier,
  deloadTarget,
  exponentialTarget,
  incrementalTarget,
  isHit,
  linearTarget,
  percentageTarget,
  stepTarget,
} from "../curves";

function entry(hit: boolean, actualValue: number, generatedTarget: number): LoggedEntry {
  return { id: "e", goalId: "g", date: "2026-01-01", actualValue, hit, generatedTarget, tagIds: [] };
}

describe("linearTarget", () => {
  it("interpolates start to target proportionally", () => {
    expect(linearTarget(60, 80, 5, 10)).toBeCloseTo(70);
    expect(linearTarget(60, 80, 0, 10)).toBeCloseTo(60);
    expect(linearTarget(60, 80, 10, 10)).toBeCloseTo(80);
  });

  it("clamps past the final period to exactly target", () => {
    expect(linearTarget(60, 80, 15, 10)).toBe(80);
  });

  it("handles decreasing direction via signed start/target distance", () => {
    expect(linearTarget(30, 10, 5, 10)).toBeCloseTo(20);
  });
});

describe("incrementalTarget", () => {
  it("starts at the start value and approaches target with fast-early-progress shape", () => {
    expect(incrementalTarget(60, 80, 0, 10)).toBeCloseTo(60);
    const midpoint = incrementalTarget(60, 80, 5, 10);
    const linearMidpoint = linearTarget(60, 80, 5, 10);
    expect(midpoint).toBeGreaterThan(linearMidpoint);
  });

  it("clamps to exactly target on/after the final period", () => {
    expect(incrementalTarget(60, 80, 10, 10)).toBe(80);
    expect(incrementalTarget(60, 80, 11, 10)).toBe(80);
  });
});

describe("exponentialTarget", () => {
  it("starts at the start value and approaches target with slow-early-progress shape", () => {
    expect(exponentialTarget(60, 80, 0, 10)).toBeCloseTo(60);
    const midpoint = exponentialTarget(60, 80, 5, 10);
    const linearMidpoint = linearTarget(60, 80, 5, 10);
    expect(midpoint).toBeLessThan(linearMidpoint);
  });

  it("lands exactly on target at the final period", () => {
    expect(exponentialTarget(60, 80, 10, 10)).toBeCloseTo(80);
    expect(exponentialTarget(60, 80, 11, 10)).toBe(80);
  });
});

describe("percentageTarget", () => {
  it("compounds upward for increasing goals", () => {
    expect(percentageTarget(100, 0.02, "increasing")).toBeCloseTo(102);
  });

  it("compounds downward for decreasing goals", () => {
    expect(percentageTarget(100, 0.02, "decreasing")).toBeCloseTo(98);
  });
});

describe("stepTarget", () => {
  it("applies the full step every time, regardless of session count", () => {
    expect(stepTarget(50, 2, "increasing")).toBeCloseTo(52);
    expect(stepTarget(50, 2, "increasing")).toBeCloseTo(stepTarget(50, 2, "increasing"));
  });

  it("steps downward for decreasing goals", () => {
    expect(stepTarget(50, 2, "decreasing")).toBeCloseTo(48);
  });
});

describe("isHit", () => {
  it("requires actual >= target for increasing goals", () => {
    expect(isHit("increasing", 80, 78)).toBe(true);
    expect(isHit("increasing", 77, 78)).toBe(false);
  });

  it("requires actual <= target for decreasing goals", () => {
    expect(isHit("decreasing", 10, 12)).toBe(true);
    expect(isHit("decreasing", 13, 12)).toBe(false);
  });
});

describe("adaptiveMultiplier", () => {
  it("stays neutral with too little history", () => {
    const entries = [entry(true, 10, 10), entry(true, 10, 10)];
    expect(adaptiveMultiplier(entries, "increasing")).toBe(1);
  });

  it("boosts (standard tier) when hit-rate is high but overshoot is modest", () => {
    // 4 hits exactly on target (0% overshoot) + 1 miss by half (-50%) -> avg -10%, well under the big-tier threshold.
    const entries = [
      entry(true, 10, 10),
      entry(true, 10, 10),
      entry(true, 10, 10),
      entry(true, 10, 10),
      entry(false, 5, 10),
    ];
    expect(adaptiveMultiplier(entries, "increasing")).toBe(1.2);
  });

  it("boosts (big tier) when hit-rate is high and average overshoot clears the big-overshoot threshold", () => {
    // 5/5 hits, each doubling the target (+100% overshoot) -> average 100%, clears the 50% big-tier threshold.
    const entries = [
      entry(true, 20, 10),
      entry(true, 20, 10),
      entry(true, 20, 10),
      entry(true, 20, 10),
      entry(true, 20, 10),
    ];
    expect(adaptiveMultiplier(entries, "increasing")).toBe(1.5);
  });

  it("dampens the tier when a bad miss is mixed into an otherwise-big-overshoot window", () => {
    // 4 hits at +50% overshoot each (would average exactly 50% -> big tier on their own) + 1 miss at
    // -50% pulls the whole-window average down to 30%, dropping back to the standard tier instead.
    const entries = [
      entry(true, 15, 10),
      entry(true, 15, 10),
      entry(true, 15, 10),
      entry(true, 15, 10),
      entry(false, 5, 10),
    ];
    expect(adaptiveMultiplier(entries, "increasing")).toBe(1.2);
  });

  it("is direction-aware: for a decreasing goal, coming in under target counts as overshoot", () => {
    // 5/5 hits on a decreasing goal, each landing at half the target -> +100% overshoot, same as the
    // increasing case above.
    const entries = [
      entry(true, 5, 10),
      entry(true, 5, 10),
      entry(true, 5, 10),
      entry(true, 5, 10),
      entry(true, 5, 10),
    ];
    expect(adaptiveMultiplier(entries, "decreasing")).toBe(1.5);
  });

  it("eases when hit-rate is low, regardless of overshoot", () => {
    const entries = [
      entry(false, 5, 10),
      entry(false, 5, 10),
      entry(false, 5, 10),
      entry(true, 10, 10),
      entry(false, 5, 10),
    ];
    expect(adaptiveMultiplier(entries, "increasing")).toBe(0.7);
  });

  it("holds steady in the middle band", () => {
    const entries = [entry(true, 10, 10), entry(false, 5, 10), entry(true, 10, 10), entry(false, 5, 10), entry(true, 10, 10)];
    expect(adaptiveMultiplier(entries, "increasing")).toBe(1);
  });

  it("only looks at the most recent window", () => {
    const longHistory = [
      entry(true, 10, 10),
      entry(true, 10, 10),
      entry(true, 10, 10),
      entry(true, 10, 10),
      entry(true, 10, 10),
      entry(false, 5, 10),
      entry(false, 5, 10),
      entry(false, 5, 10),
      entry(false, 5, 10),
      entry(false, 5, 10),
    ];
    expect(adaptiveMultiplier(longHistory, "increasing")).toBe(0.7);
  });
});

describe("deloadTarget", () => {
  it("eases 20% of the way back toward the anchor", () => {
    expect(deloadTarget(100, 50)).toBeCloseTo(90);
  });

  it("works symmetrically when target is below the anchor", () => {
    expect(deloadTarget(50, 100)).toBeCloseTo(60);
  });
});
