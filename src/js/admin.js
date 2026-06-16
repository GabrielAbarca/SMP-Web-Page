// ═══════════════════════════════════════════════════════════════
//  admin.js — Simple Manage Pro | Admin Console
//
//  Architecture:
//  1. Auth guard  — verify session + admin role
//  2. Navigation  — SPA view switching
//  3. UI helpers  — modal, toast, confirm
//  4. Data layer  — Supabase queries (one object per entity)
//  5. Sections    — each section owns its render + CRUD wiring
//     → Overview (read-only stats)
//     → Students  (full CRUD — template for the rest)
//
//  Pattern used by every CRUD section:
//    loadXxx()      fetch + render table rows
//    openAddXxx()   open modal pre-wired for INSERT
//    openEditXxx()  open modal pre-wired for UPDATE
//    deleteXxx()    open confirm → DELETE on confirm
// ═══════════════════════════════════════════════════════════════

import { supabase } from "./supabaseClient.js";
import { signOut, getSession } from "./auth.js";

// ───────────────────────────────────────────────────────────────
//  1. AUTH GUARD
//  Redirects to /login.html if not authenticated or not an admin.
//  Admin role is stored in public.profiles.role = 'admin'.
// ───────────────────────────────────────────────────────────────
const session = await getSession();
if (!session) {
  window.location.replace("/login.html");
  throw new Error("Unauthenticated");
}

export const { data: adminProfile, error: profileError } = await supabase
  .from("profiles")
  .select("name, role")
  .eq("id", session.user.id)
  .single();

if (profileError || adminProfile?.role !== "admin") {
  // Not an admin — send them to the student portal instead
  window.location.replace("/");
  throw new Error("Unauthorized");
}

document.getElementById("admin-name").textContent =
  adminProfile.name ?? session.user.email;

// ───────────────────────────────────────────────────────────────
//  2. NAVIGATION — SPA view switching
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

  // Lazy-load section data on first visit
  sectionLoaders[page]?.();
}

// Track which sections have already been loaded to avoid duplicate fetches
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
  });
});

// Menu button (mobile sidebar toggle — mirrors index.html pattern)
document.getElementById("menu-btn")?.addEventListener("click", () => {
  document.querySelector("aside").classList.toggle("active");
});
document.getElementById("close-btn")?.addEventListener("click", () => {
  document.querySelector("aside").classList.remove("active");
});

// Logout
document.getElementById("logout-btn")?.addEventListener("click", async () => {
  await signOut();
  window.location.replace("/login.html");
});

// Theme toggler — mirrors index.html
document.querySelector(".theme-toggler")?.addEventListener("click", () => {
  document.body.classList.toggle("dark-theme-variables");
  document
    .querySelectorAll(".theme-toggler span")
    .forEach((s) => s.classList.toggle("active"));
});

// Boot into overview
showSection("overview");

// ───────────────────────────────────────────────────────────────
//  3. UI HELPERS
// ───────────────────────────────────────────────────────────────

// ── Toast ────────────────────────────────────────────────────
const toastContainer = document.getElementById("toast-container");

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const icon = type === "success" ? "check_circle" : "error";
  toast.innerHTML = `<span class="material-symbols-outlined">${icon}</span>${message}`;
  toastContainer.appendChild(toast);

  setTimeout(() => toast.remove(), 3500);
}

// ── Generic Modal ────────────────────────────────────────────
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
      placeholder.textContent = `Select ${field.label.toLowerCase()}...`;
      input.appendChild(placeholder);

      (field.options ?? []).forEach((opt) => {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        if (opt.value == field.value) option.selected = true;
        input.appendChild(option);
      });
    } else if (field.type === "textarea") {
      input = document.createElement("textarea");
      input.id = `modal-field-${field.name}`;
      input.name = field.name;
      input.rows = 3;
      input.value = field.value ?? "";
    } else {
      input = document.createElement("input");
      input.id = `modal-field-${field.name}`;
      input.type = field.type ?? "text";
      input.name = field.name;
      input.value = field.value ?? "";
      if (field.required) input.required = true;
      if (field.placeholder) input.placeholder = field.placeholder;
    }

    group.appendChild(input);
    modalForm.appendChild(group);
  });

  // Remove previous handler before adding new one
  if (currentSubmitHandler) {
    modalForm.removeEventListener("submit", currentSubmitHandler);
  }

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

