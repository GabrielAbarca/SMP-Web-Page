// ═══════════════════════════════════════════════════════════════
//  admin.js — Simple Manage Pro | Admin Console
//
//  Architecture:
//  1. Auth guard
//  2. Data layer  (db object — all Supabase queries)
//  3. Navigation  (SPA view switching)
//  4. UI helpers  (modal, toast, confirm, table helpers)
//  5. Overview
//  6. Students    (full CRUD — template pattern)
//  7. Classes
//  8. Subjects
//  9. Schedules
// 10. Grades
// 11. Attendance
// ═══════════════════════════════════════════════════════════════

import { supabase } from "./supabaseClient.js";
import { signOut, getSession } from "./auth.js";

// ───────────────────────────────────────────────────────────────
//  1. AUTH GUARD
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

document.getElementById("admin-name").textContent =
  adminProfile.name ?? session.user.email;

// ───────────────────────────────────────────────────────────────
//  2. DATA LAYER
// ───────────────────────────────────────────────────────────────
const db = {
  // ── Reference data ─────────────────────────────────────────
  async fetchClasses() {
    const { data, error } = await supabase
      .from("classes")
      .select("id, display_name, section, grade_levels!grade_level_id(name)")
      .order("display_name");
    if (error) throw error;
    return data;
  },

  async fetchClassesDetailed() {
    const { data, error } = await supabase
      .from("classes")
      .select(
        `
        id, section, display_name, max_capacity,
        grade_level_id, school_year_id, homeroom_teacher_id, room_id,
        grade_levels!grade_level_id(name),
        school_years!school_year_id(id, name),
        teachers!homeroom_teacher_id(first_name, last_name),
        rooms!room_id(name)
      `,
      )
      .order("display_name");
    if (error) throw error;
    return data;
  },

  async fetchSubjects() {
    const { data, error } = await supabase
      .from("subjects")
      .select("id, name, code, color")
      .order("name");
    if (error) throw error;
    return data;
  },

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

  async fetchTeachers() {
    const { data, error } = await supabase
      .from("teachers")
      .select("id, first_name, last_name")
      .order("last_name");
    if (error) throw error;
    return data;
  },

  async fetchGradeLevels() {
    const { data, error } = await supabase
      .from("grade_levels")
      .select("id, name, numeric_level")
      .order("numeric_level");
    if (error) throw error;
    return data;
  },

  async fetchSchoolYears() {
    const { data, error } = await supabase
      .from("school_years")
      .select("id, name, is_active")
      .order("name");
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

  async fetchGradingPeriods() {
    const { data, error } = await supabase
      .from("grading_periods")
      .select("id, name, period_order")
      .order("period_order");
    if (error) throw error;
    return data;
  },

  // ── Students ────────────────────────────────────────────────
  async fetchStudents({ search = "", classId = "", status = "" } = {}) {
    let query = supabase
      .from("students")
      .select(
        `
        id, first_name, last_name, email, status, enrollment_number,
        classes!class_id(id, display_name, grade_levels(name))
      `,
      )
      .order("last_name");

    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`,
      );
    }
    if (classId) query = query.eq("class_id", classId);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
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

  async fetchStudentCountByClass() {
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

  // ── Classes ─────────────────────────────────────────────────
  async insertClass(payload) {
    const { error } = await supabase.from("classes").insert(payload);
    if (error) throw error;
  },

  async updateClass(id, payload) {
    const { error } = await supabase
      .from("classes")
      .update(payload)
      .eq("id", id);
    if (error) throw error;
  },

  async deleteClass(id) {
    const { error } = await supabase.from("classes").delete().eq("id", id);
    if (error) throw error;
  },

  // ── Subjects ────────────────────────────────────────────────
  async insertSubject(payload) {
    const { error } = await supabase.from("subjects").insert(payload);
    if (error) throw error;
  },

  async updateSubject(id, payload) {
    const { error } = await supabase
      .from("subjects")
      .update(payload)
      .eq("id", id);
    if (error) throw error;
  },

  async deleteSubject(id) {
    const { error } = await supabase.from("subjects").delete().eq("id", id);
    if (error) throw error;
  },

  // ── Schedules ───────────────────────────────────────────────
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

  // ── Grades ──────────────────────────────────────────────────
  async fetchGradeMatrix(classId, periodId) {
    const [studentsRes, cstsRes, gradesRes] = await Promise.all([
      supabase
        .from("students")
        .select("id, first_name, last_name")
        .eq("class_id", classId)
        .eq("status", "active")
        .order("last_name"),
      supabase
        .from("class_subject_teachers")
        .select("id, subjects!subject_id(id, name)")
        .eq("class_id", classId),
      supabase
        .from("student_grades")
        .select("student_id, class_subject_teacher_id, score")
        .eq("grading_period_id", periodId),
    ]);
    if (studentsRes.error) throw studentsRes.error;
    if (cstsRes.error) throw cstsRes.error;
    if (gradesRes.error) throw gradesRes.error;
    return {
      students: studentsRes.data ?? [],
      subjects: cstsRes.data ?? [],
      grades: gradesRes.data ?? [],
      periodId,
    };
  },

  async upsertGrades(rows, periodId) {
    const { error } = await supabase.from("student_grades").upsert(
      rows.map((r) => ({ ...r, grading_period_id: periodId })),
      { onConflict: "student_id,class_subject_teacher_id,grading_period_id" },
    );
    if (error) throw error;
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
    return (studentsRes.data ?? []).map((s) => ({
      ...s,
      status: recordMap[s.id]?.status ?? "present",
      notes: recordMap[s.id]?.notes ?? "",
    }));
  },

  async upsertAttendance(classId, date, rows) {
    const payload = rows.map((r) => ({
      student_id: r.id,
      class_id: classId,
      date,
      status: r.status,
      notes: r.notes || null,
    }));
    const { error } = await supabase
      .from("attendance")
      .upsert(payload, { onConflict: "student_id,class_id,date" });
    if (error) throw error;
  },

  async fetchAttendanceToday() {
    const today = new Date().toISOString().split("T")[0];
    const { data, error } = await supabase
      .from("attendance")
      .select("status")
      .eq("date", today);
    if (error) throw error;
    if (!data?.length) return null;
    // Count present + late as "present"
    const present = data.filter(
      (r) => r.status === "present" || r.status === "late",
    ).length;
    return Math.round((present / data.length) * 100);
  },

  // ── Overview ────────────────────────────────────────────────
  async fetchStats() {
    const [students, teachers, classes, attendance] = await Promise.all([
      supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabase.from("teachers").select("id", { count: "exact", head: true }),
      supabase.from("classes").select("id", { count: "exact", head: true }),
      this.fetchAttendanceToday().catch(() => null),
    ]);
    return {
      students: students.count ?? 0,
      teachers: teachers.count ?? 0,
      classes: classes.count ?? 0,
      attendance,
    };
  },

  async fetchRecentEnrollments(limit = 8) {
    const { data, error } = await supabase
      .from("students")
      .select(
        `
        id, first_name, last_name, status, created_at,
        classes!class_id(display_name, grade_levels(name))
      `,
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  },

  async fetchPendingActions() {
    const [unassigned, discipline] = await Promise.all([
      supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .is("class_id", null)
        .eq("status", "active"),
      supabase
        .from("discipline_records")
        .select("id", { count: "exact", head: true })
        .eq("resolved", false),
    ]);
    return {
      unassignedStudents: unassigned.count ?? 0,
      unresolvedDiscipline: discipline.count ?? 0,
    };
  },
};

// ───────────────────────────────────────────────────────────────
//  3. NAVIGATION
// ───────────────────────────────────────────────────────────────
const sections = document.querySelectorAll(".view-section");
const navLinks = document.querySelectorAll(".sidebar a[data-page]");

function showSection(page) {
  sections.forEach((s) => s.classList.remove("active"));
  navLinks.forEach((a) => a.classList.remove("active"));
  const target = document.getElementById(`view-${page}`);
  const link = document.querySelector(`.sidebar a[data-page="${page}"]`);
  if (target) target.classList.add("active");
  if (link) link.classList.add("active");
  sectionLoaders[page]?.();
}

const loaded = {};

const sectionLoaders = {
  overview: () => {
    if (!loaded.overview) {
      loaded.overview = true;
      loadOverview();
    }
  },
  students: () => {
    if (!loaded.students) {
      loaded.students = true;
      loadStudents();
    }
  },
  classes: () => {
    if (!loaded.classes) {
      loaded.classes = true;
      loadClasses();
    }
  },
  subjects: () => {
    if (!loaded.subjects) {
      loaded.subjects = true;
      loadSubjects();
    }
  },
  schedules: () => {
    if (!loaded.schedules) {
      loaded.schedules = true;
      loadSchedules();
    }
  },
  grades: () => {
    if (!loaded.grades) {
      loaded.grades = true;
      loadGrades();
    }
  },
  attendance: () => {
    if (!loaded.attendance) {
      loaded.attendance = true;
      loadAttendance();
    }
  },
};

navLinks.forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    showSection(link.dataset.page);
    document.querySelector("aside").classList.remove("active"); // close mobile menu
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
document.querySelector(".theme-toggler")?.addEventListener("click", () => {
  document.body.classList.toggle("dark-theme-variables");
  document
    .querySelectorAll(".theme-toggler span")
    .forEach((s) => s.classList.toggle("active"));
});

showSection("overview");

// ───────────────────────────────────────────────────────────────
//  4. UI HELPERS
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

      // Placeholder / empty option
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
    } else {
      // text, email, number, color, date, time …
      input = document.createElement("input");
      input.id = `modal-field-${field.name}`;
      input.type = field.type ?? "text";
      input.name = field.name;
      input.value = field.value ?? "";
      if (field.required) input.required = true;
      if (field.placeholder) input.placeholder = field.placeholder;
      if (field.min != null) input.min = field.min;
      if (field.max != null) input.max = field.max;
    }

    group.appendChild(input);
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

// ── Table helpers ──────────────────────────────────────────────
function renderEmptyRow(tbodyId, colspan, message = "No records found.") {
  const tbody = document.getElementById(tbodyId);
  if (tbody)
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="loading-cell">${message}</td></tr>`;
}

function renderErrorRow(tbodyId, colspan) {
  renderEmptyRow(tbodyId, colspan, "Failed to load data. Please try again.");
}

function makeActionBtn(icon, label, onClick, danger = false) {
  const btn = document.createElement("button");
  btn.className = `btn-icon${danger ? " danger" : ""}`;
  btn.title = label;
  btn.innerHTML = `<span class="material-symbols-outlined">${icon}</span>`;
  btn.addEventListener("click", onClick);
  return btn;
}

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

// ───────────────────────────────────────────────────────────────
//  5. OVERVIEW SECTION
// ───────────────────────────────────────────────────────────────
async function loadOverview() {
  // ── Stat cards ───────────────────────────────────────────────
  try {
    const stats = await db.fetchStats();
    document.getElementById("stat-students-value").textContent = stats.students;
    document.getElementById("stat-teachers-value").textContent = stats.teachers;
    document.getElementById("stat-classes-value").textContent = stats.classes;

    const attEl = document.getElementById("stat-attendance-value");
    const attSub = document.getElementById("stat-attendance-sub");
    if (stats.attendance !== null) {
      attEl.textContent = `${stats.attendance}%`;
      attSub.textContent = `${stats.attendance >= 80 ? "Good" : "Low"} today — school-wide`;
    } else {
      attEl.textContent = "—%";
      attSub.textContent = "No attendance recorded today";
    }
  } catch (err) {
    console.error("Stats error:", err);
    ["students", "teachers", "classes"].forEach((k) => {
      document.getElementById(`stat-${k}-value`).textContent = "!";
    });
  }

  // ── Recent enrollments ───────────────────────────────────────
  const tbody = document.getElementById("recent-enrollments-body");
  try {
    const enrollments = await db.fetchRecentEnrollments();
    if (!enrollments.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="loading-cell">No enrollments yet.</td></tr>';
    } else {
      tbody.innerHTML = enrollments
        .map((s) => {
          const name = `${s.first_name} ${s.last_name}`;
          const cls = s.classes?.display_name ?? "—";
          const grade = s.classes?.grade_levels?.name ?? "—";
          const date = s.created_at
            ? new Date(s.created_at).toLocaleDateString()
            : "—";
          const badge =
            s.status === "active"
              ? '<span class="badge badge-success">Active</span>'
              : '<span class="badge badge-neutral">Inactive</span>';
          return `<tr>
          <td>${name}</td><td>${cls}</td><td>${grade}</td>
          <td>${date}</td><td>${badge}</td>
        </tr>`;
        })
        .join("");
    }
  } catch {
    renderErrorRow("recent-enrollments-body", 5);
  }

  // ── Pending actions ──────────────────────────────────────────
  const pendingList = document.getElementById("pending-actions-list");
  try {
    const pending = await db.fetchPendingActions();
    const items = [];

    if (pending.unassignedStudents > 0) {
      items.push(`<li class="pending-item">
        <span class="material-symbols-outlined" style="color:var(--color-warning,#f59e0b)">warning</span>
        <span>${pending.unassignedStudents} active student${pending.unassignedStudents > 1 ? "s" : ""} not assigned to a class</span>
      </li>`);
    }
    if (pending.unresolvedDiscipline > 0) {
      items.push(`<li class="pending-item">
        <span class="material-symbols-outlined" style="color:var(--color-danger,#ef4444)">report</span>
        <span>${pending.unresolvedDiscipline} unresolved discipline record${pending.unresolvedDiscipline > 1 ? "s" : ""}</span>
      </li>`);
    }
    if (items.length === 0) {
      items.push(`<li class="pending-item">
        <span class="material-symbols-outlined" style="color:var(--color-success,#22c55e)">check_circle</span>
        <span>No pending actions — everything looks good!</span>
      </li>`);
    }
    pendingList.innerHTML = items.join("");
  } catch {
    pendingList.innerHTML =
      '<li class="loading-cell">Failed to load pending actions.</li>';
  }
}

// ───────────────────────────────────────────────────────────────
//  6. STUDENTS SECTION
// ───────────────────────────────────────────────────────────────
let studentsFilter = { search: "", classId: "", status: "" };
let classOptions = [];

async function loadStudents() {
  const tbody = document.getElementById("students-body");
  tbody.innerHTML =
    '<tr><td colspan="6" class="loading-cell">Loading students...</td></tr>';

  // Populate class filter dropdown (once)
  if (!classOptions.length) {
    try {
      const classes = await db.fetchClasses();
      classOptions = classes.map((c) => ({
        value: c.id,
        label: c.display_name,
      }));
      const sel = document.getElementById("students-filter-class");
      classOptions.forEach((opt) => {
        const o = document.createElement("option");
        o.value = opt.value;
        o.textContent = opt.label;
        sel.appendChild(o);
      });
    } catch {
      /* non-fatal */
    }
  }

  try {
    const students = await db.fetchStudents(studentsFilter);
    renderStudentsTable(students);
  } catch {
    renderErrorRow("students-body", 6);
  }
}

function renderStudentsTable(students) {
  const tbody = document.getElementById("students-body");
  if (!students.length) {
    renderEmptyRow(
      "students-body",
      6,
      "No students match your current filters.",
    );
    return;
  }

  tbody.innerHTML = "";
  students.forEach((student) => {
    const fullName = `${student.first_name} ${student.last_name}`;
    const email = student.email ?? "—";
    const className = student.classes?.display_name ?? "—";
    const grade = student.classes?.grade_levels?.name ?? "—";
    const badge =
      student.status === "active"
        ? '<span class="badge badge-success">Active</span>'
        : '<span class="badge badge-neutral">Inactive</span>';

    const tr = document.createElement("tr");
    tr.dataset.id = student.id;

    const actionsCell = document.createElement("td");
    actionsCell.className = "actions-col";
    actionsCell.appendChild(
      makeActionBtn("edit", "Edit", () => openEditStudent(student)),
    );
    actionsCell.appendChild(
      makeActionBtn(
        "delete",
        "Delete",
        () => confirmDeleteStudent(student.id, fullName),
        true,
      ),
    );

    tr.innerHTML = `
      <td>${fullName}</td>
      <td>${email}</td>
      <td>${grade}</td>
      <td>${className}</td>
      <td>${badge}</td>
    `;
    tr.appendChild(actionsCell);
    tbody.appendChild(tr);
  });
}

// ── Search + Filter wiring ─────────────────────────────────────
let studentsSearchTimeout;
document.getElementById("students-search")?.addEventListener("input", (e) => {
  clearTimeout(studentsSearchTimeout);
  studentsSearchTimeout = setTimeout(() => {
    studentsFilter.search = e.target.value.trim();
    loadStudents();
  }, 350);
});

document
  .getElementById("students-filter-class")
  ?.addEventListener("change", (e) => {
    studentsFilter.classId = e.target.value;
    loadStudents();
  });

document
  .getElementById("students-filter-status")
  ?.addEventListener("change", (e) => {
    studentsFilter.status = e.target.value;
    loadStudents();
  });

// ── Add Student ────────────────────────────────────────────────
document
  .getElementById("btn-add-student")
  ?.addEventListener("click", openAddStudent);

async function openAddStudent() {
  const classes = classOptions.length
    ? classOptions
    : await db
        .fetchClasses()
        .then((c) => c.map((x) => ({ value: x.id, label: x.display_name })));

  openModal({
    title: "Add Student",
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
        placeholder: "e.g. María",
      },
      {
        name: "last_name",
        label: "Last Name",
        type: "text",
        required: true,
        placeholder: "e.g. González",
      },
      {
        name: "email",
        label: "Email",
        type: "email",
        placeholder: "student@example.com",
      },
      {
        name: "class_id",
        label: "Class",
        type: "select",
        required: true,
        options: classes,
      },
      {
        name: "status",
        label: "Status",
        type: "select",
        required: true,
        value: "active",
        options: [
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
        ],
      },
    ],
    onSubmit: async (formData) => {
      await db.insertStudent({
        enrollment_number: formData.enrollment_number.trim(),
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        email: formData.email?.trim() || null,
        class_id: formData.class_id || null,
        status: formData.status,
      });
      showToast(`${formData.first_name} ${formData.last_name} added.`);
      loaded.students = false;
      loadStudents();
    },
  });
}

