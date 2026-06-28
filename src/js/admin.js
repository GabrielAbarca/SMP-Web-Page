// ═══════════════════════════════════════════════════════════════
//  admin.js — Simple Manage Pro | Teacher Console
//
//  A single authenticated teacher's workspace. Everything scopes to
//  the teacher resolved from app_config via demo_teacher_id() (demo:
//  no per-teacher auth). Modeled on PowerSchool's PowerTeacher Pro.
//
//  Architecture:
//  1. Auth guard + teacher identity
//  2. Data layer  (db object — all Supabase queries)
//  3. UI helpers  (toast, modal, confirm, drawer, table helpers)
//  4. Navigation  (class-first: My Classes → class workspace)
//  5. My Classes landing
//  6. Class workspace shell + sub-tabs
//  7. Roster      (+ student detail drawer)
//  8. Gradebook   (assignments + per-student scores — the core)
//  9. Attendance
// 10. Schedule
// 11. Subjects    (global catalog — retained)
// ═══════════════════════════════════════════════════════════════

import { supabase } from "./supabaseClient.js";
import { signOut, getSession } from "./auth.js";
import { initTheme, bindThemeToggle } from "./theme.js";
import {
  skeletonRows,
  skeletonBlock,
  skeletonCards,
  skeletonCardItems,
} from "./ui.js";

// ───────────────────────────────────────────────────────────────
//  1. AUTH GUARD + TEACHER IDENTITY
// ───────────────────────────────────────────────────────────────
const session = await getSession();
if (!session) {
  window.location.replace("/login.html");
  throw new Error("Unauthenticated");
}

const { data: adminProfile, error: profileError } = await supabase
  .from("profiles")
  .select("name, role")
  .eq("id", session.user.id)
  .single();

if (profileError || adminProfile?.role !== "admin") {
  window.location.replace("/");
  throw new Error("Unauthorized");
}

// Resolve the current teacher (demo: fixed via app_config → demo_teacher_id()).
// Every teacher-scoped query below filters to TEACHER_ID in ACTIVE_YEAR.
let TEACHER_ID = null;
let ACTIVE_YEAR = null;
let PERIODS = [];

// ── Role gating (visual/demo only) ──────────────────────────────
// There is no per-user auth yet — this console always runs as the demo teacher.
// IS_ADMIN is the SINGLE flag every admin-restricted control routes through, and
// the only line a future real auth check would replace. Do not hardcode the
// disabled state into individual buttons; gate them through this flag instead.
const IS_ADMIN = false;
const ADMIN_ONLY_MSG = "Solo un administrador puede realizar esta acción";

// Core, reusable treatment for any admin-restricted control. When IS_ADMIN is
// false, render the element enabled-but-inert: dimmed, not-allowed, aria-disabled,
// a hover tooltip, and a no-op click so the underlying action never runs. NOTE:
// the native `disabled` attribute is intentionally avoided — it suppresses mouse
// events, which would kill the hover tooltip.
function applyAdminLock(el) {
  el.classList.add("admin-only");
  el.setAttribute("aria-disabled", "true");
  el.title = ADMIN_ONLY_MSG;
  el.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
}

// Wire a click action behind the flag in one call. Admin: run the real handler.
// Non-admin: lock the control (inert) and never attach the real handler.
function bindAdminAction(el, handler) {
  if (IS_ADMIN) el.addEventListener("click", handler);
  else applyAdminLock(el);
  return el;
}

// ───────────────────────────────────────────────────────────────
//  2. DATA LAYER
// ───────────────────────────────────────────────────────────────
const db = {
  // ── Identity / context ──────────────────────────────────────
  async getTeacherId() {
    const { data, error } = await supabase.rpc("demo_teacher_id");
    if (error) throw error;
    return data;
  },

  async fetchActiveYear() {
    const { data, error } = await supabase
      .from("school_years")
      .select("id, name, is_active")
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async fetchTeacher(id) {
    const { data, error } = await supabase
      .from("teachers")
      .select("id, first_name, last_name, specialization")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },

  async fetchGradingPeriods(yearId) {
    let q = supabase
      .from("grading_periods")
      .select("id, name, period_order, start_date, end_date")
      .order("period_order");
    if (yearId) q = q.eq("school_year_id", yearId);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },

  // ── My Classes ──────────────────────────────────────────────
  async fetchMyClasses(teacherId, yearId) {
    const { data, error } = await supabase
      .from("class_subject_teachers")
      .select(
        `
        id, class_id, subject_id,
        classes!class_id(id, display_name, section, grade_levels!grade_level_id(name)),
        subjects!subject_id(id, name, color)
      `,
      )
      .eq("teacher_id", teacherId)
      .eq("school_year_id", yearId)
      .order("class_id");
    if (error) throw error;
    return data;
  },

  async fetchActiveCountByClass() {
    const { data, error } = await supabase
      .from("students")
      .select("class_id")
      .eq("status", "active");
    if (error) throw error;
    return (data ?? []).reduce((acc, s) => {
      if (s.class_id) acc[s.class_id] = (acc[s.class_id] || 0) + 1;
      return acc;
    }, {});
  },

  // ── Roster / students ───────────────────────────────────────
  async fetchRoster(classId) {
    const { data, error } = await supabase
      .from("students")
      .select(
        "id, first_name, last_name, email, phone, status, enrollment_number, " +
          "national_id, date_of_birth, gender, address, photo_url, enrollment_date",
      )
      .eq("class_id", classId)
      .order("last_name");
    if (error) throw error;
    return data;
  },

  async fetchStudentContacts(studentId) {
    const { data, error } = await supabase
      .from("student_guardians")
      .select(
        `
        is_primary,
        guardians!guardian_id(first_name, last_name, relationship, phone, alt_phone, email)
      `,
      )
      .eq("student_id", studentId);
    if (error) throw error;
    return data;
  },

  async insertStudent(payload) {
    const { error } = await supabase.from("students").insert(payload);
    if (error) throw error;
  },

  async updateStudent(id, payload) {
    const { error } = await supabase
      .from("students")
      .update(payload)
      .eq("id", id);
    if (error) throw error;
  },

  async deleteStudent(id) {
    const { error } = await supabase.from("students").delete().eq("id", id);
    if (error) throw error;
  },

  // ── Assignments (gradebook) ─────────────────────────────────
  async fetchAssignments(cstId, periodId) {
    const { data, error } = await supabase
      .from("assignments")
      .select("id, name, due_date, max_score, note, created_at, category_id")
      .eq("class_subject_teacher_id", cstId)
      .eq("grading_period_id", periodId)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data;
  },

  async insertAssignment(payload) {
    const { error } = await supabase.from("assignments").insert(payload);
    if (error) throw error;
  },

  async updateAssignment(id, payload) {
    const { error } = await supabase
      .from("assignments")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },

  async deleteAssignment(id) {
    // assignment_grades.assignment_id is ON DELETE CASCADE — scores go with it.
    const { error } = await supabase.from("assignments").delete().eq("id", id);
    if (error) throw error;
  },

  // Full grade records for one student — powers the per-student grade modal.
  async fetchStudentAssignmentGrades(assignmentIds, studentId) {
    if (!assignmentIds.length) return [];
    const { data, error } = await supabase
      .from("assignment_grades")
      .select("assignment_id, score, note, graded_at, created_at")
      .in("assignment_id", assignmentIds)
      .eq("student_id", studentId);
    if (error) throw error;
    return data;
  },

  // Rows are passed through verbatim — caller owns score/note/graded_at so it
  // can null graded_at when a score is cleared. created_at is never sent, so the
  // DB default fills it on insert and the existing value survives on update.
  async upsertAssignmentGrades(rows) {
    const { error } = await supabase
      .from("assignment_grades")
      .upsert(rows, { onConflict: "assignment_id,student_id" });
    if (error) throw error;
  },

  // Computed overall grade per student — read from the view, never recompute.
  async fetchPeriodGrades(cstId, periodId) {
    const { data, error } = await supabase
      .from("student_period_grades")
      .select("student_id, period_score, graded_count, total_assignments")
      .eq("class_subject_teacher_id", cstId)
      .eq("grading_period_id", periodId)
      .not("student_id", "is", null);
    if (error) throw error;
    return data;
  },

  // Every period's score for a section in one shot — powers the roster's
  // P1/P2/P3 columns + weighted Overall (pivoted client-side by period_order).
  async fetchAllPeriodGrades(cstId) {
    const { data, error } = await supabase
      .from("student_period_grades")
      .select("student_id, grading_period_id, period_score")
      .eq("class_subject_teacher_id", cstId)
      .not("student_id", "is", null);
    if (error) throw error;
    return data;
  },

  // ── Attendance ──────────────────────────────────────────────
  async fetchAttendanceSheet(classId, date) {
    const [studentsRes, recordsRes] = await Promise.all([
      supabase
        .from("students")
        .select("id, first_name, last_name")
        .eq("class_id", classId)
        .eq("status", "active")
        .order("last_name"),
      supabase
        .from("attendance")
        .select("student_id, status, notes")
        .eq("class_id", classId)
        .eq("date", date),
    ]);
    if (studentsRes.error) throw studentsRes.error;
    if (recordsRes.error) throw recordsRes.error;

    const recordMap = Object.fromEntries(
      (recordsRes.data ?? []).map((r) => [r.student_id, r]),
    );
    // No default status — an unsaved sheet shows every status button inactive.
    // A saved record keeps its real status so loaded attendance renders highlighted.
    return (studentsRes.data ?? []).map((s) => ({
      ...s,
      status: recordMap[s.id]?.status ?? null,
      notes: recordMap[s.id]?.notes ?? "",
    }));
  },

  async upsertAttendance(classId, date, rows, recordedBy) {
    const payload = rows.map((r) => ({
      student_id: r.id,
      class_id: classId,
      date,
      status: r.status,
      notes: r.notes || null,
      recorded_by: recordedBy ?? null,
    }));
    const { error } = await supabase
      .from("attendance")
      .upsert(payload, { onConflict: "student_id,class_id,date" });
    if (error) throw error;
  },

  // ── Schedule ────────────────────────────────────────────────
  async fetchScheduleByClass(classId) {
    const { data, error } = await supabase
      .from("schedules")
      .select(
        `
        id, day_of_week, start_time, end_time,
        subjects!subject_id(id, name, color),
        teachers!teacher_id(id, first_name, last_name),
        rooms!room_id(id, name)
      `,
      )
      .eq("class_id", classId)
      .order("day_of_week")
      .order("start_time");
    if (error) throw error;
    return data;
  },

  async insertSchedule(payload) {
    const { error } = await supabase.from("schedules").insert(payload);
    if (error) throw error;
  },

  async deleteSchedule(id) {
    const { error } = await supabase.from("schedules").delete().eq("id", id);
    if (error) throw error;
  },

  // ── Shared reference data (for forms) ───────────────────────
  async fetchSubjects() {
    const { data, error } = await supabase
      .from("subjects")
      .select("id, name, code, color")
      .order("name");
    if (error) throw error;
    return data;
  },

  async fetchTeachers() {
    const { data, error } = await supabase
      .from("teachers")
      .select("id, first_name, last_name")
      .order("last_name");
    if (error) throw error;
    return data;
  },

  async fetchRooms() {
    const { data, error } = await supabase
      .from("rooms")
      .select("id, name, capacity")
      .order("name");
    if (error) throw error;
    return data;
  },

  // ── Subjects catalog (global — retained) ────────────────────
  async fetchSubjectsDetailed() {
    const { data, error } = await supabase
      .from("subjects")
      .select(
        `
        id, name, code, description, color,
        grade_level_subjects(grade_levels(name))
      `,
      )
      .order("name");
    if (error) throw error;
    return data;
  },

  // ── Student 360 (read-only) ─────────────────────────────────
  async fetchStudentAttendance(studentId) {
    const { data, error } = await supabase
      .from("attendance")
      .select("status")
      .eq("student_id", studentId);
    if (error) throw error;
    return data;
  },

  async fetchStudentDiscipline(studentId) {
    const { data, error } = await supabase
      .from("discipline_records")
      .select("id, date, type, severity, resolved, description, resolution")
      .eq("student_id", studentId)
      .order("date", { ascending: false });
    if (error) throw error;
    return data;
  },

  // ── Discipline (write — item 2) ─────────────────────────────
  // Teacher-filed behavior records. reported_by_teacher stamps authorship;
  // reported_by_staff stays null (this console is teacher-scoped).
  async insertDiscipline(payload) {
    const { error } = await supabase.from("discipline_records").insert(payload);
    if (error) throw error;
  },

  async updateDiscipline(id, payload) {
    const { error } = await supabase
      .from("discipline_records")
      .update(payload)
      .eq("id", id);
    if (error) throw error;
  },

  // Per-subject grades come from student_grades (the full-school record the
  // student portal shows), NOT the assignment-derived view. Read-only.
  async fetchStudentSubjectGrades(studentId, periodId) {
    const { data, error } = await supabase
      .from("student_grades")
      .select(
        "score, class_subject_teachers!class_subject_teacher_id(subjects!subject_id(name, color))",
      )
      .eq("student_id", studentId)
      .eq("grading_period_id", periodId);
    if (error) throw error;
    return data;
  },

  // Every posted subject grade for a student, all periods — powers the printable
  // progress report (item 6). Read-only, the full-school student_grades record.
  async fetchStudentAllSubjectGrades(studentId) {
    const { data, error } = await supabase
      .from("student_grades")
      .select(
        "score, grading_period_id, notes, class_subject_teachers!class_subject_teacher_id(subjects!subject_id(name))",
      )
      .eq("student_id", studentId);
    if (error) throw error;
    return data;
  },

  // ── Post grades (item 1) ────────────────────────────────────
  // The grades already posted to the report card for this section + period, so
  // the posting panel can show what's live and pre-fill overrides/comments.
  async fetchPostedGrades(cstId, periodId) {
    const { data, error } = await supabase
      .from("student_grades")
      .select("student_id, score, notes, submitted_at")
      .eq("class_subject_teacher_id", cstId)
      .eq("grading_period_id", periodId);
    if (error) throw error;
    return data;
  },

  // Commit final period grades to the official student_grades record the student
  // portal reads. Upsert on the unique (student, cst, period) key.
  async upsertStudentGrades(rows) {
    const { error } = await supabase
      .from("student_grades")
      .upsert(rows, {
        onConflict: "student_id,class_subject_teacher_id,grading_period_id",
      });
    if (error) throw error;
  },

  // ── Grade categories (item 8) ───────────────────────────────
  async fetchCategories(cstId) {
    const { data, error } = await supabase
      .from("grade_categories")
      .select("id, name, weight")
      .eq("class_subject_teacher_id", cstId)
      .order("name");
    if (error) throw error;
    return data;
  },

  async insertCategory(payload) {
    const { error } = await supabase.from("grade_categories").insert(payload);
    if (error) throw error;
  },

  async updateCategory(id, payload) {
    const { error } = await supabase
      .from("grade_categories")
      .update(payload)
      .eq("id", id);
    if (error) throw error;
  },

  async deleteCategory(id) {
    // assignments.category_id is ON DELETE SET NULL — assignments survive and
    // fall back to flat weighting.
    const { error } = await supabase
      .from("grade_categories")
      .delete()
      .eq("id", id);
    if (error) throw error;
  },

  // ── Column grade entry (item 4) ─────────────────────────────
  // Every student's score for ONE assignment, for the whole-class entry grid.
  async fetchAssignmentColumn(assignmentId) {
    const { data, error } = await supabase
      .from("assignment_grades")
      .select("student_id, score, note, graded_at")
      .eq("assignment_id", assignmentId);
    if (error) throw error;
    return data;
  },

  // ── Absence summary (item 3) ────────────────────────────────
  // Raw status rows for a section; aggregated client-side into per-student counts.
  async fetchClassAttendance(classId) {
    const { data, error } = await supabase
      .from("attendance")
      .select("student_id, status")
      .eq("class_id", classId);
    if (error) throw error;
    return data;
  },

  // ── Today (item 7) ──────────────────────────────────────────
  async fetchScheduleToday(teacherId, dayOfWeek) {
    const { data, error } = await supabase
      .from("schedules")
      .select(
        `
        id, class_id, subject_id, day_of_week, start_time, end_time,
        classes!class_id(display_name),
        subjects!subject_id(name, color),
        rooms!room_id(name)
      `,
      )
      .eq("teacher_id", teacherId)  
      .eq("day_of_week", dayOfWeek)
      .order("start_time");
    if (error) throw error;
    return data;
  },
};

// ───────────────────────────────────────────────────────────────
//  3. UI HELPERS
// ───────────────────────────────────────────────────────────────

// ── Toast ──────────────────────────────────────────────────────
const toastContainer = document.getElementById("toast-container");

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  const icon = type === "success" ? "check_circle" : "error";
  toast.innerHTML = `<span class="material-symbols-outlined">${icon}</span>${message}`;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ── Generic Modal ──────────────────────────────────────────────
const modalOverlay = document.getElementById("modal-overlay");
const modalTitle = document.getElementById("modal-title");
const modalForm = document.getElementById("modal-form");
const modalClose = document.getElementById("modal-close");
const modalCancel = document.getElementById("modal-cancel");
const modalSubmit = document.getElementById("modal-submit");

let currentSubmitHandler = null;

function openModal({ title, fields, onSubmit, submitLabel = "Save" }) {
  modalTitle.textContent = title;
  modalSubmit.textContent = submitLabel;
  modalForm.innerHTML = "";

  fields.forEach((field) => {
    const group = document.createElement("div");
    group.className = "field-group";

    const label = document.createElement("label");
    label.textContent = field.label;
    label.htmlFor = `modal-field-${field.name}`;
    group.appendChild(label);

    let input;

    if (field.type === "select") {
      input = document.createElement("select");
      input.id = `modal-field-${field.name}`;
      input.name = field.name;
      if (field.required) input.required = true;

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = field.required
        ? `Select ${field.label.toLowerCase()}...`
        : "— None —";
      input.appendChild(placeholder);

      (field.options ?? []).forEach((opt) => {
        const o = document.createElement("option");
        o.value = opt.value;
        o.textContent = opt.label;
        if (String(opt.value) === String(field.value)) o.selected = true;
        input.appendChild(o);
      });
    } else if (field.type === "textarea") {
      input = document.createElement("textarea");
      input.id = `modal-field-${field.name}`;
      input.name = field.name;
      input.rows = 3;
      input.value = field.value ?? "";
      if (field.placeholder) input.placeholder = field.placeholder;
    } else {
      input = document.createElement("input");
      input.id = `modal-field-${field.name}`;
      input.type = field.type ?? "text";
      input.name = field.name;
      input.value = field.value ?? "";
      if (field.required) input.required = true;
      if (field.placeholder) input.placeholder = field.placeholder;
      if (field.min != null) input.min = field.min;
      if (field.max != null) input.max = field.max;
      if (field.step != null) input.step = field.step;
    }

    // Disabled fields render but are excluded from FormData on submit — used for
    // read-only context like national_id (registrar-owned).
    if (field.disabled) input.disabled = true;

    group.appendChild(input);

    if (field.help) {
      const help = document.createElement("small");
      help.className = "field-help";
      help.textContent = field.help;
      group.appendChild(help);
    }

    modalForm.appendChild(group);
  });

  if (currentSubmitHandler)
    modalForm.removeEventListener("submit", currentSubmitHandler);

  currentSubmitHandler = async (e) => {
    e.preventDefault();
    const formData = Object.fromEntries(new FormData(modalForm));
    modalSubmit.disabled = true;
    try {
      await onSubmit(formData);
      closeModal();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      modalSubmit.disabled = false;
    }
  };

  modalForm.addEventListener("submit", currentSubmitHandler);
  modalOverlay.classList.add("active");
}

function closeModal() {
  modalOverlay.classList.remove("active");
  modalForm.innerHTML = "";
  if (currentSubmitHandler) {
    modalForm.removeEventListener("submit", currentSubmitHandler);
    currentSubmitHandler = null;
  }
}

modalClose.addEventListener("click", closeModal);
modalCancel.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});

