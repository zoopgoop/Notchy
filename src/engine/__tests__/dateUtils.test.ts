import { addDays, daysBetween, formatDateLocal, getWeekday } from "../dateUtils";

describe("daysBetween", () => {
  it("counts whole calendar days for date-only strings", () => {
    expect(daysBetween("2026-01-01", "2026-01-11")).toBe(10);
  });

  it("normalizes full timestamps to their calendar date, regardless of time-of-day", () => {
    // A goal created at 23:58 should still count as day 0 on the same calendar date,
    // not bleed into the next day just because of the time component.
    expect(daysBetween("2026-01-01T23:58:00.000Z", "2026-01-02")).toBe(1);
    expect(daysBetween("2026-01-01T00:02:00.000Z", "2026-01-02")).toBe(1);
  });

});

describe("formatDateLocal", () => {
  it("extracts LOCAL calendar components, not a UTC conversion", () => {
    // The 4-arg Date constructor (no string parsing) is always local time by spec,
    // regardless of the host's timezone — so this is deterministic everywhere,
    // unlike testing via process.env.TZ (which Jest's RN test environment ignores).
    // It proves formatDateLocal round-trips local components correctly, which is the
    // actual bug class: code that instead did `date.toISOString().slice(0, 10)` would
    // convert to UTC first and could report the wrong day near midnight.
    const localMidnightish = new Date(2026, 5, 28, 0, 30); // June 28, 2026, 00:30 local
    expect(formatDateLocal(localMidnightish)).toBe("2026-06-28");
  });
});

describe("getWeekday", () => {
  it("matches Date.getDay() convention (0=Sunday..6=Saturday)", () => {
    expect(getWeekday("2026-01-01")).toBe(4); // Thursday
    expect(getWeekday("2026-01-11")).toBe(0); // Sunday
  });
});

describe("addDays", () => {
  it("adds days without local-timezone drift", () => {
    expect(addDays("2026-01-08", -6)).toBe("2026-01-02");
    expect(addDays("2026-01-01", 6)).toBe("2026-01-07");
  });

  it("normalizes a full timestamp input to a date-only result", () => {
    expect(addDays("2026-01-08T23:59:00.000Z", -6)).toBe("2026-01-02");
  });
});