// ── Edit Student ───────────────────────────────────────────────
async function openEditStudent(student) {
  const classes = classOptions.length
    ? classOptions
    : await db
        .fetchClasses()
        .then((c) => c.map((x) => ({ value: x.id, label: x.display_name })));

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
      {
        name: "email",
        label: "Email",
        type: "email",
        value: student.email ?? "",
      },
      {
        name: "class_id",
        label: "Class",
        type: "select",
        required: true,
        options: classes,
        value: student.classes?.id ?? "",
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
      await db.updateStudent(student.id, {
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        email: formData.email?.trim() || null,
        class_id: formData.class_id || null,
        status: formData.status,
      });
      showToast(`${formData.first_name} ${formData.last_name} updated.`);
      loadStudents();
    },
  });
}

// ── Delete Student ─────────────────────────────────────────────
function confirmDeleteStudent(id, name) {
  openConfirm(
    `Delete "${name}"? This removes their record permanently and cannot be undone.`,
    async () => {
      await db.deleteStudent(id);
      showToast(`${name} deleted.`);
      loadStudents();
    },
  );
}

// ───────────────────────────────────────────────────────────────
//  7. CLASSES SECTION
// ───────────────────────────────────────────────────────────────

let _cachedClasses = [];
let _cachedCountMap = {};
let classesFilter = { search: "", yearId: "" };