// ── Confirm Modal ──────────────────────────────────────────────
const confirmOverlay = document.getElementById("confirm-overlay");
const confirmMessage = document.getElementById("confirm-message");
const confirmDelete = document.getElementById("confirm-delete");
const confirmCancel = document.getElementById("confirm-cancel");

let confirmHandler = null;

function openConfirm(message, onConfirm) {
  confirmMessage.textContent = message;
  confirmHandler = onConfirm;
  confirmOverlay.classList.add("active");
}

function closeConfirm() {
  confirmOverlay.classList.remove("active");
  confirmHandler = null;
}

confirmDelete.addEventListener("click", async () => {
  if (!confirmHandler) return;
  confirmDelete.disabled = true;
  try {
    await confirmHandler();
    closeConfirm();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    confirmDelete.disabled = false;
  }
});
confirmCancel.addEventListener("click", closeConfirm);
confirmOverlay.addEventListener("click", (e) => {
  if (e.target === confirmOverlay) closeConfirm();
});

// ── Student drawer ─────────────────────────────────────────────
const drawerOverlay = document.getElementById("drawer-overlay");
const drawerTitle = document.getElementById("drawer-title");
const drawerBody = document.getElementById("drawer-body");

function openDrawer() {
  drawerOverlay.classList.add("active");
}
function closeDrawer() {
  drawerOverlay.classList.remove("active");
}
document.getElementById("drawer-close").addEventListener("click", closeDrawer);
drawerOverlay.addEventListener("click", (e) => {
  if (e.target === drawerOverlay) closeDrawer();
});

// ── Gradebook: Manage Assignments + per-student grade modals ────
const assignmentsOverlay = document.getElementById("assignments-overlay");
const manageTitle = document.getElementById("manage-title");
const manageBody = document.getElementById("manage-body");

document
  .getElementById("manage-close")
  .addEventListener("click", closeManageAssignments);
document
  .getElementById("manage-done")
  .addEventListener("click", closeManageAssignments);
document
  .getElementById("manage-add")
  .addEventListener("click", () => openAddAssignment());
assignmentsOverlay.addEventListener("click", (e) => {
  if (e.target === assignmentsOverlay) closeManageAssignments();
});

const sgOverlay = document.getElementById("student-grades-overlay");
const sgTitle = document.getElementById("sg-title");
const sgBody = document.getElementById("sg-body");
const sgSave = document.getElementById("sg-save");

document
  .getElementById("sg-close")
  .addEventListener("click", closeStudentGradesModal);
document
  .getElementById("sg-cancel")
  .addEventListener("click", closeStudentGradesModal);
sgSave.addEventListener("click", saveStudentGrades);
sgOverlay.addEventListener("click", (e) => {
  if (e.target === sgOverlay) closeStudentGradesModal();
});

// Per-assignment grade unlock: clicking an Edit button unlocks ONLY that one
// score input (delegated because sgBody is re-rendered on every open).
sgBody.addEventListener("click", (e) => {
  const btn = e.target.closest(".sg-edit-btn");
  if (!btn) return;
  const input = sgBody.querySelector(
    `.sg-score[data-assignment="${btn.dataset.assignment}"]`,
  );
  if (input) {
    input.readOnly = false;
    input.classList.remove("sg-locked");
    input.focus();
    input.select();
  }
  btn.remove();
});

// ── Grade categories modal (item 8) ────────────────────────────
const categoriesOverlay = document.getElementById("categories-overlay");
const categoriesTitle = document.getElementById("categories-title");
const categoriesBody = document.getElementById("categories-body");
const categoriesTotal = document.getElementById("categories-total");

document
  .getElementById("categories-close")
  .addEventListener("click", closeCategoriesModal);
document
  .getElementById("categories-done")
  .addEventListener("click", closeCategoriesModal);
document
  .getElementById("categories-add")
  .addEventListener("click", () => openCategoryForm());
categoriesOverlay.addEventListener("click", (e) => {
  if (e.target === categoriesOverlay) closeCategoriesModal();
});

// ── Post grades modal (item 1) ─────────────────────────────────
const pgOverlay = document.getElementById("post-grades-overlay");
const pgTitle = document.getElementById("pg-title");
const pgBody = document.getElementById("pg-body");
const pgSave = document.getElementById("pg-save");

document.getElementById("pg-close").addEventListener("click", closePostGrades);
document.getElementById("pg-cancel").addEventListener("click", closePostGrades);
pgSave.addEventListener("click", savePostGrades);
pgOverlay.addEventListener("click", (e) => {
  if (e.target === pgOverlay) closePostGrades();
});

// ── Column grade entry modal (item 4) ──────────────────────────
const cgOverlay = document.getElementById("column-grades-overlay");
const cgTitle = document.getElementById("cg-title");
const cgBody = document.getElementById("cg-body");
const cgSave = document.getElementById("cg-save");

document
  .getElementById("cg-close")
  .addEventListener("click", closeColumnGrades);
document
  .getElementById("cg-cancel")
  .addEventListener("click", closeColumnGrades);
cgSave.addEventListener("click", saveColumnGrades);
cgOverlay.addEventListener("click", (e) => {
  if (e.target === cgOverlay) closeColumnGrades();
});

// Print progress report from the open student drawer (item 6).
document
  .getElementById("drawer-print")
  .addEventListener("click", printStudentReport);

// Discipline add/edit launched from the drawer (item 2). Delegated because the
// drawer body is re-rendered on every open.
drawerBody.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  if (btn.dataset.action === "add-discipline") {
    openAddDiscipline();
  } else if (btn.dataset.action === "edit-discipline") {
    const rec = (_drawerData.discipline ?? []).find(
      (r) => String(r.id) === btn.dataset.id,
    );
    if (rec) openEditDiscipline(rec);
  }
});

