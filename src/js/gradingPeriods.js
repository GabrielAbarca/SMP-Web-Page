// ─────────────────────────────────────────────────────────────────
//  gradingPeriods.js — pure rules for a school year's grading periods.
//
//  A year's periods must carry weights that add up to 100% and must sit
//  inside the parent year's date range. Both rules are enforced in the
//  admin console (inline, before a write) and — for the dates — again by
//  a database trigger (supabase/schema/incremental_grading_period_bounds.sql).
//
//  Weights are stored as numeric(5,2), and a real three-period year is
//  33.33 / 33.33 / 33.34. Summing those as floats yields 99.99999999…,
//  so every total is rounded to two decimals before being compared to
//  100 — otherwise a correctly weighted year would be rejected.
// ─────────────────────────────────────────────────────────────────

/** Column precision of grading_periods.weight — numeric(5,2). */
const WEIGHT_DECIMALS = 2;

/** The weights of a year's periods must add up to this. */
export const TARGET_WEIGHT = 100;

/**
 * Round to the stored precision, killing binary-float drift.
 * @param {number} value
 * @returns {number}
 */
export function roundWeight(value) {
  const factor = 10 ** WEIGHT_DECIMALS;
  return Math.round(value * factor) / factor;
}

/**
 * Total weight of a year's periods, optionally as it *would* be after an
 * edit: `excludeId` drops the row being edited, `extraWeight` adds the
 * value being submitted.
 * @param {Array<{ id?: number, weight?: number|string|null }>} periods
 * @param {{ excludeId?: number|null, extraWeight?: number|null }} [opts]
 * @returns {number} total rounded to two decimals
 */
export function totalWeight(periods, opts = {}) {
  const { excludeId = null, extraWeight = null } = opts;
  let sum = 0;
  for (const p of periods ?? []) {
    if (excludeId != null && p.id === excludeId) continue;
    const w = Number(p.weight);
    if (Number.isFinite(w)) sum += w;
  }
  if (extraWeight != null && Number.isFinite(Number(extraWeight))) {
    sum += Number(extraWeight);
  }
  return roundWeight(sum);
}

/**
 * Classify a total against the 100% target.
 * @param {number} total
 * @param {number} [count] how many periods produced the total
 * @returns {"empty" | "ok" | "under" | "over"}
 */
export function weightStatus(total, count = 1) {
  if (!count) return "empty";
  const rounded = roundWeight(total);
  if (rounded === TARGET_WEIGHT) return "ok";
  return rounded > TARGET_WEIGHT ? "over" : "under";
}

// Date bounds for a period live in validate.js (dateWithin + endAfterStart),
// which every admin form shares — this module owns only the weight arithmetic.
