import { describe, it, expect } from "vitest";
import {
  DEFAULT_ACTIVE_DAYS,
  copySchedulePlan,
  dayKey,
  findAllConflicts,
  findConflicts,
  jsDayToDow,
  nextOccurrence,
  normalizeTime,
  rangesOverlap,
  resolveActiveDays,
  sortEntries,
  timeSlots,
  toMinutes,
  validateBlocks,
} from "../src/js/scheduleLogic.js";

/** Build an entry, defaulting the parts a given test doesn't care about. */
function entry(over = {}) {
  return {
    id: 1,
    class_id: 10,
    subject_id: 100,
    teacher_id: 1000,
    day_of_week: 1,
    start_time: "08:00",
    end_time: "09:00",
    room_id: null,
    ...over,
  };
}

describe("time helpers", () => {
  it("normalizes both Postgres and <input type=time> values", () => {
    expect(normalizeTime("08:30:00")).toBe("08:30");
    expect(normalizeTime("08:30")).toBe("08:30");
    expect(normalizeTime(null)).toBe("");
  });

  it("converts to minutes since midnight", () => {
    expect(toMinutes("08:30:00")).toBe(510);
    expect(toMinutes("00:00")).toBe(0);
    expect(Number.isNaN(toMinutes("nonsense"))).toBe(true);
  });

  it("treats back-to-back periods as non-overlapping", () => {
    // A block ending at 09:00 and the next starting at 09:00 is the normal
    // shape of a school day, not a clash.
    expect(rangesOverlap("08:00", "09:00", "09:00", "10:00")).toBe(false);
    expect(rangesOverlap("08:00", "09:00", "08:59", "10:00")).toBe(true);
    expect(rangesOverlap("08:00", "09:00", "07:00", "08:00")).toBe(false);
  });

  it("detects fully contained ranges", () => {
    expect(rangesOverlap("08:00", "12:00", "09:00", "10:00")).toBe(true);
    expect(rangesOverlap("09:00", "10:00", "08:00", "12:00")).toBe(true);
  });
});

describe("day helpers", () => {
  it("maps JavaScript's Sunday-first week onto the stored 1–7", () => {
    expect(jsDayToDow(0)).toBe(7);
    expect(jsDayToDow(1)).toBe(1);
    expect(jsDayToDow(6)).toBe(6);
  });

  it("exposes i18n key suffixes by day number", () => {
    expect(dayKey(1)).toBe("monday");
    expect(dayKey(7)).toBe("sunday");
    expect(dayKey(99)).toBe("");
  });
});

describe("resolveActiveDays", () => {
  it("falls back to Monday–Friday when unconfigured", () => {
    expect(resolveActiveDays(null)).toEqual(DEFAULT_ACTIVE_DAYS);
    expect(resolveActiveDays({})).toEqual([1, 2, 3, 4, 5]);
    expect(resolveActiveDays({ active_days: [] })).toEqual([1, 2, 3, 4, 5]);
  });

  it("sorts, dedupes and clamps what the school configured", () => {
    expect(resolveActiveDays({ active_days: [6, 1, 1, 3] })).toEqual([1, 3, 6]);
    expect(resolveActiveDays({ active_days: [0, 8, 2] })).toEqual([2]);
  });

  it("accepts the numeric strings a smallint[] can round-trip as", () => {
    expect(resolveActiveDays({ active_days: ["1", "2", "6"] })).toEqual([
      1, 2, 6,
    ]);
  });
});