// ── Table helpers ──────────────────────────────────────────────
function renderEmptyRow(tbodyId, colspan, message = "No records found.") {
  const tbody = document.getElementById(tbodyId);
  if (tbody)
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="loading-cell">${message}</td></tr>`;
}

function renderErrorRow(tbodyId, colspan) {
  renderEmptyRow(tbodyId, colspan, "Failed to load data. Please try again.");
}

function makeActionBtn(icon, label, onClick, danger = false, adminOnly = false) {
  const btn = document.createElement("button");
  btn.className = `btn-icon${danger ? " danger" : ""}`;
  btn.type = "button";
  btn.innerHTML = `<span class="material-symbols-outlined">${icon}</span>`;
  // Admin-restricted icon buttons reuse the single gate: applyAdminLock sets the
  // tooltip to the Spanish message and makes the click a no-op. Everyone else
  // gets the normal label tooltip + real handler.
  if (adminOnly && !IS_ADMIN) {
    applyAdminLock(btn);
  } else {
    btn.title = label;
    btn.addEventListener("click", onClick);
  }
  return btn;
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

// Distinct class options across the teacher's subject-sections.
function teacherClassOptions() {
  const seen = new Set();
  const opts = [];
  myClassesCache.forEach((cst) => {
    if (seen.has(cst.class_id)) return;
    seen.add(cst.class_id);
    opts.push({
      value: cst.class_id,
      label: cst.classes?.display_name ?? `Class ${cst.class_id}`,
    });
  });
  return opts;
}

// Current grading period = the one whose date range contains today,
// otherwise the first period (demo seed dates may be in the past).
// Single source of truth for the gradebook default AND the roster Overall.
function getCurrentPeriodId() {
  const today = new Date().toISOString().split("T")[0];
  const inRange = PERIODS.find(
    (p) => p.start_date <= today && today <= p.end_date,
  );
  return (inRange ?? PERIODS[0])?.id ?? "";
}

// Grade colour band: red <70, amber 70–74.99, green ≥75. Reuses the
// shared .score-low / .score-mid / .score-high classes from style.css.
function gradeBandClass(score) {
  if (score == null) return "";
  const n = Number(score);
  if (n < 70) return "score-low";
  if (n < 75) return "score-mid";
  return "score-high";
}

// Render one grade cell: colored value, or a neutral placeholder when ungraded
// (never a colored zero). Used by the roster grade columns + Overall.
function gradeCellHtml(score) {
  return score == null
    ? '<span class="text-muted">—</span>'
    : `<b class="${gradeBandClass(score)}">${Number(score).toFixed(1)}</b>`;
}

// Weighted Overall across the periods that have a grade, renormalizing the
// grading_periods.weight values so a missing period is excluded (never 0).
function weightedOverall(scoreByOrder) {
  let sum = 0;
  let wTot = 0;
  PERIODS.forEach((p) => {
    const s = scoreByOrder[p.period_order];
    if (s == null) return;
    const w = Number(p.weight) || 0;
    sum += Number(s) * w;
    wTot += w;
  });
  return wTot > 0 ? sum / wTot : null;
}

// Display status for one (student, assignment) grade record. No submission date
// exists in the schema, so "Late" derives from graded_at vs the due_date.
function gradeStatus(grade, dueDate) {
  if (!grade || grade.score == null)
    return { label: "Not graded", cls: "badge-neutral" };
  if (dueDate && grade.graded_at && grade.graded_at.slice(0, 10) > dueDate)
    return { label: "Late", cls: "badge-warning" };
  return { label: "Graded", cls: "badge-success" };
}

// "2024-12-13" / ISO timestamp → friendly date, or "—" when absent.
function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? escapeHtml(value)
    : d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

// ───────────────────────────────────────────────────────────────
//  4. NAVIGATION (class-first)
// ───────────────────────────────────────────────────────────────
const sections = document.querySelectorAll(".view-section");
const navLinks = document.querySelectorAll(".sidebar a[data-page]");

let myClassesCache = [];
let currentClass = null; // { cstId, classId, subjectId, names, color }
const loaded = { subjects: false };

function showSection(page) {
  sections.forEach((s) => s.classList.remove("active"));
  navLinks.forEach((a) => a.classList.remove("active"));

  const target = document.getElementById(`view-${page}`);
  if (target) target.classList.add("active");

  // Class workspace keeps "My Classes" highlighted in the sidebar.
  const navPage = page === "class" ? "myclasses" : page;
  document
    .querySelector(`.sidebar a[data-page="${navPage}"]`)
    ?.classList.add("active");

  if (page === "today") loadToday();
  if (page === "myclasses") loadMyClasses();
  if (page === "subjects" && !loaded.subjects) {
    loaded.subjects = true;
    loadSubjects();
  }
}

navLinks.forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    showSection(link.dataset.page);
    document.querySelector("aside").classList.remove("active");
  });
});

document.getElementById("menu-btn")?.addEventListener("click", () => {
  document.querySelector("aside").classList.toggle("active");
});
document.getElementById("close-btn")?.addEventListener("click", () => {
  document.querySelector("aside").classList.remove("active");
});
document.getElementById("logout-btn")?.addEventListener("click", async () => {
  await signOut();
  window.location.replace("/login.html");
});
initTheme();
bindThemeToggle(document.querySelector(".theme-toggler"));

document.getElementById("class-back-btn")?.addEventListener("click", () => {
  showSection("myclasses");
});

document.querySelectorAll(".class-subtab").forEach((btn) => {
  btn.addEventListener("click", () => openClassTab(btn.dataset.tab));
});

// ───────────────────────────────────────────────────────────────
//  5. MY CLASSES LANDING
// ───────────────────────────────────────────────────────────────
async function loadMyClasses() {
  const grid = document.getElementById("myclasses-grid");
  const subtitle = document.getElementById("myclasses-subtitle");
  grid.innerHTML = skeletonCardItems(3);

  try {
    const [classes, counts] = await Promise.all([
      db.fetchMyClasses(TEACHER_ID, ACTIVE_YEAR.id),
      db.fetchActiveCountByClass(),
    ]);
    myClassesCache = classes;

    const totalStudents = [...new Set(classes.map((c) => c.class_id))].reduce(
      (sum, classId) => sum + (counts[classId] ?? 0),
      0,
    );
    subtitle.textContent = `${ACTIVE_YEAR.name} · ${classes.length} section${
      classes.length === 1 ? "" : "s"
    } · ${totalStudents} students`;

    renderQuickStats(classes.length, totalStudents);
    renderMyClasses(classes, counts);
  } catch (err) {
    console.error(err);
    grid.innerHTML =
      '<div class="loading-cell">Failed to load your classes.</div>';
  }
}

function renderMyClasses(classes, counts) {
  const grid = document.getElementById("myclasses-grid");
  if (!classes.length) {
    grid.innerHTML =
      '<div class="loading-cell">You have no classes assigned this school year.</div>';
    return;
  }

  grid.innerHTML = "";
  classes.forEach((cst) => {
    const color = cst.subjects?.color || "var(--color-primary)";
    const count = counts[cst.class_id] ?? 0;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "class-card";
    card.style.setProperty("--accent", color);
    card.innerHTML = `
      <span class="class-card-accent"></span>
      <div class="class-card-body">
        <h3 class="class-card-subject">${escapeHtml(cst.subjects?.name ?? "—")}</h3>
        <p class="class-card-section">${escapeHtml(cst.classes?.display_name ?? "—")} · ${escapeHtml(
          cst.classes?.grade_levels?.name ?? "",
        )}</p>
        <p class="class-card-count">
          <span class="material-symbols-outlined">group</span>
          ${count} student${count === 1 ? "" : "s"}
        </p>
      </div>
      <span class="material-symbols-outlined class-card-arrow">chevron_right</span>
    `;
    card.addEventListener("click", () => openClassWorkspace(cst));
    grid.appendChild(card);
  });
}

function renderQuickStats(sectionCount, totalStudents) {
  const el = document.getElementById("quick-stats-list");
  el.innerHTML = `
    <span class="qstat"><span class="material-symbols-outlined">co_present</span>${sectionCount} sections</span>
    <span class="qstat"><span class="material-symbols-outlined">group</span>${totalStudents} students</span>
    <span class="qstat"><span class="material-symbols-outlined">calendar_today</span>${escapeHtml(ACTIVE_YEAR.name)}</span>`;
}

// ───────────────────────────────────────────────────────────────
//  6. CLASS WORKSPACE SHELL
// ───────────────────────────────────────────────────────────────
function openClassWorkspace(cst, initialTab = "roster") {
  currentClass = {
    cstId: cst.id,
    classId: cst.class_id,
    subjectId: cst.subject_id,
    className: cst.classes?.display_name ?? "—",
    subjectName: cst.subjects?.name ?? "—",
    color: cst.subjects?.color || "var(--color-primary)",
    gradeLevel: cst.classes?.grade_levels?.name ?? "",
  };

  document.getElementById("class-ws-title").textContent =
    `${currentClass.subjectName} · ${currentClass.className}`;
  document.getElementById("class-ws-subtitle").textContent =
    `${currentClass.gradeLevel} · ${ACTIVE_YEAR.name}`;
  document.getElementById("class-ws-dot").style.background = currentClass.color;

  showSection("class");
  openClassTab(initialTab);
}

function openClassTab(tab) {
  document
    .querySelectorAll(".class-subtab")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));

  const content = document.getElementById("class-tab-content");
  const renderers = {
    roster: renderRosterTab,
    gradebook: renderGradebookTab,
    attendance: renderAttendanceTab,
    schedule: renderScheduleTab,
  };
  (renderers[tab] ?? renderRosterTab)(content);
}

// ───────────────────────────────────────────────────────────────
//  7. ROSTER TAB (+ student drawer)
// ───────────────────────────────────────────────────────────────
function renderRosterTab(content) {
  content.innerHTML = `
    <div class="view-toolbar">
      <div class="search-bar">
        <span class="material-symbols-outlined">search</span>
        <input type="search" id="roster-search" placeholder="Search this roster…" />
      </div>
      <button class="btn btn-primary" id="btn-add-student">
        <span class="material-symbols-outlined">person_add</span> Add Student
      </button>
    </div>
    <div class="recent-activity">
      <div class="roster-list" id="roster-list">
        <div class="roster-head">
          <div class="roster-row-cells">
            <span>Name</span>
            <span>P1 Grade</span>
            <span>P2 Grade</span>
            <span>P3 Grade</span>
            <span>Overall Grade</span>
          </div>
        </div>
        <div id="roster-body">
          ${skeletonBlock(5)}
        </div>
      </div>
    </div>`;

  bindAdminAction(document.getElementById("btn-add-student"), openAddStudent);

  let searchTimeout;
  document.getElementById("roster-search").addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    const q = e.target.value.trim().toLowerCase();
    searchTimeout = setTimeout(() => renderRosterTable(filterRoster(q)), 250);
  });

  loadRoster();
}

let _rosterCache = [];
let _rosterPeriodGrades = {}; // student_id → { [period_order]: period_score }

async function loadRoster() {
  try {
    const [roster, periodGrades] = await Promise.all([
      db.fetchRoster(currentClass.classId),
      db.fetchAllPeriodGrades(currentClass.cstId),
    ]);
    _rosterCache = roster;

    const orderByPeriodId = Object.fromEntries(
      PERIODS.map((p) => [p.id, p.period_order]),
    );
    _rosterPeriodGrades = {};
    periodGrades.forEach((g) => {
      const order = orderByPeriodId[g.grading_period_id];
      if (order == null) return;
      (_rosterPeriodGrades[g.student_id] ??= {})[order] = g.period_score;
    });

    renderRosterTable(_rosterCache);
  } catch (err) {
    console.error(err);
    const body = document.getElementById("roster-body");
    if (body)
      body.innerHTML =
        '<div class="loading-cell">Failed to load data. Please try again.</div>';
  }
}

function filterRoster(q) {
  if (!q) return _rosterCache;
  return _rosterCache.filter(
    (s) =>
      s.first_name?.toLowerCase().includes(q) ||
      s.last_name?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q) ||
      s.enrollment_number?.toLowerCase().includes(q),
  );
}

function renderRosterTable(students) {
  const body = document.getElementById("roster-body");
  if (!body) return;
  if (!students.length) {
    body.innerHTML =
      '<div class="loading-cell">No students in this section.</div>';
    return;
  }

  body.innerHTML = "";
  students.forEach((student) => {
    const fullName = `${student.last_name}, ${student.first_name}`;
    const scores = _rosterPeriodGrades[student.id] ?? {};
    const overall = weightedOverall(scores);

    const row = document.createElement("div");
    row.className = "roster-row";

    // Clickable unit — the whole cells block opens the student-360 drawer.
    const cells = document.createElement("div");
    cells.className = "roster-row-cells";
    cells.setAttribute("role", "button");
    cells.tabIndex = 0;
    cells.innerHTML = `
      <span class="roster-name">${escapeHtml(fullName)}</span>
      <span class="roster-grade">${gradeCellHtml(scores[1])}</span>
      <span class="roster-grade">${gradeCellHtml(scores[2])}</span>
      <span class="roster-grade">${gradeCellHtml(scores[3])}</span>
      <span class="roster-grade">${gradeCellHtml(overall)}</span>`;
    cells.addEventListener("click", () => openStudentDrawer(student));
    cells.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openStudentDrawer(student);
      }
    });

    // Action rail — lives outside the clickable cells; revealed on hover/focus.
    const rail = document.createElement("div");
    rail.className = "roster-row-rail";
    rail.appendChild(
      makeActionBtn(
        "edit",
        "Edit",
        (e) => {
          e.stopPropagation();
          openEditStudent(student);
        },
        false,
        true,
      ),
    );
    rail.appendChild(
      makeActionBtn(
        "delete",
        "Delete",
        (e) => {
          e.stopPropagation();
          confirmDeleteStudent(
            student.id,
            `${student.first_name} ${student.last_name}`,
          );
        },
        true,
        true,
      ),
    );

    row.append(cells, rail);
    body.appendChild(row);
  });
}

let _drawerStudent = null;
let _drawerData = {};

async function openStudentDrawer(student) {
  _drawerStudent = student;
  drawerTitle.textContent = `${student.first_name} ${student.last_name}`;
  drawerBody.innerHTML = skeletonBlock();
  openDrawer();

  const periodId = getCurrentPeriodId();
  const periodName = PERIODS.find((p) => p.id === periodId)?.name ?? "";

  // Each section degrades independently — one failure shouldn't blank the rest.
  const [contacts, attendance, discipline, subjectGrades] = await Promise.all([
    db.fetchStudentContacts(student.id).catch(() => []),
    db.fetchStudentAttendance(student.id).catch(() => []),
    db.fetchStudentDiscipline(student.id).catch(() => []),
    db.fetchStudentSubjectGrades(student.id, periodId).catch(() => []),
  ]);
  _drawerData = { contacts, attendance, discipline, subjectGrades };

  const photo = student.photo_url
    ? `<img class="drawer-photo" src="${escapeHtml(student.photo_url)}" alt="" referrerpolicy="no-referrer" />`
    : `<div class="drawer-photo drawer-photo-empty"><span class="material-symbols-outlined">person</span></div>`;

  drawerBody.innerHTML = `
    <div class="drawer-section drawer-identity">
      ${photo}
      <ul class="drawer-contact">
        <li><span class="material-symbols-outlined">badge</span> ${escapeHtml(student.enrollment_number ?? "—")}</li>
        <li><span class="material-symbols-outlined">fingerprint</span> ${escapeHtml(student.national_id ?? "—")}</li>
        <li><span class="material-symbols-outlined">cake</span> ${escapeHtml(formatDate(student.date_of_birth))}</li>
        <li><span class="material-symbols-outlined">wc</span> ${escapeHtml(genderLabel(student.gender))}</li>
        <li><span class="material-symbols-outlined">mail</span> ${escapeHtml(student.email ?? "—")}</li>
        <li><span class="material-symbols-outlined">call</span> ${escapeHtml(student.phone ?? "—")}</li>
        <li><span class="material-symbols-outlined">home</span> ${escapeHtml(student.address ?? "—")}</li>
        <li><span class="material-symbols-outlined">info</span> ${escapeHtml(student.status ?? "—")}</li>
      </ul>
    </div>
    <div class="drawer-section">
      <h3>Attendance</h3>
      ${renderDrawerAttendance(attendance)}
    </div>
    <div class="drawer-section">
      <h3>Grades${periodName ? ` · ${escapeHtml(periodName)}` : ""}</h3>
      ${renderDrawerSubjectGrades(subjectGrades)}
    </div>
    <div class="drawer-section">
      <div class="drawer-section-head">
        <h3>Discipline</h3>
        <button type="button" class="link-btn" data-action="add-discipline">+ Add record</button>
      </div>
      ${renderDrawerDiscipline(discipline)}
    </div>
    <div class="drawer-section">
      <h3>Guardians &amp; contacts</h3>
      ${renderDrawerGuardians(contacts)}
    </div>`;
}

function renderDrawerGuardians(contacts) {
  if (!contacts.length) return '<p class="drawer-muted">No guardians on file.</p>';
  return contacts
    .map((c) => {
      const g = c.guardians ?? {};
      const primary = c.is_primary
        ? '<span class="badge badge-primary">Primary</span>'
        : "";
      return `
      <div class="drawer-card">
        <div class="drawer-card-head">
          <b>${escapeHtml(g.first_name ?? "")} ${escapeHtml(g.last_name ?? "")}</b>
          <span class="drawer-rel">${escapeHtml(g.relationship ?? "Guardian")}</span>
          ${primary}
        </div>
        <ul class="drawer-contact">
          ${g.phone ? `<li><span class="material-symbols-outlined">call</span> ${escapeHtml(g.phone)}</li>` : ""}
          ${g.alt_phone ? `<li><span class="material-symbols-outlined">call</span> ${escapeHtml(g.alt_phone)} (alt)</li>` : ""}
          ${g.email ? `<li><span class="material-symbols-outlined">mail</span> ${escapeHtml(g.email)}</li>` : ""}
        </ul>
      </div>`;
    })
    .join("");
}

function renderDrawerAttendance(rows) {
  if (!rows.length) return '<p class="drawer-muted">No attendance recorded.</p>';
  const counts = { present: 0, absent: 0, late: 0, excused: 0 };
  rows.forEach((r) => {
    if (counts[r.status] != null) counts[r.status] += 1;
  });
  const rate = Math.round(((counts.present + counts.late) / rows.length) * 100);
  return `
    <div class="drawer-attendance">
      <span class="att-chip att-present">${counts.present} present</span>
      <span class="att-chip att-absent">${counts.absent} absent</span>
      <span class="att-chip att-late">${counts.late} late</span>
      <span class="att-chip att-excused">${counts.excused} excused</span>
    </div>
    <p class="drawer-muted">${rate}% attendance across ${rows.length} day${rows.length === 1 ? "" : "s"}.</p>`;
}

function renderDrawerSubjectGrades(rows) {
  if (!rows.length) return '<p class="drawer-muted">No grades recorded for this period.</p>';
  return `<ul class="drawer-grades">${rows
    .map((r) => {
      const subject = r.class_subject_teachers?.subjects?.name ?? "—";
      const score = r.score;
      const cell =
        score == null
          ? '<span class="text-muted">—</span>'
          : `<b class="${gradeBandClass(score)}">${Number(score).toFixed(1)}</b>`;
      return `<li><span>${escapeHtml(subject)}</span>${cell}</li>`;
    })
    .sort()
    .join("")}</ul>`;
}

function renderDrawerDiscipline(rows) {
  if (!rows.length) return '<p class="drawer-muted">No discipline records. ✔</p>';
  const sevBadge = { low: "badge-neutral", medium: "badge-warning", high: "badge-danger" };
  return rows
    .map((r) => {
      const sev = sevBadge[r.severity] ?? "badge-neutral";
      const state = r.resolved
        ? '<span class="badge badge-success">Resolved</span>'
        : '<span class="badge badge-warning">Open</span>';
      return `
      <div class="drawer-card">
        <div class="drawer-card-head">
          <b>${escapeHtml(r.type ?? "Incident")}</b>
          <span class="badge ${sev}">${escapeHtml(r.severity ?? "—")}</span>
          ${state}
          <button type="button" class="btn-icon drawer-card-edit" title="Edit"
            data-action="edit-discipline" data-id="${r.id}">
            <span class="material-symbols-outlined">edit</span>
          </button>
        </div>
        <p class="drawer-muted">${escapeHtml(r.date ?? "")}${r.description ? " · " + escapeHtml(r.description) : ""}</p>
        ${r.resolved && r.resolution ? `<p class="drawer-muted">Resolution: ${escapeHtml(r.resolution)}</p>` : ""}
      </div>`;
    })
    .join("");
}

async function openAddStudent() {
  openModal({
    title: `Add Student — ${currentClass.className}`,
    submitLabel: "Add Student",
    fields: [
      {
        name: "enrollment_number",
        label: "Enrollment #",
        type: "text",
        required: true,
        placeholder: "e.g. 2024-001",
      },
      {
        name: "first_name",
        label: "First Name",
        type: "text",
        required: true,
      },
      { name: "last_name", label: "Last Name", type: "text", required: true },
      { name: "email", label: "Email", type: "email" },
      { name: "phone", label: "Phone", type: "text" },
      { name: "date_of_birth", label: "Date of Birth", type: "date" },
      {
        name: "gender",
        label: "Gender",
        type: "select",
        options: GENDER_OPTIONS,
      },
      {
        name: "enrollment_date",
        label: "Enrollment Date",
        type: "date",
        value: new Date().toISOString().split("T")[0],
      },
      { name: "address", label: "Address", type: "textarea" },
      { name: "photo_url", label: "Photo URL", type: "url" },
      {
        name: "class_id",
        label: "Class",
        type: "select",
        required: true,
        value: currentClass.classId,
        options: teacherClassOptions(),
      },
    ],
    onSubmit: async (formData) => {
      await db.insertStudent({
        enrollment_number: formData.enrollment_number.trim(),
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        email: formData.email?.trim() || null,
        phone: formData.phone?.trim() || null,
        date_of_birth: formData.date_of_birth || null,
        gender: formData.gender || null,
        enrollment_date: formData.enrollment_date || null,
        address: formData.address?.trim() || null,
        photo_url: formData.photo_url?.trim() || null,
        class_id: Number(formData.class_id),
        status: "active",
      });
      showToast(`${formData.first_name} ${formData.last_name} added.`);
      loadRoster();
    },
  });
}

function openEditStudent(student) {
  openModal({
    title: "Edit Student",
    submitLabel: "Save Changes",
    fields: [
      {
        name: "first_name",
        label: "First Name",
        type: "text",
        required: true,
        value: student.first_name,
      },
      {
        name: "last_name",
        label: "Last Name",
        type: "text",
        required: true,
        value: student.last_name,
      },
      { name: "email", label: "Email", type: "email", value: student.email ?? "" },
      { name: "phone", label: "Phone", type: "text", value: student.phone ?? "" },
      {
        name: "national_id",
        label: "National ID (cédula/DUI)",
        type: "text",
        value: student.national_id ?? "",
        disabled: true,
        help: "Registrar-managed — read-only here.",
      },
      {
        name: "date_of_birth",
        label: "Date of Birth",
        type: "date",
        value: student.date_of_birth ?? "",
      },
      {
        name: "gender",
        label: "Gender",
        type: "select",
        value: student.gender ?? "",
        options: GENDER_OPTIONS,
      },
      {
        name: "enrollment_date",
        label: "Enrollment Date",
        type: "date",
        value: student.enrollment_date ?? "",
      },
      {
        name: "address",
        label: "Address",
        type: "textarea",
        value: student.address ?? "",
      },
      {
        name: "photo_url",
        label: "Photo URL",
        type: "url",
        value: student.photo_url ?? "",
      },
      {
        name: "class_id",
        label: "Class",
        type: "select",
        required: true,
        value: currentClass.classId,
        options: teacherClassOptions(),
      },
      {
        name: "status",
        label: "Status",
        type: "select",
        required: true,
        value: student.status,
        options: [
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
          { value: "graduated", label: "Graduated" },
          { value: "transferred", label: "Transferred" },
          { value: "withdrawn", label: "Withdrawn" },
        ],
      },
    ],
    onSubmit: async (formData) => {
      // national_id is a disabled field — excluded from FormData, never updated.
      await db.updateStudent(student.id, {
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        email: formData.email?.trim() || null,
        phone: formData.phone?.trim() || null,
        date_of_birth: formData.date_of_birth || null,
        gender: formData.gender || null,
        enrollment_date: formData.enrollment_date || null,
        address: formData.address?.trim() || null,
        photo_url: formData.photo_url?.trim() || null,
        class_id: Number(formData.class_id),
        status: formData.status,
      });
      showToast(`${formData.first_name} ${formData.last_name} updated.`);
      loadRoster();
    },
  });
}

function confirmDeleteStudent(id, name) {
  openConfirm(
    `Delete "${name}"? This removes their record permanently and cannot be undone.`,
    async () => {
      await db.deleteStudent(id);
      showToast(`${name} deleted.`);
      loadRoster();
    },
  );
}

// ───────────────────────────────────────────────────────────────
//  8. GRADEBOOK TAB (assignments + scores — the core)
// ───────────────────────────────────────────────────────────────
let gradebookState = null; // { cstId, periodId, assignments, students }

function renderGradebookTab(content) {
  const periodOptions = PERIODS.map(
    (p) =>
      `<option value="${p.id}">${escapeHtml(p.name)}</option>`,
  ).join("");

  content.innerHTML = `
    <div class="view-toolbar">
      <div class="toolbar-filters">
        <label for="gradebook-period">Period:</label>
        <select id="gradebook-period">${periodOptions}</select>
      </div>
      <div class="toolbar-actions">
        <button class="btn btn-ghost" id="btn-categories">
          <span class="material-symbols-outlined">category</span> Categories
        </button>
        <button class="btn btn-secondary" id="btn-manage-assignments">
          <span class="material-symbols-outlined">list_alt</span> Manage assignments
        </button>
        <button class="btn btn-primary" id="btn-add-assignment">
          <span class="material-symbols-outlined">add</span> Add Assignment
        </button>
        <button class="btn btn-primary" id="btn-post-grades">
          <span class="material-symbols-outlined">grading</span> Post grades
        </button>
      </div>
    </div>
    <div class="recent-activity">
      <div id="gradebook-grid">${skeletonBlock(4)}</div>
    </div>`;

  const periodSelect = document.getElementById("gradebook-period");
  periodSelect.value = getCurrentPeriodId();
  periodSelect.addEventListener("change", loadGradebook);

  document
    .getElementById("btn-add-assignment")
    .addEventListener("click", openAddAssignment);
  document
    .getElementById("btn-manage-assignments")
    .addEventListener("click", openManageAssignments);
  document
    .getElementById("btn-categories")
    .addEventListener("click", openCategoriesModal);
  document
    .getElementById("btn-post-grades")
    .addEventListener("click", openPostGrades);

  loadGradebook();
}

async function loadGradebook() {
  const grid = document.getElementById("gradebook-grid");
  const periodId = Number(document.getElementById("gradebook-period").value);
  const cstId = currentClass.cstId;
  grid.innerHTML = skeletonBlock(4);

  try {
    const [assignments, roster, periodGrades, categories] = await Promise.all([
      db.fetchAssignments(cstId, periodId),
      db.fetchRoster(currentClass.classId),
      db.fetchPeriodGrades(cstId, periodId),
      db.fetchCategories(cstId),
    ]);
    const students = roster.filter((s) => s.status === "active");

    gradebookState = { cstId, periodId, assignments, students, categories };
    renderGradebook(assignments, students, periodGrades);

    // Keep an open Manage Assignments list in sync after add/edit/delete.
    if (assignmentsOverlay.classList.contains("active")) renderManageAssignments();
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<div class="loading-cell">Failed to load gradebook: ${escapeHtml(err.message)}</div>`;
  }
}