async function loadClasses() {
  renderEmptyRow("classes-body", 7, "Loading classes...");

  const yearSelect = document.getElementById("classes-filter-year");
  if (yearSelect.options.length === 1) {
    try {
      const years = await db.fetchSchoolYears();
      years.forEach((y) => {
        const o = document.createElement("option");
        o.value = y.id;
        o.textContent = y.name + (y.is_active ? " ★" : "");
        yearSelect.appendChild(o);
      });
    } catch {}
  }

  try {
    [_cachedClasses, _cachedCountMap] = await Promise.all([
      db.fetchClassesDetailed(),
      db.fetchStudentCountByClass(),
    ]);
    renderClassesTable();
  } catch (err) {
    console.error(err);
    renderErrorRow("classes-body", 7);
    showToast("Failed to load classes.", "error");
  }
}

function renderClassesTable() {
  const tbody = document.getElementById("classes-body");

  let filtered = _cachedClasses;
  if (classesFilter.search) {
    const q = classesFilter.search.toLowerCase();
    filtered = filtered.filter(
      (c) =>
        c.section?.toLowerCase().includes(q) ||
        c.display_name?.toLowerCase().includes(q) ||
        c.teachers?.first_name?.toLowerCase().includes(q) ||
        c.teachers?.last_name?.toLowerCase().includes(q),
    );
  }
  if (classesFilter.yearId) {
    filtered = filtered.filter(
      (c) => String(c.school_year_id) === String(classesFilter.yearId),
    );
  }

  if (!filtered.length) {
    renderEmptyRow("classes-body", 7, "No classes match your filters.");
    return;
  }

  tbody.innerHTML = "";
  filtered.forEach((cls) => {
    const teacher = cls.teachers
      ? `${cls.teachers.first_name} ${cls.teachers.last_name}`
      : "—";
    const enrolled = _cachedCountMap[cls.id] ?? 0;
    const capacity = cls.max_capacity ?? "—";

    const tr = document.createElement("tr");
    const actionsCell = document.createElement("td");
    actionsCell.className = "actions-col";
    actionsCell.appendChild(
      makeActionBtn("edit", "Edit", () => openEditClass(cls)),
    );
    actionsCell.appendChild(
      makeActionBtn(
        "delete",
        "Delete",
        () => confirmDeleteClass(cls.id, cls.display_name),
        true,
      ),
    );

    tr.innerHTML = `
      <td>${cls.section ?? "—"}</td>
      <td>${cls.grade_levels?.name ?? "—"}</td>
      <td>${cls.school_years?.name ?? "—"}</td>
      <td>${teacher}</td>
      <td>${cls.rooms?.name ?? "—"}</td>
      <td>${enrolled} / ${capacity}</td>
    `;
    tr.appendChild(actionsCell);
    tbody.appendChild(tr);
  });
}

