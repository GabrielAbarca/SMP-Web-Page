// ─────────────────────────────────────────────────────────────────
//  teacherContext.js — resolves the signed-in teacher's identity and
//  academic context into the shared state, and reports whether that
//  succeeded so the views can tell a failed lookup from an account that
//  simply owns no teachers row.
//
//  Takes the data layer as an argument instead of importing it (same
//  shape as createAdminData(gateway) in adminData.js): teacherData/index.js
//  is excluded from typecheck, and importing it here would pull its whole
//  graph into the checked set. It also keeps this module free of Supabase
//  at unit-test time.
// ─────────────────────────────────────────────────────────────────
import { state } from "./teacherState.js";

/**
 * @typedef {object} TeacherContextDb
 * @property {() => Promise<number | null>} getTeacherId
 * @property {() => Promise<{ id: number, name: string, is_active: boolean } | null>} fetchActiveYear
 * @property {(yearId?: number) => Promise<Array<any>>} fetchGradingPeriods
 */

/**
 * Populate `state.teacherId`, `state.activeYear` and `state.periods`.
 *
 * The identity and the year are resolved in separate try blocks on purpose:
 * a teachers lookup that fails should not also cost a perfectly good school
 * year, which is what the console wants but a single shared try could not
 * deliver. `state.contextError` holds the first failure, and is what lets a
 * caller distinguish "we could not find out" from "there is no teachers row",
 * two states that both leave `teacherId` null.
 *
 * @param {TeacherContextDb} db the teacher data layer
 * @returns {Promise<boolean>} true when the whole context resolved
 */
export async function resolveTeacherContext(db) {
  state.contextError = null;

  try {
    state.teacherId = await db.getTeacherId();
  } catch (err) {
    state.contextError = err;
  }

  try {
    state.activeYear = await db.fetchActiveYear();
    state.periods = await db.fetchGradingPeriods(state.activeYear?.id);
  } catch (err) {
    state.contextError ??= err;
  }

  return state.contextError == null;
}

/**
 * Whether the views that need a teacher and a school year can render.
 * @returns {boolean}
 */
export function hasTeacherContext() {
  return state.teacherId != null && state.activeYear != null;
}
