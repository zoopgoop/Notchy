import { computeCloseness } from "../closeness";

describe("computeCloseness", () => {
  it("is 1.0 when an increasing goal lands exactly on target", () => {
    expect(computeCloseness("increasing", 80, 80)).toBe(1);
  });

  it("scales down below target for increasing goals", () => {
    expect(computeCloseness("increasing", 40, 80)).toBeCloseTo(0.5);
  });

  it("clamps above target to MAX_CLOSENESS rather than growing unbounded", () => {
    expect(computeCloseness("increasing", 800, 80)).toBe(1.5);
  });

  it("is 1.0 when a decreasing goal lands exactly on target", () => {
    expect(computeCloseness("decreasing", 12, 12)).toBe(1);
  });

  it("rewards beating a decreasing target (lower is better)", () => {
    expect(computeCloseness("decreasing", 6, 12)).toBe(1.5);
  });

  it("penalizes missing a decreasing target (higher is worse)", () => {
    expect(computeCloseness("decreasing", 24, 12)).toBeCloseTo(0.5);
  });

  it("never returns a negative closeness", () => {
    expect(computeCloseness("increasing", -10, 80)).toBe(0);
  });

  it("treats a zero target as undefined rather than dividing by zero", () => {
    expect(computeCloseness("increasing", 10, 0)).toBe(0);
  });
});