let classesSearchTimeout;
document.getElementById("classes-search")?.addEventListener("input", (e) => {
  clearTimeout(classesSearchTimeout);
  classesSearchTimeout = setTimeout(() => {
    classesFilter.search = e.target.value.trim();
    if (_cachedClasses.length) renderClassesTable();
  }, 350);
});

document
  .getElementById("classes-filter-year")
  ?.addEventListener("change", (e) => {
    classesFilter.yearId = e.target.value;
    if (_cachedClasses.length) renderClassesTable();
    else loadClasses();
  });

async function fetchClassModalDependencies() {
  const [gradeLevels, schoolYears, teachers, rooms] = await Promise.all([
    db.fetchGradeLevels(),
    db.fetchSchoolYears(),
    db.fetchTeachers(),
    db.fetchRooms(),
  ]);
  return { gradeLevels, schoolYears, teachers, rooms };
}

document
  .getElementById("btn-add-class")
  ?.addEventListener("click", openAddClass);

async function openAddClass() {
  let deps;
  try {
    deps = await fetchClassModalDependencies();
  } catch (err) {
    showToast("Failed to load form data: " + err.message, "error");
    return;
  }
  const { gradeLevels, schoolYears, teachers, rooms } = deps;

  openModal({
    title: "Add Class",
    submitLabel: "Add Class",
    fields: [
      {
        name: "section",
        label: "Section",
        type: "text",
        required: true,
        placeholder: "e.g. A",
      },
      {
        name: "display_name",
        label: "Display Name",
        type: "text",
        required: true,
        placeholder: "e.g. 7th-A",
      },
      {
        name: "grade_level_id",
        label: "Grade Level",
        type: "select",
        required: true,
        options: gradeLevels.map((g) => ({ value: g.id, label: g.name })),
      },
      {
        name: "school_year_id",
        label: "School Year",
        type: "select",
        required: true,
        options: schoolYears.map((y) => ({
          value: y.id,
          label: y.name + (y.is_active ? " ★" : ""),
        })),
      },
      {
        name: "homeroom_teacher_id",
        label: "Homeroom Teacher",
        type: "select",
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
      {
        name: "max_capacity",
        label: "Max Capacity",
        type: "number",
        value: "30",
        min: 1,
      },
    ],
    onSubmit: async (formData) => {
      await db.insertClass({
        section: formData.section.trim(),
        display_name: formData.display_name.trim(),
        grade_level_id: Number(formData.grade_level_id),
        school_year_id: Number(formData.school_year_id),
        homeroom_teacher_id: formData.homeroom_teacher_id
          ? Number(formData.homeroom_teacher_id)
          : null,
        room_id: formData.room_id ? Number(formData.room_id) : null,
        max_capacity: formData.max_capacity
          ? Number(formData.max_capacity)
          : 30,
      });
      showToast(`Class "${formData.display_name}" added.`);
      loaded.classes = false;
      _cachedClasses = [];
      loadClasses();
    },
  });
}

async function openEditClass(cls) {
  let deps;
  try {
    deps = await fetchClassModalDependencies();
  } catch (err) {
    showToast("Failed to load form data: " + err.message, "error");
    return;
  }
  const { gradeLevels, schoolYears, teachers, rooms } = deps;

  openModal({
    title: "Edit Class",
    submitLabel: "Save Changes",
    fields: [
      {
        name: "section",
        label: "Section",
        type: "text",
        required: true,
        value: cls.section,
      },
      {
        name: "display_name",
        label: "Display Name",
        type: "text",
        required: true,
        value: cls.display_name,
      },
      {
        name: "grade_level_id",
        label: "Grade Level",
        type: "select",
        required: true,
        options: gradeLevels.map((g) => ({ value: g.id, label: g.name })),
        value: cls.grade_level_id,
      },
      {
        name: "school_year_id",
        label: "School Year",
        type: "select",
        required: true,
        options: schoolYears.map((y) => ({
          value: y.id,
          label: y.name + (y.is_active ? " ★" : ""),
        })),
        value: cls.school_year_id,
      },
      {
        name: "homeroom_teacher_id",
        label: "Homeroom Teacher",
        type: "select",
        options: teachers.map((t) => ({
          value: t.id,
          label: `${t.last_name}, ${t.first_name}`,
        })),
        value: cls.homeroom_teacher_id ?? "",
      },
      {
        name: "room_id",
        label: "Room",
        type: "select",
        options: rooms.map((r) => ({ value: r.id, label: r.name })),
        value: cls.room_id ?? "",
      },
      {
        name: "max_capacity",
        label: "Max Capacity",
        type: "number",
        value: cls.max_capacity ?? 30,
        min: 1,
      },
    ],
    onSubmit: async (formData) => {
      await db.updateClass(cls.id, {
        section: formData.section.trim(),
        display_name: formData.display_name.trim(),
        grade_level_id: Number(formData.grade_level_id),
        school_year_id: Number(formData.school_year_id),
        homeroom_teacher_id: formData.homeroom_teacher_id
          ? Number(formData.homeroom_teacher_id)
          : null,
        room_id: formData.room_id ? Number(formData.room_id) : null,
        max_capacity: formData.max_capacity
          ? Number(formData.max_capacity)
          : 30,
      });
      showToast(`Class "${formData.display_name}" updated.`);
      loaded.classes = false;
      _cachedClasses = [];
      loadClasses();
    },
  });
}

function confirmDeleteClass(id, name) {
  openConfirm(
    `Delete class "${name}"? Students in this class will have their class assignment removed.`,
    async () => {
      await db.deleteClass(id);
      showToast(`Class "${name}" deleted.`);
      loaded.classes = false;
      _cachedClasses = [];
      loadClasses();
    },
  );
}

// ───────────────────────────────────────────────────────────────
//  8. SUBJECTS SECTION
// ───────────────────────────────────────────────────────────────
let _cachedSubjects = [];
let subjectsFilter = { search: "" };

async function loadSubjects() {
  renderEmptyRow("subjects-body", 5, "Loading subjects...");
  try {
    _cachedSubjects = await db.fetchSubjectsDetailed();
    renderSubjectsTable();
  } catch (err) {
    console.error(err);
    renderErrorRow("subjects-body", 5);
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
    renderEmptyRow("subjects-body", 5, "No subjects match your search.");
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
           vertical-align:middle;margin-right:6px;"></span>${subject.color}`
      : "—";

    const tr = document.createElement("tr");
    const actionsCell = document.createElement("td");
    actionsCell.className = "actions-col";
    actionsCell.appendChild(
      makeActionBtn("edit", "Edit", () => openEditSubject(subject)),
    );
    actionsCell.appendChild(
      makeActionBtn(
        "delete",
        "Delete",
        () => confirmDeleteSubject(subject.id, subject.name),
        true,
      ),
    );

    tr.innerHTML = `
      <td><code>${subject.code ?? "—"}</code></td>
      <td>${subject.name}</td>
      <td>${colorSwatch}</td>
      <td>${gradeLevelNames}</td>
    `;
    tr.appendChild(actionsCell);
    tbody.appendChild(tr);
  });
}