// ── Confirm Delete Modal ──────────────────────────────────────
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

// ── Table helpers ─────────────────────────────────────────────
function renderEmptyRow(tbodyId, colspan, message = "No records found.") {
  const tbody = document.getElementById(tbodyId);
  if (tbody)
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="loading-cell">${message}</td></tr>`;
}

function renderErrorRow(tbodyId, colspan) {
  renderEmptyRow(tbodyId, colspan, "Failed to load data. Please try again.");
}

// ── Action buttons (reusable) ─────────────────────────────────
function makeActionBtn(icon, label, onClick, danger = false) {
  const btn = document.createElement("button");
  btn.className = `btn-icon${danger ? " danger" : ""}`;
  btn.title = label;
  btn.innerHTML = `<span class="material-symbols-outlined">${icon}</span>`;
  btn.addEventListener("click", onClick);
  return btn;
}

// ───────────────────────────────────────────────────────────────
//  4. DATA LAYER — Supabase query functions
//  Adjust column names here if your schema differs.
// ───────────────────────────────────────────────────────────────
const db = {
  // ── Reference data (used by selects across sections) ────────
  async fetchClasses() {
    const { data, error } = await supabase
      .from("classes")
      .select("id, display_name, section, grade_levels(name)")
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

  // ── Students ─────────────────────────────────────────────────
  async fetchStudents({ search = "", classId = "" } = {}) {
    let query = supabase
      .from("students")
      .select(
        `
                id, first_name, last_name, status, auth_user_id,
                classes!class_id ( id, display_name,
                    grade_levels ( name )
                )
            `,
      )
      .order("last_name");

    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%`,
      );
    }
    if (classId) {
      query = query.eq("class_id", classId);
    }

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

  // ── Overview stats ────────────────────────────────────────────
  async fetchStats() {
    const [students, teachers, classes] = await Promise.all([
      supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabase.from("teachers").select("id", { count: "exact", head: true }),
      supabase.from("classes").select("id", { count: "exact", head: true }),
    ]);
    return {
      students: students.count ?? 0,
      teachers: teachers.count ?? 0,
      classes: classes.count ?? 0,
    };
  },

  async fetchRecentEnrollments(limit = 8) {
    const { data, error } = await supabase
      .from("students")
      .select(
        `
                id, first_name, last_name, status, created_at,
                classes!class_id ( display_name, grade_levels ( name ) )
            `,
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  },
};

// ───────────────────────────────────────────────────────────────
//  5. OVERVIEW SECTION
// ───────────────────────────────────────────────────────────────
async function loadOverview() {
  // Stat cards
  try {
    const stats = await db.fetchStats();
    document.getElementById("stat-students-value").textContent = stats.students;
    document.getElementById("stat-teachers-value").textContent = stats.teachers;
    document.getElementById("stat-classes-value").textContent = stats.classes;
  } catch {
    ["students", "teachers", "classes"].forEach((key) => {
      document.getElementById(`stat-${key}-value`).textContent = "Error";
    });
  }

  // Recent enrollments table
  const tbody = document.getElementById("recent-enrollments-body");

  try {
    const enrollments = await db.fetchRecentEnrollments();

    if (!enrollments.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="loading-cell">No enrollments yet.</td></tr>';
      return;
    }

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
                <td>${name}</td>
                <td>${cls}</td>
                <td>${grade}</td>
                <td>${date}</td>
                <td>${badge}</td>
            </tr>`;
      })
      .join("");
  } catch {
    renderErrorRow("recent-enrollments-body", 5);
  }
}

// ───────────────────────────────────────────────────────────────
//  6. STUDENTS SECTION
//  Full CRUD — serves as the template for other CRUD sections.
//
//  Data flow:
//    loadStudents()
//      → db.fetchStudents()
//      → renderStudentsTable()  (builds <tr> per student)
//        → each row has Edit + Delete action buttons
//
//    openAddStudent()
//      → openModal() with empty fields
//      → onSubmit → db.insertStudent() → loadStudents() refresh
//
//    openEditStudent(student)
//      → openModal() with fields pre-filled from the student object
//      → onSubmit → db.updateStudent() → loadStudents() refresh
//
//    deleteStudent(id, name)
//      → openConfirm() with description
//      → onConfirm → db.deleteStudent() → loadStudents() refresh
// ───────────────────────────────────────────────────────────────

// Internal state for search/filter
let studentsFilter = { search: "", classId: "" };
let classOptions = [];

async function loadStudents() {
  const tbody = document.getElementById("students-body");
  tbody.innerHTML =
    '<tr><td colspan="6" class="loading-cell">Loading students...</td></tr>';

  // Load class options for the filter dropdown (once)
  if (!classOptions.length) {
    try {
      const classes = await db.fetchClasses();
      classOptions = classes.map((c) => ({
        value: c.id,
        label: c.display_name,
      }));

      const filterSelect = document.getElementById("students-filter-class");
      classOptions.forEach((opt) => {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        filterSelect.appendChild(option);
      });
    } catch {
      // Non-fatal — filter just won't be populated
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
            <td>—</td>
            <td>${grade}</td>
            <td>${className}</td>
            <td>${badge}</td>
        `;
    tr.appendChild(actionsCell);
    tbody.appendChild(tr);
  });
}

