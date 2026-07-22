// ─────────────────────────────────────────────────────────────────
//  adminData.js — data layer for the admin console.
//
//  Two pieces:
//    • a generic table Gateway (select / insert / update / remove),
//      with a Supabase-backed implementation; the demo overlay in
//      adminDemoDb.js is an alternate Gateway.
//    • createAdminData(gateway): declarative read/write methods for the
//      academic-structure tables. Reads are FLAT (one table each) so the
//      demo overlay stays a simple per-table delta store; the controller
//      composes joins from the small reference lists it already holds.
// ─────────────────────────────────────────────────────────────────

import { supabase } from "./supabaseClient.js";

/**
 * @typedef {Object} SelectOpts
 * @property {Record<string, string|number|boolean>} [match] equality filters (col → value)
 * @property {{ column: string, values: Array<string|number> }} [inList] membership filter
 * @property {{ column: string, ascending?: boolean }} [order] sort (ascending defaults true)
 */

/**
 * A minimal table access contract. The real gateway talks to Supabase; the
 * demo gateway (adminDemoDb.js) records writes locally and overlays reads.
 * @typedef {Object} Gateway
 * @property {(table: string, opts?: SelectOpts) => Promise<any[]>} select
 * @property {(table: string, row: object) => Promise<any>} insert returns the created row (with id)
 * @property {(table: string, rows: object[]) => Promise<any[]>} insertMany bulk insert (CSV import)
 * @property {(table: string, id: number, patch: object) => Promise<void>} update
 * @property {(table: string, id: number) => Promise<void>} remove
 */

/** Supabase-backed gateway (real writes). @type {Gateway} */
export const supabaseGateway = {
  async select(table, opts = {}) {
    let q = supabase.from(table).select("*");
    if (opts.match) {
      for (const [col, val] of Object.entries(opts.match)) q = q.eq(col, val);
    }
    if (opts.inList) q = q.in(opts.inList.column, opts.inList.values);
    if (opts.order) {
      q = q.order(opts.order.column, {
        ascending: opts.order.ascending !== false,
      });
    }
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  },

  async insert(table, row) {
    const { data, error } = await supabase
      .from(table)
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async insertMany(table, rows) {
    const { data, error } = await supabase.from(table).insert(rows).select();
    if (error) throw error;
    return data ?? [];
  },

  async update(table, id, patch) {
    const { error } = await supabase.from(table).update(patch).eq("id", id);
    if (error) throw error;
  },

  async remove(table, id) {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) throw error;
  },
};

/**
 * Declarative admin data methods over a Gateway.
 * @param {Gateway} gateway
 */