// Search wiring
let subjectsSearchTimeout;
document.getElementById("subjects-search")?.addEventListener("input", (e) => {
  clearTimeout(subjectsSearchTimeout);
  subjectsSearchTimeout = setTimeout(() => {
    subjectsFilter.search = e.target.value.trim();
    if (_cachedSubjects.length) renderSubjectsTable();
  }, 350);
});

document
  .getElementById("btn-add-subject")
  ?.addEventListener("click", openAddSubject);

function openAddSubject() {
  openModal({
    title: "Add Subject",
    submitLabel: "Add Subject",
    fields: [
      {
        name: "name",
        label: "Name",
        type: "text",
        required: true,
        placeholder: "e.g. Mathematics",
      },
      { name: "code", label: "Code", type: "text", placeholder: "e.g. MAT-7" },
      { name: "color", label: "Color", type: "color", value: "#3b82f6" },
      { name: "description", label: "Description", type: "textarea" },
    ],
    onSubmit: async (formData) => {
      await db.insertSubject({
        name: formData.name.trim(),
        code: formData.code?.trim() || null,
        color: formData.color || null,
        description: formData.description?.trim() || null,
      });
      showToast(`Subject "${formData.name}" added.`);
      loaded.subjects = false;
      _cachedSubjects = [];
      loadSubjects();
    },
  });
}

