import { describe, it, expect } from "vitest";
import {
  TARGET_WEIGHT,
  roundWeight,
  totalWeight,
  weightStatus,
} from "../src/js/gradingPeriods.js";

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