// ── Search + Filter wiring ─────────────────────────────────────
let searchTimeout;

document.getElementById("students-search")?.addEventListener("input", (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    studentsFilter.search = e.target.value.trim();
    loaded.students = true; // already loaded, force refresh
    loadStudents();
  }, 350); // debounce — avoid a Supabase call on every keystroke
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

// ── Add student ────────────────────────────────────────────────
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
        options: [
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
        ],
      },
    ],
    onSubmit: async (formData) => {
      await db.insertStudent({
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        class_id: formData.class_id || null,
        status: formData.status,
      });
      showToast(
        `${formData.first_name} ${formData.last_name} added successfully.`,
      );
      loaded.students = false; // force full reload
      loadStudents();
    },
  });
}

// ── Edit student ───────────────────────────────────────────────
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
        options: [
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
        ],
        value: student.status,
      },
    ],
    onSubmit: async (formData) => {
      await db.updateStudent(student.id, {
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        class_id: formData.class_id || null,
        status: formData.status,
      });
      showToast(`${formData.first_name} ${formData.last_name} updated.`);
      loadStudents();
    },
  });
}

// ── Delete student ─────────────────────────────────────────────
function confirmDeleteStudent(id, name) {
  openConfirm(
    `Delete "${name}"? This will remove their record permanently and cannot be undone.`,
    async () => {
      await db.deleteStudent(id);
      showToast(`${name} has been deleted.`);
      loadStudents();
    },
  );
}

// ───────────────────────────────────────────────────────────────
//  7. STUB LOADERS — replace with full implementations
//     following the same pattern as loadStudents() above.
// ───────────────────────────────────────────────────────────────

async function loadClasses() {
  // TODO: implement following the Students pattern
  renderEmptyRow("classes-body", 7, "Classes section coming soon.");
}

async function loadSubjects() {
  // TODO: implement following the Students pattern
  renderEmptyRow("subjects-body", 5, "Subjects section coming soon.");
}

async function loadSchedules() {
  // Schedules are contextual — loaded when a class is selected
  const select = document.getElementById("schedules-class-select");
  if (!select.options.length || select.options.length === 1) {
    try {
      const classes = await db.fetchClasses();
      classes.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.display_name;
        select.appendChild(opt);
      });
    } catch {
      showToast("Failed to load classes for schedule.", "error");
    }
  }
}

async function loadGrades() {
  // Grades are contextual — loaded when class + period are selected
  const select = document.getElementById("grades-class-select");
  if (!select.options.length || select.options.length === 1) {
    try {
      const classes = await db.fetchClasses();
      classes.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.display_name;
        select.appendChild(opt);
      });
    } catch {
      showToast("Failed to load classes for grades.", "error");
    }
  }
}

async function loadAttendance() {
  // Attendance is contextual — loaded when class + date are selected
  const select = document.getElementById("attendance-class-select");
  const dateInput = document.getElementById("attendance-date");

  // Default the date input to today
  if (!dateInput.value) {
    dateInput.value = new Date().toISOString().split("T")[0];
  }

  if (!select.options.length || select.options.length === 1) {
    try {
      const classes = await db.fetchClasses();
      classes.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.display_name;
        select.appendChild(opt);
      });
    } catch {
      showToast("Failed to load classes for attendance.", "error");
    }
  }
}