function openEditSubject(subject) {
  openModal({
    title: "Edit Subject",
    submitLabel: "Save Changes",
    fields: [
      {
        name: "name",
        label: "Name",
        type: "text",
        required: true,
        value: subject.name,
      },
      { name: "code", label: "Code", type: "text", value: subject.code ?? "" },
      {
        name: "color",
        label: "Color",
        type: "color",
        value: subject.color ?? "#3b82f6",
      },
      {
        name: "description",
        label: "Description",
        type: "textarea",
        value: subject.description ?? "",
      },
    ],
    onSubmit: async (formData) => {
      await db.updateSubject(subject.id, {
        name: formData.name.trim(),
        code: formData.code?.trim() || null,
        color: formData.color || null,
        description: formData.description?.trim() || null,
      });
      showToast(`Subject "${formData.name}" updated.`);
      loaded.subjects = false;
      _cachedSubjects = [];
      loadSubjects();
    },
  });
}

function confirmDeleteSubject(id, name) {
  openConfirm(
    `Delete subject "${name}"? This may affect schedules and grade records.`,
    async () => {
      await db.deleteSubject(id);
      showToast(`Subject "${name}" deleted.`);
      loaded.subjects = false;
      _cachedSubjects = [];
      loadSubjects();
    },
  );
}

// ───────────────────────────────────────────────────────────────
//  9. SCHEDULES SECTION
// ───────────────────────────────────────────────────────────────
let _currentScheduleClassId = null;

async function loadSchedules() {
  const select = document.getElementById("schedules-class-select");

  if (select.options.length <= 1) {
    try {
      const classes = await db.fetchClasses();
      classes.forEach((c) => {
        const o = document.createElement("option");
        o.value = c.id;
        o.textContent = c.display_name;
        select.appendChild(o);
      });
    } catch {
      showToast("Failed to load classes for schedule.", "error");
    }
  }

  if (!select._wired) {
    select._wired = true;
    select.addEventListener("change", () => {
      _currentScheduleClassId = select.value || null;
      if (_currentScheduleClassId)
        loadScheduleForClass(_currentScheduleClassId);
      else {
        document.getElementById("admin-schedule-grid").innerHTML =
          '<div class="loading-cell">Select a class to view its schedule.</div>';
      }
    });
  }
}

async function loadScheduleForClass(classId) {
  const container = document.getElementById("admin-schedule-grid");
  container.innerHTML = '<div class="loading-cell">Loading schedule...</div>';

  try {
    const entries = await db.fetchScheduleByClass(classId);
    renderScheduleTable(entries);
  } catch (err) {
    container.innerHTML =
      '<div class="loading-cell">Failed to load schedule.</div>';
    showToast(err.message, "error");
  }
}

