import { LoggedEntry } from "../../types";
import { computeMomentum, shouldShowMomentum } from "../momentum";

function entry(actualValue: number, generatedTarget: number): LoggedEntry {
  return {
    id: `e-${Math.random()}`,
    goalId: "goal-1",
    date: "2026-01-01",
    actualValue,
    hit: actualValue >= generatedTarget,
    generatedTarget,
    tagIds: [],
  };
}

describe("computeMomentum", () => {
  it("reports insufficient_data with fewer than two full windows of history", () => {
    const entries = [entry(50, 100), entry(55, 100)];
    expect(computeMomentum("increasing", entries)).toBe("insufficient_data");
  });

  it("reports up when recent closeness clearly improved", () => {
    const entries = [
      entry(40, 100),
      entry(40, 100),
      entry(40, 100), // previous window: ~0.4 closeness
      entry(90, 100),
      entry(90, 100),
      entry(90, 100), // recent window: ~0.9 closeness
    ];
    expect(computeMomentum("increasing", entries)).toBe("up");
  });

  it("reports down when recent closeness clearly worsened", () => {
    const entries = [
      entry(90, 100),
      entry(90, 100),
      entry(90, 100),
      entry(40, 100),
      entry(40, 100),
      entry(40, 100),
    ];
    expect(computeMomentum("increasing", entries)).toBe("down");
  });

  it("reports flat when recent and previous closeness are within the noise threshold", () => {
    const entries = [
      entry(80, 100),
      entry(81, 100),
      entry(80, 100),
      entry(80, 100),
      entry(79, 100),
      entry(81, 100),
    ];
    expect(computeMomentum("increasing", entries)).toBe("flat");
  });

  it("is direction-aware for decreasing goals", () => {
    const entries = [
      entry(20, 12), // far above a decreasing target = poor closeness
      entry(20, 12),
      entry(20, 12),
      entry(12, 12), // right on target = improved closeness
      entry(12, 12),
      entry(12, 12),
    ];
    expect(computeMomentum("decreasing", entries)).toBe("up");
  });

  it("ignores entries with no actualValue (skips/freezes never produce entries, but be defensive)", () => {
    const undated: LoggedEntry = { ...entry(50, 100), actualValue: undefined };
    const entries = [undated, undated, undated, undated, undated, undated];
    expect(computeMomentum("increasing", entries)).toBe("insufficient_data");
  });
});

describe("shouldShowMomentum", () => {
  it("shows up and flat, never down or insufficient_data", () => {
    expect(shouldShowMomentum("up")).toBe(true);
    expect(shouldShowMomentum("flat")).toBe(true);
    expect(shouldShowMomentum("down")).toBe(false);
    expect(shouldShowMomentum("insufficient_data")).toBe(false);
  });
});
