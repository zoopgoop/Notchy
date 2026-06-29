import {
  adaptiveMultiplier,
  decayingStepTarget,
  deloadTarget,
  exponentialTarget,
  incrementalTarget,
  isHit,
  linearTarget,
  percentageTarget,
} from "../curves";

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

describe("decayingStepTarget", () => {
  it("applies a full step on the first session and decays thereafter", () => {
    expect(decayingStepTarget(50, 2, 0, "increasing")).toBeCloseTo(52);
    const laterStep = decayingStepTarget(50, 2, 10, "increasing") - 50;
    expect(laterStep).toBeLessThan(2);
    expect(laterStep).toBeGreaterThan(0);
  });

  it("steps downward for decreasing goals", () => {
    expect(decayingStepTarget(50, 2, 0, "decreasing")).toBeCloseTo(48);
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
    expect(adaptiveMultiplier([true, true])).toBe(1);
  });

  it("boosts when hit-rate is high", () => {
    expect(adaptiveMultiplier([true, true, true, true, false])).toBe(1.2);
  });

  it("eases when hit-rate is low", () => {
    expect(adaptiveMultiplier([false, false, false, true, false])).toBe(0.7);
  });

  it("holds steady in the middle band", () => {
    expect(adaptiveMultiplier([true, false, true, false, true, false])).toBe(1);
  });

  it("only looks at the most recent window", () => {
    const longHistory = [true, true, true, true, true, false, false, false, false, false];
    expect(adaptiveMultiplier(longHistory)).toBe(0.7);
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