function renderScheduleTable(entries) {
  const container = document.getElementById("admin-schedule-grid");

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
        <th>Day</th>
        <th>Start</th>
        <th>End</th>
        <th>Subject</th>
        <th>Teacher</th>
        <th>Room</th>
        <th class="actions-col">Actions</th>
      </tr>
    </thead>
  `;
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
            loadScheduleForClass(_currentScheduleClassId);
          });
        },
        true,
      ),
    );

    tr.innerHTML = `
      <td>${DAY_NAMES[entry.day_of_week] ?? entry.day_of_week}</td>
      <td>${entry.start_time}</td>
      <td>${entry.end_time}</td>
      <td>${dot}${entry.subjects?.name ?? "—"}</td>
      <td>${entry.teachers ? entry.teachers.first_name + " " + entry.teachers.last_name : "—"}</td>
      <td>${entry.rooms?.name ?? "—"}</td>
    `;
    tr.appendChild(actionsCell);
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.innerHTML = "";
  container.appendChild(table);
}

// ── Add Schedule Entry ─────────────────────────────────────────
document
  .getElementById("btn-add-schedule")
  ?.addEventListener("click", async () => {
    if (!_currentScheduleClassId) {
      showToast("Please select a class first.", "error");
      return;
    }

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
      title: "Add Schedule Entry",
      submitLabel: "Add Entry",
      fields: [
        {
          name: "day_of_week",
          label: "Day",
          type: "select",
          required: true,
          options: DAY_NAMES.slice(1).map((d, i) => ({
            value: i + 1,
            label: d,
          })),
        },
        {
          name: "start_time",
          label: "Start Time",
          type: "time",
          required: true,
        },
        { name: "end_time", label: "End Time", type: "time", required: true },
        {
          name: "subject_id",
          label: "Subject",
          type: "select",
          required: true,
          options: subjects.map((s) => ({ value: s.id, label: s.name })),
        },
        {
          name: "teacher_id",
          label: "Teacher",
          type: "select",
          required: true,
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
          class_id: _currentScheduleClassId,
          day_of_week: Number(formData.day_of_week),
          start_time: formData.start_time,
          end_time: formData.end_time,
          subject_id: Number(formData.subject_id),
          teacher_id: Number(formData.teacher_id),
          room_id: formData.room_id ? Number(formData.room_id) : null,
        });
        showToast("Schedule entry added.");
        loadScheduleForClass(_currentScheduleClassId);
      },
    });
  });

// ───────────────────────────────────────────────────────────────
//  10. GRADES SECTION
// ───────────────────────────────────────────────────────────────
let _gradesMatrix = null; // cached last loaded matrix

async function loadGrades() {
  const classSelect = document.getElementById("grades-class-select");
  const periodSelect = document.getElementById("grades-period-select");

  // Populate class + period dropdowns (once each)
  if (classSelect.options.length <= 1) {
    try {
      const [classes, periods] = await Promise.all([
        db.fetchClasses(),
        db.fetchGradingPeriods(),
      ]);
      classes.forEach((c) => {
        const o = document.createElement("option");
        o.value = c.id;
        o.textContent = c.display_name;
        classSelect.appendChild(o);
      });
      periods.forEach((p) => {
        const o = document.createElement("option");
        o.value = p.id;
        o.textContent = p.name;
        periodSelect.appendChild(o);
      });
    } catch {
      showToast("Failed to load grade filters.", "error");
    }
  }

  // Wire change events (once)
  if (!classSelect._wired) {
    classSelect._wired = true;
    periodSelect._wired = true;
    const loadMatrix = () => {
      const cId = classSelect.value;
      const pId = periodSelect.value;
      if (cId && pId) loadGradeMatrix(cId, pId);
    };
    classSelect.addEventListener("change", loadMatrix);
    periodSelect.addEventListener("change", loadMatrix);
  }
}

async function loadGradeMatrix(classId, periodId) {
  const thead = document.querySelector("#grades-table thead tr");
  const tbody = document.getElementById("grades-matrix-body");
  thead.innerHTML = "<th>Student</th>";
  tbody.innerHTML = '<tr><td class="loading-cell">Loading grades...</td></tr>';

  try {
    _gradesMatrix = await db.fetchGradeMatrix(classId, periodId);
    renderGradeMatrix(_gradesMatrix);
  } catch (err) {
    tbody.innerHTML = `<tr><td class="loading-cell">Failed to load grades: ${err.message}</td></tr>`;
  }
}

function renderGradeMatrix({ students, subjects, grades }) {
  const thead = document.querySelector("#grades-table thead tr");
  const tbody = document.getElementById("grades-matrix-body");

  if (!students.length) {
    thead.innerHTML = "<th>Student</th>";
    tbody.innerHTML =
      '<tr><td class="loading-cell">No active students in this class.</td></tr>';
    return;
  }

  const gradeMap = {};
  grades.forEach((g) => {
    if (!gradeMap[g.student_id]) gradeMap[g.student_id] = {};
    gradeMap[g.student_id][g.class_subject_teacher_id] = g.score;
  });

  thead.innerHTML =
    "<th>Student</th>" +
    subjects.map((cst) => `<th>${cst.subjects?.name ?? "—"}</th>`).join("") +
    "<th>Avg</th>";

  tbody.innerHTML = "";
  students.forEach((student) => {
    const tr = document.createElement("tr");
    let total = 0;
    let count = 0;

    const cells = subjects.map((cst) => {
      const score = gradeMap[student.id]?.[cst.id] ?? "";
      if (score !== "") {
        total += Number(score);
        count++;
      }
      return `<td>
        <input
          class="grade-input"
          type="number" min="0" max="100" step="0.1"
          data-student="${student.id}"
          data-cst="${cst.id}"
          data-original="${score}"
          value="${score}"
          placeholder="—"
        >
      </td>`;
    });

    const avg = count ? (total / count).toFixed(1) : "—";
    tr.innerHTML = `<td>${student.last_name}, ${student.first_name}</td>${cells.join("")}<td>${avg}</td>`;
    tbody.appendChild(tr);
  });
}

// ── Save Grades ────────────────────────────────────────────────
document
  .getElementById("btn-save-grades")
  ?.addEventListener("click", async () => {
    const periodSelect = document.getElementById("grades-period-select");
    const periodId = periodSelect.value;

    if (!periodId || !_gradesMatrix) {
      showToast("Select a class and period before saving.", "error");
      return;
    }

    const inputs = document.querySelectorAll(".grade-input");
    const rows = [];

    inputs.forEach((input) => {
      const score = input.value.trim();
      const original = input.dataset.original ?? "";
      if (score === original) return;
      if (score === "") return;
      rows.push({
        student_id: Number(input.dataset.student),
        class_subject_teacher_id: Number(input.dataset.cst),
        score: Number(score),
      });
    });

    if (!rows.length) {
      showToast("No changes to save.", "error");
      return;
    }

    try {
      await db.upsertGrades(rows, Number(periodId));
      inputs.forEach((input) => {
        input.dataset.original = input.value.trim();
      });
      showToast(`${rows.length} grade${rows.length > 1 ? "s" : ""} saved.`);
    } catch (err) {
      showToast(err.message, "error");
    }
  });

// ───────────────────────────────────────────────────────────────
//  11. ATTENDANCE SECTION
// ───────────────────────────────────────────────────────────────
let _attendanceRows = [];

async function loadAttendance() {
  const classSelect = document.getElementById("attendance-class-select");
  const dateInput = document.getElementById("attendance-date");

  if (!dateInput.value) {
    dateInput.value = new Date().toISOString().split("T")[0];
  }

  if (classSelect.options.length <= 1) {
    try {
      const classes = await db.fetchClasses();
      classes.forEach((c) => {
        const o = document.createElement("option");
        o.value = c.id;
        o.textContent = c.display_name;
        classSelect.appendChild(o);
      });
    } catch {
      showToast("Failed to load classes for attendance.", "error");
    }
  }

  if (!classSelect._wired) {
    classSelect._wired = true;
    dateInput._wired = true;
    const loadSheet = () => {
      const cId = classSelect.value;
      const date = dateInput.value;
      if (cId && date) loadAttendanceSheet(cId, date);
    };
    classSelect.addEventListener("change", loadSheet);
    dateInput.addEventListener("change", loadSheet);
  }
}

async function loadAttendanceSheet(classId, date) {
  const tbody = document.getElementById("attendance-admin-body");
  tbody.innerHTML =
    '<tr><td colspan="3" class="loading-cell">Loading attendance...</td></tr>';

  try {
    _attendanceRows = await db.fetchAttendanceSheet(classId, date);
    _attendanceRows.forEach((row) => {
      row._original = { status: row.status, notes: row.notes ?? "" };
    });
    renderAttendanceSheet(_attendanceRows);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="3" class="loading-cell">Error: ${err.message}</td></tr>`;
  }
}