describe("sortEntries / timeSlots", () => {
  it("orders by day, then start, then end", () => {
    const sorted = sortEntries([
      entry({ id: 3, day_of_week: 2, start_time: "08:00" }),
      entry({ id: 2, day_of_week: 1, start_time: "10:00" }),
      entry({ id: 1, day_of_week: 1, start_time: "08:00" }),
    ]);
    expect(sorted.map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it("collapses a week into its distinct time rows", () => {
    const slots = timeSlots([
      entry({ start_time: "09:00:00", end_time: "10:00:00" }),
      entry({ start_time: "08:00", end_time: "09:00" }),
      entry({ start_time: "08:00:00", end_time: "09:00:00" }),
    ]);
    expect(slots).toEqual([
      { start: "08:00", end: "09:00" },
      { start: "09:00", end: "10:00" },
    ]);
  });
});

describe("findConflicts", () => {
  const existing = [
    entry({
      id: 1,
      class_id: 10,
      teacher_id: 1000,
      room_id: 5,
      day_of_week: 1,
      start_time: "08:00:00",
      end_time: "09:00:00",
    }),
  ];

  it("flags the section being double-booked", () => {
    const found = findConflicts(
      entry({ id: undefined, class_id: 10, teacher_id: 2000, room_id: null }),
      existing,
    );
    expect(found.map((c) => c.type)).toContain("section");
  });

  it("flags a teacher booked in another section at the same time", () => {
    const found = findConflicts(
      entry({ id: undefined, class_id: 99, teacher_id: 1000, room_id: null }),
      existing,
    );
    expect(found).toHaveLength(1);
    expect(found[0].type).toBe("teacher");
    expect(found[0].entry.id).toBe(1);
  });

  it("flags a room booked by another section at the same time", () => {
    const found = findConflicts(
      entry({ id: undefined, class_id: 99, teacher_id: 2000, room_id: 5 }),
      existing,
    );
    expect(found.map((c) => c.type)).toEqual(["room"]);
  });

  it("never treats an unassigned room as a clash", () => {
    const noRoom = [entry({ id: 1, class_id: 10, room_id: null })];
    const found = findConflicts(
      entry({ id: undefined, class_id: 99, teacher_id: 2000, room_id: null }),
      noRoom,
    );
    expect(found).toEqual([]);
  });

  it("ignores the row being edited in place", () => {
    const candidate = entry({ id: 1, start_time: "08:15", end_time: "09:15" });
    expect(findConflicts(candidate, existing)).not.toEqual([]);
    expect(findConflicts(candidate, existing, { excludeId: 1 })).toEqual([]);
  });

  it("ignores a different day and a non-overlapping slot", () => {
    expect(
      findConflicts(entry({ id: undefined, day_of_week: 2 }), existing),
    ).toEqual([]);
    expect(
      findConflicts(
        entry({ id: undefined, start_time: "09:00", end_time: "10:00" }),
        existing,
      ),
    ).toEqual([]);
  });
});

describe("findAllConflicts", () => {
  it("reports each clashing pair once per kind", () => {
    const found = findAllConflicts([
      entry({ id: 1, class_id: 10, teacher_id: 1000, room_id: 5 }),
      entry({ id: 2, class_id: 20, teacher_id: 1000, room_id: 5 }),
    ]);
    expect(found.map((c) => c.type).sort()).toEqual(["room", "teacher"]);
    expect(found.every((c) => c.a.id === 1 && c.b.id === 2)).toBe(true);
  });

  it("returns nothing for a clean week", () => {
    expect(
      findAllConflicts([
        entry({ id: 1, start_time: "08:00", end_time: "09:00" }),
        entry({ id: 2, start_time: "09:00", end_time: "10:00" }),
      ]),
    ).toEqual([]);
  });
});

describe("copySchedulePlan", () => {
  const source = [
    entry({
      id: 1,
      class_id: 10,
      day_of_week: 1,
      start_time: "08:00",
      end_time: "09:00",
    }),
    entry({
      id: 2,
      class_id: 10,
      day_of_week: 1,
      start_time: "09:00",
      end_time: "10:00",
    }),
  ];

  it("strips ids and re-points rows at the target section", () => {
    const plan = copySchedulePlan(source, 20, source);
    expect(plan.rows).toHaveLength(2);
    expect(plan.rows.every((r) => r.class_id === 20)).toBe(true);
    expect(plan.rows.every((r) => !("id" in r))).toBe(true);
    expect(plan.skipped).toEqual([]);
  });

  it("skips rows the target section already has in that slot", () => {
    const target = entry({
      id: 9,
      class_id: 20,
      day_of_week: 1,
      start_time: "08:00",
      end_time: "09:00",
    });
    const plan = copySchedulePlan(source, 20, [...source, target]);
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0].start_time).toBe("09:00");
    expect(plan.skipped.map((e) => e.id)).toEqual([1]);
  });

  it("copies but reports a teacher clash with a third section", () => {
    const other = entry({
      id: 9,
      class_id: 30,
      teacher_id: 1000,
      day_of_week: 1,
      start_time: "08:00",
      end_time: "09:00",
    });
    const plan = copySchedulePlan(source, 20, [...source, other]);
    expect(plan.rows).toHaveLength(2);
    expect(plan.conflicts.some((c) => c.type === "teacher")).toBe(true);
  });

  it("catches a source week that would collide with itself", () => {
    const overlapping = [
      entry({ id: 1, class_id: 10, start_time: "08:00", end_time: "09:30" }),
      entry({ id: 2, class_id: 10, start_time: "09:00", end_time: "10:00" }),
    ];
    const plan = copySchedulePlan(overlapping, 20, []);
    expect(plan.rows).toHaveLength(1);
    expect(plan.skipped.map((e) => e.id)).toEqual([2]);
  });
});

describe("validateBlocks", () => {
  it("rejects a block that ends before it starts", () => {
    expect(
      validateBlocks([
        { block_order: 1, start_time: "10:00", end_time: "09:00" },
      ]),
    ).toEqual({ 0: "timeOrder" });
  });

  it("flags both sides of an overlap", () => {
    const errors = validateBlocks([
      { block_order: 1, start_time: "08:00", end_time: "09:30" },
      { block_order: 2, start_time: "09:00", end_time: "10:00" },
    ]);
    expect(errors).toEqual({ 0: "overlap", 1: "overlap" });
  });

  it("flags a duplicate order", () => {
    const errors = validateBlocks([
      { block_order: 1, start_time: "08:00", end_time: "09:00" },
      { block_order: 1, start_time: "09:00", end_time: "10:00" },
    ]);
    expect(errors).toEqual({ 1: "duplicateOrder" });
  });

  it("accepts a normal back-to-back bell schedule", () => {
    expect(
      validateBlocks([
        { block_order: 1, start_time: "07:00", end_time: "07:45" },
        { block_order: 2, start_time: "07:45", end_time: "08:30" },
      ]),
    ).toEqual({});
  });
});

describe("nextOccurrence", () => {
  const week = [
    entry({ id: 1, day_of_week: 1, start_time: "08:00", end_time: "09:00" }),
    entry({ id: 2, day_of_week: 1, start_time: "10:00", end_time: "11:00" }),
    entry({ id: 3, day_of_week: 3, start_time: "08:00", end_time: "09:00" }),
  ];

  it("finds the next class later the same day", () => {
    // Monday 09:30 → the 10:00 block.
    expect(nextOccurrence(week, 1, "09:30")?.id).toBe(2);
  });

  it("rolls forward to the next teaching day once today is done", () => {
    expect(nextOccurrence(week, 1, "11:30")?.id).toBe(3);
  });

  it("wraps around the end of the week", () => {
    // Thursday → nothing left until Monday.
    expect(nextOccurrence(week, 4, "08:00")?.id).toBe(1);
  });

  it("works on a Sunday, which getDay() reports as 0", () => {
    expect(nextOccurrence(week, 0, "08:00")?.id).toBe(1);
  });

  it("handles weekend teaching", () => {
    const withSaturday = [
      ...week,
      entry({ id: 4, day_of_week: 6, start_time: "08:00", end_time: "09:00" }),
    ];
    expect(nextOccurrence(withSaturday, 5, "12:00")?.id).toBe(4);
  });

  it("returns null for an empty schedule", () => {
    expect(nextOccurrence([], 1, "08:00")).toBeNull();
  });
});