export function createAdminData(gateway) {
  return {
    // ── School years ──────────────────────────────────────────
    listSchoolYears: () =>
      gateway.select("school_years", {
        order: { column: "start_date", ascending: false },
      }),
    createSchoolYear: (/** @type {object} */ row) =>
      gateway.insert("school_years", row),
    updateSchoolYear: (/** @type {number} */ id, /** @type {object} */ patch) =>
      gateway.update("school_years", id, patch),
    deleteSchoolYear: (/** @type {number} */ id) =>
      gateway.remove("school_years", id),

    /**
     * Mark one year active, clearing any others (a school has a single active
     * year). `previouslyActive` are the ids currently flagged is_active.
     * @param {number} id
     * @param {number[]} [previouslyActive]
     */
    async setActiveYear(id, previouslyActive = []) {
      for (const prev of previouslyActive) {
        if (prev !== id)
          await gateway.update("school_years", prev, { is_active: false });
      }
      await gateway.update("school_years", id, { is_active: true });
    },

    // ── Grading periods ───────────────────────────────────────
    listPeriods: (/** @type {number} */ yearId) =>
      gateway.select("grading_periods", {
        match: { school_year_id: yearId },
        order: { column: "period_order" },
      }),
    createPeriod: (/** @type {object} */ row) =>
      gateway.insert("grading_periods", row),
    updatePeriod: (/** @type {number} */ id, /** @type {object} */ patch) =>
      gateway.update("grading_periods", id, patch),
    deletePeriod: (/** @type {number} */ id) =>
      gateway.remove("grading_periods", id),

    // ── Grade levels ──────────────────────────────────────────
    listGradeLevels: () =>
      gateway.select("grade_levels", { order: { column: "numeric_level" } }),
    createGradeLevel: (/** @type {object} */ row) =>
      gateway.insert("grade_levels", row),
    updateGradeLevel: (/** @type {number} */ id, /** @type {object} */ patch) =>
      gateway.update("grade_levels", id, patch),
    deleteGradeLevel: (/** @type {number} */ id) =>
      gateway.remove("grade_levels", id),

    // ── Rooms ─────────────────────────────────────────────────
    listRooms: () => gateway.select("rooms", { order: { column: "name" } }),
    createRoom: (/** @type {object} */ row) => gateway.insert("rooms", row),
    updateRoom: (/** @type {number} */ id, /** @type {object} */ patch) =>
      gateway.update("rooms", id, patch),
    deleteRoom: (/** @type {number} */ id) => gateway.remove("rooms", id),

    // ── Sections (classes) ────────────────────────────────────
    listSections: (/** @type {number} */ yearId) =>
      gateway.select("classes", {
        match: { school_year_id: yearId },
        order: { column: "grade_level_id" },
      }),
    createSection: (/** @type {object} */ row) =>
      gateway.insert("classes", row),
    updateSection: (/** @type {number} */ id, /** @type {object} */ patch) =>
      gateway.update("classes", id, patch),
    deleteSection: (/** @type {number} */ id) => gateway.remove("classes", id),

    // ── Subjects ──────────────────────────────────────────────
    listSubjects: () =>
      gateway.select("subjects", { order: { column: "name" } }),
    createSubject: (/** @type {object} */ row) =>
      gateway.insert("subjects", row),
    updateSubject: (/** @type {number} */ id, /** @type {object} */ patch) =>
      gateway.update("subjects", id, patch),
    deleteSubject: (/** @type {number} */ id) => gateway.remove("subjects", id),

    // ── Grade-level ↔ subject mapping ─────────────────────────
    listGradeLevelSubjects: () => gateway.select("grade_level_subjects"),
    createGradeLevelSubject: (/** @type {object} */ row) =>
      gateway.insert("grade_level_subjects", row),
    deleteGradeLevelSubject: (/** @type {number} */ id) =>
      gateway.remove("grade_level_subjects", id),

    // ── Teachers (records; auth accounts are Phase 3) ─────────
    listTeachers: () =>
      gateway.select("teachers", { order: { column: "last_name" } }),
    createTeacher: (/** @type {object} */ row) =>
      gateway.insert("teachers", row),
    updateTeacher: (/** @type {number} */ id, /** @type {object} */ patch) =>
      gateway.update("teachers", id, patch),
    deleteTeacher: (/** @type {number} */ id) => gateway.remove("teachers", id),

    // ── Class ↔ subject ↔ teacher assignments ─────────────────
    listAssignments: (/** @type {number} */ yearId) =>
      gateway.select("class_subject_teachers", {
        match: { school_year_id: yearId },
      }),
    createAssignment: (/** @type {object} */ row) =>
      gateway.insert("class_subject_teachers", row),
    deleteAssignment: (/** @type {number} */ id) =>
      gateway.remove("class_subject_teachers", id),

    // ── Schedules ─────────────────────────────────────────────
    listSchedules: (/** @type {number} */ classId) =>
      gateway.select("schedules", {
        match: { class_id: classId },
        order: { column: "day_of_week" },
      }),
    createSchedule: (/** @type {object} */ row) =>
      gateway.insert("schedules", row),
    updateSchedule: (/** @type {number} */ id, /** @type {object} */ patch) =>
      gateway.update("schedules", id, patch),
    deleteSchedule: (/** @type {number} */ id) =>
      gateway.remove("schedules", id),

    // ── Students & enrollment ─────────────────────────────────
    listStudents: () =>
      gateway.select("students", { order: { column: "last_name" } }),
    createStudent: (/** @type {object} */ row) =>
      gateway.insert("students", row),
    updateStudent: (/** @type {number} */ id, /** @type {object} */ patch) =>
      gateway.update("students", id, patch),
    deleteStudent: (/** @type {number} */ id) => gateway.remove("students", id),
    /** Bulk-create students (CSV roster import). @param {object[]} rows */
    bulkCreateStudents: (rows) => gateway.insertMany("students", rows),
  };
}