// Clean, scannable table: one row per student → name, current-period grade
// (colored by the standard bands), completion count. Grade entry lives in the
// per-student modal opened by clicking the row.
function renderGradebook(assignments, students, periodGrades) {
  const grid = document.getElementById("gradebook-grid");

  if (!assignments.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-outlined">assignment</span>
        <p>No assignments yet for this period.</p>
        <p class="empty-sub">Add an assignment to start grading.</p>
      </div>`;
    return;
  }
  if (!students.length) {
    grid.innerHTML =
      '<div class="loading-cell">No active students in this section.</div>';
    return;
  }

  const overallMap = {};
  periodGrades.forEach((p) => {
    overallMap[p.student_id] = p;
  });
  const total = assignments.length;

  const bodyRows = students
    .map((s) => {
      const o = overallMap[s.id];
      const score = o && o.period_score != null ? Number(o.period_score) : null;
      const graded = o ? o.graded_count : 0;
      return `<tr class="row-clickable" data-student="${s.id}">
        <td>${escapeHtml(s.last_name)}, ${escapeHtml(s.first_name)}</td>
        <td>${gradeCellHtml(score)}</td>
        <td class="text-muted">${graded}/${total} graded</td>
      </tr>`;
    })
    .join("");

  grid.innerHTML = `
    <table class="data-table gradebook-table">
      <thead>
        <tr><th>Student</th><th>Grade</th><th>Completion</th></tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>`;

  grid.querySelectorAll("tr.row-clickable").forEach((tr) => {
    tr.addEventListener("click", () => {
      const s = students.find((x) => String(x.id) === tr.dataset.student);
      if (s) openStudentGradesModal(s);
    });
  });
}

function openAddAssignment() {
  openModal({
    title: `Add Assignment — ${currentClass.subjectName} ${currentClass.className}`,
    submitLabel: "Add Assignment",
    fields: [
      {
        name: "name",
        label: "Name",
        type: "text",
        required: true,
        placeholder: "e.g. Quiz 1 — Fractions",
      },
      { name: "due_date", label: "Due Date (optional)", type: "date" },
      {
        name: "max_score",
        label: "Max Score",
        type: "number",
        required: true,
        value: "100",
        min: 1,
        step: "0.01",
      },
      {
        name: "category_id",
        label: "Category (optional)",
        type: "select",
        options: categoryOptions(),
        help: "Categories let you weight exams vs. tasks. Manage them from the Categories button.",
      },
      { name: "note", label: "Note (optional)", type: "textarea" },
    ],
    onSubmit: async (formData) => {
      await db.insertAssignment({
        class_subject_teacher_id: currentClass.cstId,
        grading_period_id: gradebookState.periodId,
        name: formData.name.trim(),
        due_date: formData.due_date || null,
        max_score: Number(formData.max_score),
        category_id: formData.category_id ? Number(formData.category_id) : null,
        note: formData.note?.trim() || null,
      });
      showToast(`Assignment "${formData.name}" created.`);
      loadGradebook();
    },
  });
}

function openEditAssignment(assignment) {
  openModal({
    title: "Edit Assignment",
    submitLabel: "Save Changes",
    fields: [
      {
        name: "name",
        label: "Name",
        type: "text",
        required: true,
        value: assignment.name,
      },
      {
        name: "due_date",
        label: "Due Date (optional)",
        type: "date",
        value: assignment.due_date ?? "",
      },
      {
        name: "max_score",
        label: "Max Score",
        type: "number",
        required: true,
        value: assignment.max_score,
        min: 1,
        step: "0.01",
      },
      {
        name: "category_id",
        label: "Category (optional)",
        type: "select",
        value: assignment.category_id ?? "",
        options: categoryOptions(),
      },
      {
        name: "note",
        label: "Note (optional)",
        type: "textarea",
        value: assignment.note ?? "",
      },
    ],
    onSubmit: async (formData) => {
      await db.updateAssignment(assignment.id, {
        name: formData.name.trim(),
        due_date: formData.due_date || null,
        max_score: Number(formData.max_score),
        category_id: formData.category_id ? Number(formData.category_id) : null,
        note: formData.note?.trim() || null,
      });
      showToast(`Assignment "${formData.name}" updated.`);
      loadGradebook();
    },
  });
}

function confirmDeleteAssignment(assignment) {
  openConfirm(
    `Delete assignment "${assignment.name}"? All student scores for it will also be removed. This cannot be undone.`,
    async () => {
      await db.deleteAssignment(assignment.id);
      showToast(`Assignment "${assignment.name}" deleted.`);
      loadGradebook();
    },
  );
}

// ── Manage Assignments modal ───────────────────────────────────
// Assignment add/edit/delete moved here when the gradebook became student
// rows. Reuses the same add/edit/delete flows; the generic form modal stacks
// on top, and loadGradebook() re-renders this list while it's open.
function openManageAssignments() {
  renderManageAssignments();
  assignmentsOverlay.classList.add("active");
}

function closeManageAssignments() {
  assignmentsOverlay.classList.remove("active");
}

function renderManageAssignments() {
  const assignments = gradebookState?.assignments ?? [];
  const periodName =
    PERIODS.find((p) => p.id === gradebookState?.periodId)?.name ?? "";
  manageTitle.textContent = `Assignments — ${periodName}`;

  if (!assignments.length) {
    manageBody.innerHTML =
      '<p class="drawer-muted">No assignments yet for this period. Add one to start grading.</p>';
    return;
  }

  const catById = Object.fromEntries(
    (gradebookState?.categories ?? []).map((c) => [c.id, c.name]),
  );

  manageBody.innerHTML = "";
  assignments.forEach((a) => {
    const item = document.createElement("div");
    item.className = "manage-item";

    const catName = a.category_id ? catById[a.category_id] : null;
    const info = document.createElement("div");
    info.className = "manage-item-info";
    info.innerHTML = `
      <b>${escapeHtml(a.name)}</b>
      <span class="manage-item-meta">/ ${a.max_score}${
        a.due_date ? " · due " + formatDate(a.due_date) : ""
      }${catName ? " · " + escapeHtml(catName) : ""}</span>`;

    const actions = document.createElement("div");
    actions.className = "manage-item-actions";
    actions.appendChild(
      makeActionBtn("edit_note", "Enter scores for all students", () =>
        openColumnGrades(a),
      ),
    );
    actions.appendChild(
      makeActionBtn("edit", "Edit", () => openEditAssignment(a)),
    );
    actions.appendChild(
      makeActionBtn("delete", "Delete", () => confirmDeleteAssignment(a), true),
    );

    item.append(info, actions);
    manageBody.appendChild(item);
  });
}

// ── Per-student grade modal (detail view + grade entry) ─────────
let _studentGradesState = null;

async function openStudentGradesModal(student) {
  if (!gradebookState) return;
  const { assignments, periodId } = gradebookState;
  const periodName = PERIODS.find((p) => p.id === periodId)?.name ?? "";

  _studentGradesState = { student, assignments, gradeByAssignment: {} };
  sgTitle.textContent = `${student.first_name} ${student.last_name}`;
  sgBody.innerHTML = skeletonBlock();
  sgOverlay.classList.add("active");

  if (!assignments.length) {
    sgBody.innerHTML = `<p class="drawer-muted">No assignments for ${escapeHtml(periodName)} yet.</p>`;
    return;
  }

  let grades = [];
  try {
    grades = await db.fetchStudentAssignmentGrades(
      assignments.map((a) => a.id),
      student.id,
    );
  } catch (err) {
    sgBody.innerHTML = `<div class="loading-cell">Failed to load grades: ${escapeHtml(err.message)}</div>`;
    return;
  }

  const gradeByAssignment = Object.fromEntries(
    grades.map((g) => [g.assignment_id, g]),
  );
  _studentGradesState.gradeByAssignment = gradeByAssignment;

  const rows = assignments
    .map((a) => {
      const g = gradeByAssignment[a.id];
      const score = g?.score ?? "";
      const note = g?.note ?? "";
      const status = gradeStatus(g, a.due_date);
      // Accidental-overwrite guard: an already-graded score renders locked
      // (read-only) behind a per-assignment Edit button. Ungraded scores stay
      // directly editable. This is per-assignment, never a whole-modal toggle.
      const graded = g && g.score != null;
      const scoreField = graded
        ? `<input class="sg-score sg-locked" type="number" min="0" max="${a.max_score}" step="0.01"
            data-assignment="${a.id}" data-original="${score}" value="${score}" readonly />
          <button type="button" class="sg-edit-btn" data-assignment="${a.id}" title="Edit score" aria-label="Edit score">
            <span class="material-symbols-outlined">edit</span>
          </button>`
        : `<input class="sg-score" type="number" min="0" max="${a.max_score}" step="0.01"
            data-assignment="${a.id}" data-original="${score}" value="${score}" placeholder="—" />`;
      return `
      <div class="sg-row">
        <span class="sg-cell sg-name" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</span>
        <span class="sg-cell sg-num">${a.max_score}</span>
        <span class="sg-cell sg-muted">${formatDate(a.due_date)}</span>
        <span class="sg-cell sg-score-cell">
          ${scoreField}
        </span>
        <span class="sg-cell"><span class="badge ${status.cls}">${status.label}</span></span>
        <span class="sg-cell sg-muted">${formatDate(g?.created_at)}</span>
        <span class="sg-cell sg-muted">${formatDate(g?.graded_at)}</span>
        <span class="sg-cell">
          <input class="sg-note" type="text" data-assignment="${a.id}"
            data-original="${escapeHtml(note)}" value="${escapeHtml(note)}" placeholder="Add note…" />
        </span>
      </div>`;
    })
    .join("");

  sgBody.innerHTML = `
    <p class="sg-period">${escapeHtml(periodName)} · ${assignments.length} assignment${assignments.length === 1 ? "" : "s"}</p>
    <div class="sg-scroll">
      <div class="sg-grid">
        <div class="sg-row sg-head">
          <span class="sg-cell">Assignment</span>
          <span class="sg-cell sg-num">Max</span>
          <span class="sg-cell">Due</span>
          <span class="sg-cell">Score</span>
          <span class="sg-cell">Status</span>
          <span class="sg-cell">Date added</span>
          <span class="sg-cell">Date graded</span>
          <span class="sg-cell">Note</span>
        </div>
        ${rows}
      </div>
    </div>`;
}

function closeStudentGradesModal() {
  sgOverlay.classList.remove("active");
  sgBody.innerHTML = "";
  _studentGradesState = null;
}

async function saveStudentGrades() {
  if (!_studentGradesState) return;
  const { student, assignments, gradeByAssignment } = _studentGradesState;
  const maxMap = Object.fromEntries(
    assignments.map((a) => [a.id, Number(a.max_score)]),
  );

  const rows = [];
  let errorMsg = null;

  document.querySelectorAll("#sg-body .sg-score").forEach((input) => {
    const aId = Number(input.dataset.assignment);
    const noteInput = document.querySelector(
      `#sg-body .sg-note[data-assignment="${aId}"]`,
    );
    const scoreVal = input.value.trim();
    const noteVal = (noteInput?.value ?? "").trim();
    const scoreChanged = scoreVal !== (input.dataset.original ?? "");
    const noteChanged = noteVal !== (noteInput?.dataset.original ?? "");
    if (!scoreChanged && !noteChanged) return;

    let score = null;
    if (scoreVal !== "") {
      score = Number(scoreVal);
      const max = maxMap[aId];
      if (Number.isNaN(score) || score < 0 || score > max) {
        errorMsg ??= `Scores must be between 0 and ${max}.`;
        return;
      }
    }

    const existing = gradeByAssignment[aId];
    rows.push({
      assignment_id: aId,
      student_id: student.id,
      score,
      note: noteVal || null,
      // Re-stamp graded_at only when the score itself changes; otherwise keep
      // the existing timestamp (note-only edits shouldn't move "Date graded").
      graded_at: scoreChanged
        ? score == null
          ? null
          : new Date().toISOString()
        : (existing?.graded_at ?? null),
    });
  });

  if (errorMsg) {
    showToast(errorMsg, "error");
    return;
  }
  if (!rows.length) {
    showToast("No changes to save.", "error");
    return;
  }

  sgSave.disabled = true;
  try {
    await db.upsertAssignmentGrades(rows);
    showToast(
      `Saved ${rows.length} grade${rows.length > 1 ? "s" : ""} for ${student.first_name}.`,
    );
    closeStudentGradesModal();
    loadGradebook(); // refresh current-period grade + completion from the view
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    sgSave.disabled = false;
  }
}