function renderAttendanceSheet(rows) {
  const tbody = document.getElementById("attendance-admin-body");

  if (!rows.length) {
    tbody.innerHTML =
      '<tr><td colspan="3" class="loading-cell">No active students in this class.</td></tr>';
    return;
  }

  const STATUSES = ["present", "absent", "late", "excused"];

  tbody.innerHTML = "";
  rows.forEach((row, idx) => {
    const tr = document.createElement("tr");

    const statusButtons = STATUSES.map((s) => {
      const active = row.status === s ? " active" : "";
      return `<button type="button"
        class="btn btn-sm attendance-status-btn${active}"
        data-idx="${idx}" data-status="${s}"
      >${s.charAt(0).toUpperCase() + s.slice(1)}</button>`;
    }).join("");

    tr.innerHTML = `
      <td>${row.last_name}, ${row.first_name}</td>
      <td><div class="attendance-status-group">${statusButtons}</div></td>
      <td>
        <input type="text" class="attendance-notes-input"
          data-idx="${idx}" value="${row.notes ?? ""}"
          placeholder="Optional note…">
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.addEventListener("click", (e) => {
    const btn = e.target.closest(".attendance-status-btn");
    if (!btn) return;
    const idx = Number(btn.dataset.idx);
    const status = btn.dataset.status;
    _attendanceRows[idx].status = status;

    const group = btn.closest(".attendance-status-group");
    group
      .querySelectorAll(".attendance-status-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  });

  tbody.addEventListener("input", (e) => {
    const input = e.target.closest(".attendance-notes-input");
    if (!input) return;
    _attendanceRows[Number(input.dataset.idx)].notes = input.value;
  });
}

// ── Save Attendance ────────────────────────────────────────────
document
  .getElementById("btn-save-attendance")
  ?.addEventListener("click", async () => {
    const classSelect = document.getElementById("attendance-class-select");
    const dateInput = document.getElementById("attendance-date");
    const classId = classSelect.value;
    const date = dateInput.value;

    if (!classId || !date) {
      showToast("Select a class and date before saving.", "error");
      return;
    }
    if (!_attendanceRows.length) {
      showToast("No attendance data to save.", "error");
      return;
    }

    const changedRows = _attendanceRows.filter((row) => {
      const original = row._original;
      return (
        !original ||
        original.status !== row.status ||
        original.notes !== (row.notes ?? "")
      );
    });

    if (!changedRows.length) {
      showToast("No changes to save.", "error");
      return;
    }

    try {
      await db.upsertAttendance(classId, date, changedRows);
      changedRows.forEach((row) => {
        row._original = { status: row.status, notes: row.notes ?? "" };
      });
      showToast(
        `Attendance saved for ${changedRows.length} student${changedRows.length > 1 ? "s" : ""}.`,
      );
    } catch (err) {
      showToast(err.message, "error");
    }
  });
