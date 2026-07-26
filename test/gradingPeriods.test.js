import { describe, it, expect } from "vitest";
import {
  TARGET_WEIGHT,
  roundWeight,
  totalWeight,
  weightStatus,
  checkPeriodRange,
} from "../src/js/gradingPeriods.js";

const YEAR = { start_date: "2025-09-01", end_date: "2026-06-30" };

describe("roundWeight", () => {
  it("rounds to the stored numeric(5,2) precision", () => {
    expect(roundWeight(33.334)).toBe(33.33);
    expect(roundWeight(33.335)).toBe(33.34);
    expect(roundWeight(100)).toBe(100);
  });
});

describe("totalWeight", () => {
  it("sums a real three-period year to exactly 100", () => {
    // The float sum of these is 99.99999999999999 — the rounding is the point.
    const periods = [
      { id: 1, weight: 33.33 },
      { id: 2, weight: 33.33 },
      { id: 3, weight: 33.34 },
    ];
    expect(totalWeight(periods)).toBe(100);
    expect(weightStatus(totalWeight(periods), periods.length)).toBe("ok");
  });

  it("accepts numeric strings as returned by Postgres numeric columns", () => {
    expect(totalWeight([{ weight: "33.33" }, { weight: "66.67" }])).toBe(100);
  });

  it("ignores null, empty and non-numeric weights", () => {
    expect(
      totalWeight([{ weight: null }, { weight: "" }, { weight: "abc" }]),
    ).toBe(0);
  });

  it("excludes the row being edited and adds the submitted value", () => {
    const periods = [
      { id: 1, weight: 50 },
      { id: 2, weight: 50 },
    ];
    // Editing period 2 down to 25 → 50 + 25.
    expect(totalWeight(periods, { excludeId: 2, extraWeight: 25 })).toBe(75);
    // Adding a third period on top of a full year overshoots.
    expect(totalWeight(periods, { extraWeight: 10 })).toBe(110);
  });

  it("treats a missing list as zero", () => {
    expect(totalWeight(undefined)).toBe(0);
    expect(totalWeight([])).toBe(0);
  });
});

describe("weightStatus", () => {
  it("classifies against the 100% target", () => {
    expect(weightStatus(TARGET_WEIGHT, 3)).toBe("ok");
    expect(weightStatus(66.66, 2)).toBe("under");
    expect(weightStatus(110, 4)).toBe("over");
  });

  it("reports a year with no periods as empty", () => {
    expect(weightStatus(0, 0)).toBe("empty");
  });

  it("does not reject a total that is only float-noise off 100", () => {
    expect(weightStatus(33.33 + 33.33 + 33.34, 3)).toBe("ok");
  });
});

describe("checkPeriodRange", () => {
  it("accepts a period inside its year", () => {
    expect(
      checkPeriodRange({ start: "2025-09-15", end: "2025-12-19" }, YEAR),
    ).toBeNull();
  });

  it("accepts a period exactly on the year's boundaries", () => {
    expect(
      checkPeriodRange({ start: "2025-09-01", end: "2026-06-30" }, YEAR),
    ).toBeNull();
  });

  it("rejects an end on or before the start", () => {
    expect(
      checkPeriodRange({ start: "2025-10-01", end: "2025-10-01" }, YEAR),
    ).toEqual({ field: "end_date", reason: "order" });
    expect(
      checkPeriodRange({ start: "2025-10-02", end: "2025-10-01" }, YEAR),
    ).toEqual({ field: "end_date", reason: "order" });
  });

  it("rejects a start before the year begins", () => {
    expect(
      checkPeriodRange({ start: "2025-08-31", end: "2025-12-19" }, YEAR),
    ).toEqual({ field: "start_date", reason: "outside" });
  });

  it("rejects an end after the year finishes", () => {
    expect(
      checkPeriodRange({ start: "2026-05-01", end: "2026-07-01" }, YEAR),
    ).toEqual({ field: "end_date", reason: "outside" });
  });

  it("defers empty dates to the required-field rule", () => {
    expect(checkPeriodRange({ start: "", end: "" }, YEAR)).toBeNull();
    expect(checkPeriodRange({ start: "2025-10-01", end: "" }, YEAR)).toBeNull();
  });

  it("checks ordering even with no year to bound against", () => {
    expect(
      checkPeriodRange({ start: "2025-10-02", end: "2025-10-01" }, null),
    ).toEqual({ field: "end_date", reason: "order" });
    expect(
      checkPeriodRange({ start: "2025-10-01", end: "2025-10-02" }, null),
    ).toBeNull();
  });
});