// ───────────────────────────────────────────────────────────────
//  9. ATTENDANCE TAB
// ───────────────────────────────────────────────────────────────
let _attendanceRows = [];

function renderAttendanceTab(content) {
  const today = new Date().toISOString().split("T")[0];
  content.innerHTML = `
    <div class="absence-summary recent-activity" id="absence-summary">
      ${skeletonBlock(2)}
    </div>
    <div class="view-toolbar">
      <div class="toolbar-filters">
        <label for="attendance-date">Date:</label>
        <input type="date" id="attendance-date" value="${today}" />
      </div>
      <button class="btn btn-secondary" id="btn-save-attendance">
        <span class="material-symbols-outlined">save</span> Save Attendance
      </button>
    </div>
    <div class="recent-activity">
      <table class="data-table" id="attendance-table">
        <thead>
          <tr><th>Student</th><th>Status</th><th>Notes</th></tr>
        </thead>
        <tbody id="attendance-body">
          ${skeletonRows(5, 3)}
        </tbody>
      </table>
    </div>`;

  const dateInput = document.getElementById("attendance-date");
  dateInput.addEventListener("change", () =>
    loadAttendanceSheet(dateInput.value),
  );

  const tbody = document.getElementById("attendance-body");
  tbody.addEventListener("click", (e) => {
    const btn = e.target.closest(".attendance-status-btn");
    if (!btn) return;
    const idx = Number(btn.dataset.idx);
    _attendanceRows[idx].status = btn.dataset.status;
    btn
      .closest(".attendance-status-group")
      .querySelectorAll(".attendance-status-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  });
  tbody.addEventListener("input", (e) => {
    const input = e.target.closest(".attendance-notes-input");
    if (!input) return;
    _attendanceRows[Number(input.dataset.idx)].notes = input.value;
  });

  document
    .getElementById("btn-save-attendance")
    .addEventListener("click", saveAttendance);

  loadAttendanceSheet(today);
  loadAbsenceSummary();
}

async function loadAttendanceSheet(date) {
  const tbody = document.getElementById("attendance-body");
  tbody.innerHTML = skeletonRows(5, 3);
  try {
    _attendanceRows = await db.fetchAttendanceSheet(currentClass.classId, date);
    _attendanceRows.forEach((row) => {
      row._original = { status: row.status, notes: row.notes ?? "" };
    });
    renderAttendanceSheet(_attendanceRows);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="3" class="loading-cell">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderAttendanceSheet(rows) {
  const tbody = document.getElementById("attendance-body");
  if (!rows.length) {
    tbody.innerHTML =
      '<tr><td colspan="3" class="loading-cell">No active students in this section.</td></tr>';
    return;
  }

  const STATUSES = ["present", "absent", "late", "excused"];
  tbody.innerHTML = "";
  rows.forEach((row, idx) => {
    const tr = document.createElement("tr");
    const statusButtons = STATUSES.map((s) => {
      const active = row.status === s ? " active" : "";
      return `<button type="button" class="btn btn-sm attendance-status-btn${active}"
        data-idx="${idx}" data-status="${s}">${s.charAt(0).toUpperCase() + s.slice(1)}</button>`;
    }).join("");

    tr.innerHTML = `
      <td>${escapeHtml(row.last_name)}, ${escapeHtml(row.first_name)}</td>
      <td><div class="attendance-status-group">${statusButtons}</div></td>
      <td><input type="text" class="attendance-notes-input" data-idx="${idx}"
        value="${escapeHtml(row.notes ?? "")}" placeholder="Optional note…"></td>`;
    tbody.appendChild(tr);
  });
}

async function saveAttendance() {
  const date = document.getElementById("attendance-date").value;
  if (!date) {
    showToast("Pick a date first.", "error");
    return;
  }
  if (!_attendanceRows.length) {
    showToast("No attendance data to save.", "error");
    return;
  }

  // Require a chosen/loaded status — a row the teacher never picked stays null and
  // is never upserted (attendance.status is non-null in the DB).
  const changed = _attendanceRows.filter(
    (row) =>
      row.status &&
      (!row._original ||
        row._original.status !== row.status ||
        row._original.notes !== (row.notes ?? "")),
  );
  if (!changed.length) {
    showToast("No changes to save.", "error");
    return;
  }

  try {
    await db.upsertAttendance(currentClass.classId, date, changed, TEACHER_ID);
    changed.forEach((row) => {
      row._original = { status: row.status, notes: row.notes ?? "" };
    });
    showToast(
      `Attendance saved for ${changed.length} student${changed.length > 1 ? "s" : ""}.`,
    );
    loadAbsenceSummary(); // counts may have shifted a student over the threshold
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ───────────────────────────────────────────────────────────────
//  10. SCHEDULE TAB
// ───────────────────────────────────────────────────────────────
function renderScheduleTab(content) {
  content.innerHTML = `
    <div class="view-toolbar">
      <div class="toolbar-filters">
        <label>Weekly schedule for ${escapeHtml(currentClass.className)}</label>
      </div>
      <button class="btn btn-primary" id="btn-add-schedule">
        <span class="material-symbols-outlined">add</span> Add Schedule Entry
      </button>
    </div>
    <div class="recent-activity">
      <div id="schedule-grid">${skeletonBlock(4)}</div>
    </div>`;

  bindAdminAction(document.getElementById("btn-add-schedule"), openAddSchedule);

  loadSchedule();
}

async function loadSchedule() {
  const container = document.getElementById("schedule-grid");
  try {
    const entries = await db.fetchScheduleByClass(currentClass.classId);
    renderScheduleTable(entries);
  } catch (err) {
    container.innerHTML = `<div class="loading-cell">Failed to load schedule: ${escapeHtml(err.message)}</div>`;
  }
}

function renderScheduleTable(entries) {
  const container = document.getElementById("schedule-grid");
  if (!entries.length) {
    container.innerHTML =
      '<div class="loading-cell">No schedule entries yet. Add one to get started.</div>';
    return;
  }

  const table = document.createElement("table");
  table.className = "data-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Day</th><th>Start</th><th>End</th>
        <th>Subject</th><th>Teacher</th><th>Room</th>
        <th class="actions-col">Actions</th>
      </tr>
    </thead>`;
  const tbody = document.createElement("tbody");

  entries.forEach((entry) => {
    const tr = document.createElement("tr");
    const dot = entry.subjects?.color
      ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;
           background:${entry.subjects.color};margin-right:6px;vertical-align:middle;"></span>`
      : "";

    const actionsCell = document.createElement("td");
    actionsCell.className = "actions-col";
    actionsCell.appendChild(
      makeActionBtn(
        "delete",
        "Delete",
        () => {
          openConfirm("Delete this schedule entry?", async () => {
            await db.deleteSchedule(entry.id);
            showToast("Schedule entry deleted.");
            loadSchedule();
          });
        },
        true,
        true,
      ),
    );

    tr.innerHTML = `
      <td>${DAY_NAMES[entry.day_of_week] ?? entry.day_of_week}</td>
      <td>${escapeHtml(entry.start_time)}</td>
      <td>${escapeHtml(entry.end_time)}</td>
      <td>${dot}${escapeHtml(entry.subjects?.name ?? "—")}</td>
      <td>${entry.teachers ? escapeHtml(entry.teachers.first_name + " " + entry.teachers.last_name) : "—"}</td>
      <td>${escapeHtml(entry.rooms?.name ?? "—")}</td>`;
    tr.appendChild(actionsCell);
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.innerHTML = "";
  container.appendChild(table);
}

async function openAddSchedule() {
  let subjects, teachers, rooms;
  try {
    [subjects, teachers, rooms] = await Promise.all([
      db.fetchSubjects(),
      db.fetchTeachers(),
      db.fetchRooms(),
    ]);
  } catch (err) {
    showToast("Failed to load form data: " + err.message, "error");
    return;
  }

  openModal({
    title: `Add Schedule Entry — ${currentClass.className}`,
    submitLabel: "Add Entry",
    fields: [
      {
        name: "day_of_week",
        label: "Day",
        type: "select",
        required: true,
        options: DAY_NAMES.slice(1).map((d, i) => ({ value: i + 1, label: d })),
      },
      { name: "start_time", label: "Start Time", type: "time", required: true },
      { name: "end_time", label: "End Time", type: "time", required: true },
      {
        name: "subject_id",
        label: "Subject",
        type: "select",
        required: true,
        value: currentClass.subjectId,
        options: subjects.map((s) => ({ value: s.id, label: s.name })),
      },
      {
        name: "teacher_id",
        label: "Teacher",
        type: "select",
        required: true,
        value: TEACHER_ID,
        options: teachers.map((t) => ({
          value: t.id,
          label: `${t.last_name}, ${t.first_name}`,
        })),
      },
      {
        name: "room_id",
        label: "Room",
        type: "select",
        options: rooms.map((r) => ({ value: r.id, label: r.name })),
      },
    ],
    onSubmit: async (formData) => {
      await db.insertSchedule({
        class_id: currentClass.classId,
        day_of_week: Number(formData.day_of_week),
        start_time: formData.start_time,
        end_time: formData.end_time,
        subject_id: Number(formData.subject_id),
        teacher_id: Number(formData.teacher_id),
        room_id: formData.room_id ? Number(formData.room_id) : null,
      });
      showToast("Schedule entry added.");
      loadSchedule();
    },
  });
}

// ───────────────────────────────────────────────────────────────
//  11. SUBJECTS SECTION (global catalog — retained)
// ───────────────────────────────────────────────────────────────
let _cachedSubjects = [];
let subjectsFilter = { search: "" };

async function loadSubjects() {
  renderEmptyRow("subjects-body", 4, "Loading subjects...");
  try {
    _cachedSubjects = await db.fetchSubjectsDetailed();
    renderSubjectsTable();
  } catch (err) {
    console.error(err);
    renderErrorRow("subjects-body", 4);
  }
}

function renderSubjectsTable() {
  const tbody = document.getElementById("subjects-body");
  let filtered = _cachedSubjects;

  if (subjectsFilter.search) {
    const q = subjectsFilter.search.toLowerCase();
    filtered = filtered.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) || s.code?.toLowerCase().includes(q),
    );
  }

  if (!filtered.length) {
    renderEmptyRow("subjects-body", 4, "No subjects match your search.");
    return;
  }

  tbody.innerHTML = "";
  filtered.forEach((subject) => {
    const gradeLevelNames =
      [
        ...new Set(
          (subject.grade_level_subjects ?? [])
            .map((gls) => gls.grade_levels?.name)
            .filter(Boolean),
        ),
      ].join(", ") || "—";

    const colorSwatch = subject.color
      ? `<span class="color-swatch" style="background:${subject.color};
           display:inline-block;width:16px;height:16px;border-radius:3px;
           vertical-align:middle;margin-right:6px;"></span>${escapeHtml(subject.color)}`
      : "—";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><code>${escapeHtml(subject.code ?? "—")}</code></td>
      <td>${escapeHtml(subject.name)}</td>
      <td>${colorSwatch}</td>
      <td>${escapeHtml(gradeLevelNames)}</td>`;
    tbody.appendChild(tr);
  });
}

let subjectsSearchTimeout;
document.getElementById("subjects-search")?.addEventListener("input", (e) => {
  clearTimeout(subjectsSearchTimeout);
  subjectsSearchTimeout = setTimeout(() => {
    subjectsFilter.search = e.target.value.trim();
    if (_cachedSubjects.length) renderSubjectsTable();
  }, 350);
});

// Subjects is read-only for teachers — no add/edit/delete. The school's
// subject structure is registrar-managed, outside a teacher's role.

// ───────────────────────────────────────────────────────────────
//  12. SHARED SMALL HELPERS (added features)
// ───────────────────────────────────────────────────────────────
const GENDER_OPTIONS = [
  { value: "M", label: "Male" },
  { value: "F", label: "Female" },
  { value: "O", label: "Other" },
];

function genderLabel(g) {
  return { M: "Male", F: "Female", O: "Other" }[g] ?? "—";
}

// Category dropdown options for the assignment form, from the loaded gradebook.
function categoryOptions() {
  return (gradebookState?.categories ?? []).map((c) => ({
    value: c.id,
    label: `${c.name} (${Number(c.weight)}%)`,
  }));
}

// ───────────────────────────────────────────────────────────────
//  13. GRADE CATEGORIES (item 8)
// ───────────────────────────────────────────────────────────────
function openCategoriesModal() {
  if (!currentClass) return;
  categoriesTitle.textContent = `Grade categories — ${currentClass.subjectName} ${currentClass.className}`;
  renderCategories();
  categoriesOverlay.classList.add("active");
}

function closeCategoriesModal() {
  categoriesOverlay.classList.remove("active");
}

function renderCategories() {
  const cats = gradebookState?.categories ?? [];
  if (!cats.length) {
    categoriesBody.innerHTML =
      '<p class="drawer-muted">No categories yet. The period grade is a flat points average. Add categories (e.g. Exams 50%, Tasks 30%, Participation 20%) to weight them — assignments you tag with a category are averaged within it, then combined by weight.</p>';
    categoriesTotal.textContent = "";
    return;
  }

  categoriesBody.innerHTML = "";
  cats.forEach((c) => {
    const item = document.createElement("div");
    item.className = "manage-item";
    const info = document.createElement("div");
    info.className = "manage-item-info";
    info.innerHTML = `<b>${escapeHtml(c.name)}</b><span class="manage-item-meta">Weight: ${Number(c.weight)}%</span>`;
    const actions = document.createElement("div");
    actions.className = "manage-item-actions";
    actions.appendChild(makeActionBtn("edit", "Edit", () => openCategoryForm(c)));
    actions.appendChild(
      makeActionBtn("delete", "Delete", () => confirmDeleteCategory(c), true),
    );
    item.append(info, actions);
    categoriesBody.appendChild(item);
  });

  const total = cats.reduce((s, c) => s + Number(c.weight || 0), 0);
  const off = Math.round(total * 100) / 100 !== 100;
  categoriesTotal.innerHTML = `Total: <b class="${off ? "score-mid" : "score-high"}">${total}%</b>${
    off ? " — weights are renormalized, but 100% is clearest." : ""
  }`;
}

function openCategoryForm(category = null) {
  const editing = !!category;
  openModal({
    title: editing ? "Edit category" : "Add category",
    submitLabel: editing ? "Save" : "Add category",
    fields: [
      {
        name: "name",
        label: "Name",
        type: "text",
        required: true,
        value: category?.name ?? "",
        placeholder: "e.g. Exams",
      },
      {
        name: "weight",
        label: "Weight (%)",
        type: "number",
        required: true,
        value: category?.weight ?? "",
        min: 0,
        step: "0.01",
      },
    ],
    onSubmit: async (formData) => {
      const payload = {
        name: formData.name.trim(),
        weight: Number(formData.weight),
      };
      if (editing) {
        await db.updateCategory(category.id, payload);
      } else {
        await db.insertCategory({
          ...payload,
          class_subject_teacher_id: currentClass.cstId,
        });
      }
      showToast(`Category "${payload.name}" ${editing ? "updated" : "added"}.`);
      await refreshAfterCategoryChange();
    },
  });
}

function confirmDeleteCategory(category) {
  openConfirm(
    `Delete category "${category.name}"? Its assignments stay but become uncategorized (flat weighting).`,
    async () => {
      await db.deleteCategory(category.id);
      showToast(`Category "${category.name}" deleted.`);
      await refreshAfterCategoryChange();
    },
  );
}

// Reload the gradebook (refetches categories + grades, since weighting changed)
// and re-render the categories list if it's still open.
async function refreshAfterCategoryChange() {
  await loadGradebook();
  if (categoriesOverlay.classList.contains("active")) renderCategories();
}

// ───────────────────────────────────────────────────────────────
//  14. POST GRADES (item 1) — finalize period grade to the report card
// ───────────────────────────────────────────────────────────────
let _postGradesState = null;

async function openPostGrades() {
  if (!gradebookState) return;
  const { cstId, periodId, students } = gradebookState;
  const periodName = PERIODS.find((p) => p.id === periodId)?.name ?? "";
  pgTitle.textContent = `Post grades — ${periodName}`;
  pgBody.innerHTML = skeletonBlock();
  pgOverlay.classList.add("active");

  let computed, posted;
  try {
    [computed, posted] = await Promise.all([
      db.fetchPeriodGrades(cstId, periodId),
      db.fetchPostedGrades(cstId, periodId),
    ]);
  } catch (err) {
    pgBody.innerHTML = `<div class="loading-cell">Failed to load: ${escapeHtml(err.message)}</div>`;
    return;
  }

  const computedById = Object.fromEntries(computed.map((c) => [c.student_id, c]));
  const postedById = Object.fromEntries(posted.map((p) => [p.student_id, p]));
  _postGradesState = { cstId, periodId };

  if (!students.length) {
    pgBody.innerHTML = '<p class="drawer-muted">No active students.</p>';
    return;
  }

  const rows = students
    .map((s) => {
      const comp = computedById[s.id];
      const computedScore =
        comp && comp.period_score != null ? Number(comp.period_score) : null;
      const post = postedById[s.id];
      const postedScore = post && post.score != null ? Number(post.score) : null;
      const prefill =
        postedScore != null
          ? postedScore
          : computedScore != null
            ? computedScore.toFixed(1)
            : "";
      const note = post?.notes ?? "";
      const postedCell =
        postedScore != null
          ? `<b class="${gradeBandClass(postedScore)}">${postedScore.toFixed(1)}</b>`
          : '<span class="text-muted">—</span>';
      return `
      <div class="pg-row">
        <span class="pg-cell pg-name">${escapeHtml(s.last_name)}, ${escapeHtml(s.first_name)}</span>
        <span class="pg-cell pg-center">${gradeCellHtml(computedScore)}</span>
        <span class="pg-cell pg-center">${postedCell}</span>
        <span class="pg-cell">
          <input class="pg-score" type="number" min="0" max="100" step="0.01"
            data-student="${s.id}" data-computed="${computedScore != null ? computedScore.toFixed(2) : ""}"
            value="${prefill}" placeholder="—" />
        </span>
        <span class="pg-cell">
          <input class="pg-note" type="text" data-student="${s.id}"
            value="${escapeHtml(note)}" placeholder="Comment (optional)…" />
        </span>
      </div>`;
    })
    .join("");

  pgBody.innerHTML = `
    <p class="sg-period">${escapeHtml(periodName)} · review each computed average, adjust if needed, then post. Posted grades are what students &amp; parents see on the report card.</p>
    <div class="sg-scroll">
      <div class="pg-grid">
        <div class="pg-row pg-head">
          <span class="pg-cell">Student</span>
          <span class="pg-cell pg-center">Computed</span>
          <span class="pg-cell pg-center">Posted</span>
          <span class="pg-cell">Grade to post</span>
          <span class="pg-cell">Comment</span>
        </div>
        ${rows}
      </div>
    </div>
    <div class="pg-actions">
      <button type="button" class="link-btn" id="pg-fill-computed">Reset all to computed</button>
    </div>`;

  document.getElementById("pg-fill-computed").addEventListener("click", () => {
    pgBody.querySelectorAll(".pg-score").forEach((inp) => {
      const c = inp.dataset.computed;
      if (c !== "") inp.value = Number(c).toFixed(1);
    });
  });
}

function closePostGrades() {
  pgOverlay.classList.remove("active");
  pgBody.innerHTML = "";
  _postGradesState = null;
}

async function savePostGrades() {
  if (!_postGradesState) return;
  const { cstId, periodId } = _postGradesState;

  const rows = [];
  let errorMsg = null;
  const now = new Date().toISOString();

  pgBody.querySelectorAll(".pg-score").forEach((input) => {
    const studentId = Number(input.dataset.student);
    const noteInput = pgBody.querySelector(
      `.pg-note[data-student="${studentId}"]`,
    );
    const scoreVal = input.value.trim();
    const noteVal = (noteInput?.value ?? "").trim();
    if (scoreVal === "") return; // skip students with no grade to post

    const score = Number(scoreVal);
    if (Number.isNaN(score) || score < 0 || score > 100) {
      errorMsg ??= "Posted grades must be between 0 and 100.";
      return;
    }
    rows.push({
      student_id: studentId,
      class_subject_teacher_id: cstId,
      grading_period_id: periodId,
      score,
      notes: noteVal || null,
      submitted_at: now,
    });
  });

  if (errorMsg) {
    showToast(errorMsg, "error");
    return;
  }
  if (!rows.length) {
    showToast("Enter at least one grade to post.", "error");
    return;
  }

  pgSave.disabled = true;
  try {
    await db.upsertStudentGrades(rows);
    showToast(
      `Posted ${rows.length} grade${rows.length > 1 ? "s" : ""} to the report card.`,
    );
    closePostGrades();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    pgSave.disabled = false;
  }
}

// ───────────────────────────────────────────────────────────────
//  15. COLUMN GRADE ENTRY (item 4) — one assignment, every student
// ───────────────────────────────────────────────────────────────
let _columnState = null;

async function openColumnGrades(assignment) {
  if (!gradebookState) return;
  const students = gradebookState.students; // active students only
  cgTitle.textContent = `Enter scores — ${assignment.name}`;
  cgBody.innerHTML = skeletonBlock();
  cgOverlay.classList.add("active");

  let existing;
  try {
    existing = await db.fetchAssignmentColumn(assignment.id);
  } catch (err) {
    cgBody.innerHTML = `<div class="loading-cell">Failed to load: ${escapeHtml(err.message)}</div>`;
    return;
  }
  const byStudent = Object.fromEntries(existing.map((g) => [g.student_id, g]));
  _columnState = { assignment, byStudent };

  if (!students.length) {
    cgBody.innerHTML = '<p class="drawer-muted">No active students.</p>';
    return;
  }

  const rows = students
    .map((s) => {
      const g = byStudent[s.id];
      const score = g?.score ?? "";
      const note = g?.note ?? "";
      return `
      <div class="cg-row">
        <span class="cg-cell cg-name">${escapeHtml(s.last_name)}, ${escapeHtml(s.first_name)}</span>
        <span class="cg-cell">
          <input class="cg-score" type="number" min="0" max="${assignment.max_score}" step="0.01"
            data-student="${s.id}" data-original="${score}" value="${score}" placeholder="—" />
        </span>
        <span class="cg-cell">
          <input class="cg-note" type="text" data-student="${s.id}"
            data-original="${escapeHtml(note)}" value="${escapeHtml(note)}" placeholder="Note…" />
        </span>
      </div>`;
    })
    .join("");

  cgBody.innerHTML = `
    <p class="sg-period">Out of ${assignment.max_score}${
      assignment.due_date ? " · due " + formatDate(assignment.due_date) : ""
    } · ${students.length} student${students.length === 1 ? "" : "s"}</p>
    <div class="sg-scroll">
      <div class="cg-grid">
        <div class="cg-row cg-head">
          <span class="cg-cell">Student</span>
          <span class="cg-cell">Score</span>
          <span class="cg-cell">Note</span>
        </div>
        ${rows}
      </div>
    </div>`;
}

function closeColumnGrades() {
  cgOverlay.classList.remove("active");
  cgBody.innerHTML = "";
  _columnState = null;
}

async function saveColumnGrades() {
  if (!_columnState) return;
  const { assignment, byStudent } = _columnState;
  const max = Number(assignment.max_score);

  const rows = [];
  let errorMsg = null;

  cgBody.querySelectorAll(".cg-score").forEach((input) => {
    const studentId = Number(input.dataset.student);
    const noteInput = cgBody.querySelector(
      `.cg-note[data-student="${studentId}"]`,
    );
    const scoreVal = input.value.trim();
    const noteVal = (noteInput?.value ?? "").trim();
    const scoreChanged = scoreVal !== (input.dataset.original ?? "");
    const noteChanged = noteVal !== (noteInput?.dataset.original ?? "");
    if (!scoreChanged && !noteChanged) return;

    let score = null;
    if (scoreVal !== "") {
      score = Number(scoreVal);
      if (Number.isNaN(score) || score < 0 || score > max) {
        errorMsg ??= `Scores must be between 0 and ${max}.`;
        return;
      }
    }
    const existing = byStudent[studentId];
    rows.push({
      assignment_id: assignment.id,
      student_id: studentId,
      score,
      note: noteVal || null,
      // Same graded_at rule as the per-student modal: re-stamp only on a score
      // change; null it when the score is cleared.
      graded_at: scoreChanged
        ? score == null
          ? null
          : new Date().toISOString()
        : (existing?.graded_at ?? null),
    });
  });

  if (errorMsg) {
    showToast(errorMsg, "error");
    return;
  }
  if (!rows.length) {
    showToast("No changes to save.", "error");
    return;
  }

  cgSave.disabled = true;
  try {
    await db.upsertAssignmentGrades(rows);
    showToast(`Saved ${rows.length} score${rows.length > 1 ? "s" : ""}.`);
    closeColumnGrades();
    loadGradebook();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    cgSave.disabled = false;
  }
}

// ───────────────────────────────────────────────────────────────
//  16. DISCIPLINE (item 2) — create/edit from the student drawer
// ───────────────────────────────────────────────────────────────
const DISCIPLINE_SEVERITY = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

function openAddDiscipline() {
  const student = _drawerStudent;
  if (!student) return;
  const today = new Date().toISOString().split("T")[0];
  openModal({
    title: `Add record — ${student.first_name} ${student.last_name}`,
    submitLabel: "Add record",
    fields: [
      { name: "date", label: "Date", type: "date", required: true, value: today },
      {
        name: "type",
        label: "Type",
        type: "text",
        required: true,
        placeholder: "e.g. Tardiness, Disruption, Uniform",
      },
      {
        name: "severity",
        label: "Severity",
        type: "select",
        required: true,
        value: "low",
        options: DISCIPLINE_SEVERITY,
      },
      { name: "description", label: "Description", type: "textarea" },
    ],
    onSubmit: async (formData) => {
      await db.insertDiscipline({
        student_id: student.id,
        date: formData.date,
        type: formData.type.trim(),
        severity: formData.severity,
        description: formData.description?.trim() || null,
        reported_by_teacher: TEACHER_ID,
      });
      showToast("Discipline record added.");
      await refreshDrawer();
    },
  });
}

function openEditDiscipline(record) {
  openModal({
    title: "Edit discipline record",
    submitLabel: "Save",
    fields: [
      {
        name: "date",
        label: "Date",
        type: "date",
        required: true,
        value: record.date ?? "",
      },
      {
        name: "type",
        label: "Type",
        type: "text",
        required: true,
        value: record.type ?? "",
      },
      {
        name: "severity",
        label: "Severity",
        type: "select",
        required: true,
        value: record.severity ?? "low",
        options: DISCIPLINE_SEVERITY,
      },
      {
        name: "description",
        label: "Description",
        type: "textarea",
        value: record.description ?? "",
      },
      {
        name: "resolved",
        label: "Status",
        type: "select",
        value: record.resolved ? "yes" : "no",
        options: [
          { value: "no", label: "Open" },
          { value: "yes", label: "Resolved" },
        ],
      },
      {
        name: "resolution",
        label: "Resolution (if resolved)",
        type: "textarea",
        value: record.resolution ?? "",
      },
    ],
    onSubmit: async (formData) => {
      const resolved = formData.resolved === "yes";
      await db.updateDiscipline(record.id, {
        date: formData.date,
        type: formData.type.trim(),
        severity: formData.severity,
        description: formData.description?.trim() || null,
        resolved,
        resolution: resolved ? formData.resolution?.trim() || null : null,
      });
      showToast("Discipline record updated.");
      await refreshDrawer();
    },
  });
}

// Re-open the drawer for the current student to reflect a discipline change.
async function refreshDrawer() {
  if (_drawerStudent) await openStudentDrawer(_drawerStudent);
}

// ───────────────────────────────────────────────────────────────
//  17. ABSENCE SUMMARY (item 3)
// ───────────────────────────────────────────────────────────────
const ABSENCE_THRESHOLD = 5; // absent + late at/above this flags an at-risk student

async function loadAbsenceSummary() {
  const container = document.getElementById("absence-summary");
  if (!container) return;
  try {
    const [rows, roster] = await Promise.all([
      db.fetchClassAttendance(currentClass.classId),
      db.fetchRoster(currentClass.classId),
    ]);
    renderAbsenceSummary(rows, roster, container);
  } catch (err) {
    container.innerHTML = `<div class="loading-cell">Failed to load absence summary: ${escapeHtml(err.message)}</div>`;
  }
}

function renderAbsenceSummary(rows, roster, container) {
  const nameById = Object.fromEntries(
    roster.map((s) => [s.id, `${s.last_name}, ${s.first_name}`]),
  );
  const counts = {};
  rows.forEach((r) => {
    const c = (counts[r.student_id] ??= {
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
    });
    if (c[r.status] != null) c[r.status] += 1;
  });

  const flagged = Object.entries(counts)
    .map(([id, c]) => ({ id: Number(id), ...c, missed: c.absent + c.late }))
    .filter((s) => s.missed >= ABSENCE_THRESHOLD)
    .sort((a, b) => b.missed - a.missed);

  if (!flagged.length) {
    container.innerHTML = `
      <div class="absence-summary-head">
        <h3><span class="material-symbols-outlined">monitoring</span> Absence summary</h3>
      </div>
      <p class="drawer-muted">No student has reached ${ABSENCE_THRESHOLD} absences/lates in this section yet. ✔</p>`;
    return;
  }

  const chips = flagged
    .map(
      (s) => `
      <div class="absence-chip${s.absent >= ABSENCE_THRESHOLD ? " absence-high" : ""}">
        <b>${escapeHtml(nameById[s.id] ?? "Student " + s.id)}</b>
        <span>${s.absent} absent · ${s.late} late${s.excused ? " · " + s.excused + " excused" : ""}</span>
      </div>`,
    )
    .join("");

  container.innerHTML = `
    <div class="absence-summary-head">
      <h3><span class="material-symbols-outlined">monitoring</span> Absence summary</h3>
      <span class="badge badge-warning">${flagged.length} at risk (≥ ${ABSENCE_THRESHOLD})</span>
    </div>
    <div class="absence-grid">${chips}</div>`;
}

// ───────────────────────────────────────────────────────────────
//  18. TODAY START PAGE (item 7)
// ───────────────────────────────────────────────────────────────
async function loadToday() {
  const grid = document.getElementById("today-grid");
  const subtitle = document.getElementById("today-subtitle");
  if (!grid) return;
  if (!ACTIVE_YEAR || !TEACHER_ID) {
    grid.innerHTML = '<div class="loading-cell">Teacher context not loaded.</div>';
    return;
  }

  const now = new Date();
  const jsDow = now.getDay(); // 0 Sun … 6 Sat
  subtitle.textContent = now.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  if (jsDow === 0 || jsDow === 6) {
    grid.innerHTML =
      '<div class="empty-state"><span class="material-symbols-outlined">weekend</span><p>No classes today — it\'s the weekend.</p></div>';
    return;
  }

  grid.innerHTML = skeletonCards(3);
  try {
    // myClassesCache lets us map a schedule row to its class_subject_teacher so
    // the action buttons can open the class workspace.
    if (!myClassesCache.length) {
      myClassesCache = await db.fetchMyClasses(TEACHER_ID, ACTIVE_YEAR.id);
    }
    const entries = await db.fetchScheduleToday(TEACHER_ID, jsDow); // Mon=1..Fri=5
    renderToday(entries, grid);
  } catch (err) {
    grid.innerHTML = `<div class="loading-cell">Failed to load today: ${escapeHtml(err.message)}</div>`;
  }
}

function renderToday(entries, grid) {
  if (!entries.length) {
    grid.innerHTML =
      '<div class="empty-state"><span class="material-symbols-outlined">event_available</span><p>No classes on your schedule today.</p></div>';
    return;
  }

  grid.innerHTML = "";
  const list = document.createElement("div");
  list.className = "today-list";

  entries.forEach((e) => {
    const cst = myClassesCache.find(
      (c) => c.class_id === e.class_id && c.subject_id === e.subject_id,
    );
    const color = e.subjects?.color || "var(--color-primary)";
    const card = document.createElement("div");
    card.className = "today-card";
    card.style.setProperty("--accent", color);
    card.innerHTML = `
      <span class="today-card-accent"></span>
      <div class="today-card-time">
        <b>${escapeHtml((e.start_time ?? "").slice(0, 5))}</b>
        <span>${escapeHtml((e.end_time ?? "").slice(0, 5))}</span>
      </div>
      <div class="today-card-body">
        <h3>${escapeHtml(e.subjects?.name ?? "—")}</h3>
        <p>${escapeHtml(e.classes?.display_name ?? "—")}${
          e.rooms?.name ? " · " + escapeHtml(e.rooms.name) : ""
        }</p>
      </div>
      <div class="today-card-actions"></div>`;

    const actions = card.querySelector(".today-card-actions");
    if (cst) {
      const att = document.createElement("button");
      att.type = "button";
      att.className = "btn btn-sm btn-secondary";
      att.innerHTML =
        '<span class="material-symbols-outlined">fact_check</span> Attendance';
      att.addEventListener("click", () => openClassWorkspace(cst, "attendance"));
      const gb = document.createElement("button");
      gb.type = "button";
      gb.className = "btn btn-sm btn-primary";
      gb.innerHTML = '<span class="material-symbols-outlined">school</span> Gradebook';
      gb.addEventListener("click", () => openClassWorkspace(cst, "gradebook"));
      actions.append(att, gb);
    } else {
      actions.innerHTML =
        '<span class="drawer-muted">Not one of your graded sections</span>';
    }
    list.appendChild(card);
  });

  grid.appendChild(list);
}

// ───────────────────────────────────────────────────────────────
//  19. PRINTABLE PROGRESS REPORT (item 6)
// ───────────────────────────────────────────────────────────────
async function printStudentReport() {
  const student = _drawerStudent;
  if (!student) return;

  let grades = [];
  try {
    grades = await db.fetchStudentAllSubjectGrades(student.id);
  } catch {
    /* degrade — report prints without the grade table */
  }
  const attendance = _drawerData.attendance ?? [];
  const discipline = _drawerData.discipline ?? [];

  const win = window.open("", "_blank");
  if (!win) {
    showToast("Allow pop-ups to print the report.", "error");
    return;
  }
  win.document.write(buildReportHtml(student, grades, attendance, discipline));
  win.document.close();
  win.focus();
  win.print();
}

function buildReportHtml(student, grades, attendance, discipline) {
  const esc = escapeHtml;
  const periods = PERIODS.slice().sort((a, b) => a.period_order - b.period_order);

  // Pivot posted grades into subject × period.
  const bySubject = {};
  grades.forEach((g) => {
    const subj = g.class_subject_teachers?.subjects?.name ?? "—";
    (bySubject[subj] ??= {})[g.grading_period_id] = g.score;
  });
  const periodHeads = periods.map((p) => `<th>${esc(p.name)}</th>`).join("");
  const gradeRows =
    Object.keys(bySubject).sort().length === 0
      ? `<tr><td colspan="${periods.length + 1}">No posted grades yet.</td></tr>`
      : Object.keys(bySubject)
          .sort()
          .map((subj) => {
            const cells = periods
              .map((p) => {
                const s = bySubject[subj][p.id];
                return `<td>${s == null ? "—" : Number(s).toFixed(1)}</td>`;
              })
              .join("");
            return `<tr><td class="subj">${esc(subj)}</td>${cells}</tr>`;
          })
          .join("");

  // Attendance summary.
  const ac = { present: 0, absent: 0, late: 0, excused: 0 };
  attendance.forEach((r) => {
    if (ac[r.status] != null) ac[r.status] += 1;
  });
  const totalDays = attendance.length;
  const rate = totalDays
    ? Math.round(((ac.present + ac.late) / totalDays) * 100)
    : null;

  const discRows = discipline.length
    ? discipline
        .map(
          (d) =>
            `<tr><td>${esc(d.date ?? "")}</td><td>${esc(d.type ?? "")}</td><td>${esc(
              d.severity ?? "",
            )}</td><td>${d.resolved ? "Resolved" : "Open"}</td><td>${esc(
              d.description ?? "",
            )}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="5">No discipline records.</td></tr>`;

  const teacherName =
    document.getElementById("teacher-name")?.textContent ?? "";
  const printed = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>Progress report — ${esc(student.first_name)} ${esc(student.last_name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #1a1a1a; margin: 2.2rem; }
  h1 { font-size: 1.4rem; margin: 0; }
  h2 { font-size: 0.95rem; text-transform: uppercase; letter-spacing: .04em; color: #555; border-bottom: 1px solid #ddd; padding-bottom: .3rem; margin: 1.6rem 0 .7rem; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #333; padding-bottom: .8rem; }
  .muted { color: #666; font-size: .85rem; }
  .ident { display: grid; grid-template-columns: 1fr 1fr; gap: .2rem .8rem; font-size: .9rem; margin-top: .4rem; }
  table { width: 100%; border-collapse: collapse; font-size: .85rem; }
  th, td { border: 1px solid #ddd; padding: .45rem .6rem; text-align: center; }
  th { background: #f4f4f4; }
  td.subj, th:first-child { text-align: left; }
  .att span { display: inline-block; margin-right: 1rem; font-size: .9rem; }
  footer { margin-top: 2rem; font-size: .8rem; color: #888; display: flex; justify-content: space-between; }
  @media print { body { margin: 1rem; } }
</style></head>
<body>
  <div class="head">
    <div>
      <h1>${esc(student.first_name)} ${esc(student.last_name)}</h1>
      <div class="muted">Simple Manage Pro · Progress report${
        ACTIVE_YEAR?.name ? " · " + esc(ACTIVE_YEAR.name) : ""
      }</div>
    </div>
    <div class="muted">Printed ${esc(printed)}</div>
  </div>

  <div class="ident">
    <div><b>Enrollment #:</b> ${esc(student.enrollment_number ?? "—")}</div>
    <div><b>National ID:</b> ${esc(student.national_id ?? "—")}</div>
    <div><b>Date of birth:</b> ${esc(formatDate(student.date_of_birth))}</div>
    <div><b>Gender:</b> ${esc(genderLabel(student.gender))}</div>
    <div><b>Status:</b> ${esc(student.status ?? "—")}</div>
    <div><b>Email:</b> ${esc(student.email ?? "—")}</div>
  </div>

  <h2>Grades by subject</h2>
  <table><thead><tr><th>Subject</th>${periodHeads}</tr></thead><tbody>${gradeRows}</tbody></table>

  <h2>Attendance</h2>
  <div class="att">
    <span><b>${ac.present}</b> present</span>
    <span><b>${ac.absent}</b> absent</span>
    <span><b>${ac.late}</b> late</span>
    <span><b>${ac.excused}</b> excused</span>
    ${rate != null ? `<span><b>${rate}%</b> attendance over ${totalDays} day${totalDays === 1 ? "" : "s"}</span>` : ""}
  </div>

  <h2>Discipline</h2>
  <table><thead><tr><th>Date</th><th>Type</th><th>Severity</th><th>Status</th><th>Description</th></tr></thead><tbody>${discRows}</tbody></table>

  <footer>
    <span>Teacher: ${esc(teacherName)}</span>
    <span>Signature: ______________________</span>
  </footer>
</body></html>`;
}

// ───────────────────────────────────────────────────────────────
//  INIT
// ───────────────────────────────────────────────────────────────
try {
  TEACHER_ID = await db.getTeacherId();
  const [year, teacher] = await Promise.all([
    db.fetchActiveYear(),
    db.fetchTeacher(TEACHER_ID),
  ]);
  ACTIVE_YEAR = year;
  PERIODS = await db.fetchGradingPeriods(year?.id);

  document.getElementById("teacher-name").textContent =
    `${teacher.first_name} ${teacher.last_name}`;
} catch (err) {
  console.error("Failed to resolve teacher context:", err);
  showToast("Could not load teacher context.", "error");
}

showSection("today");
