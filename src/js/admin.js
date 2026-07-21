// ═══════════════════════════════════════════════════════════════
//  admin.js — Simple Manage Pro | Admin Console
//
//  The school director/coordinator portal: where a school gets
//  configured and operated. Role-gated, bilingual, demo-overlay safe.
//
//  Architecture:
//  1. Auth guard + role gate (admin only)
//  2. Data layer  (gateway → real Supabase or demo overlay)
//  3. UI helpers  (toast, modal form, confirm, tables)
//  4. Navigation  (sidebar → view sections)
//  5. Sections    (overview, year & periods, grades & sections,
//                  subjects, teachers & assignments, schedules, settings)
// ═══════════════════════════════════════════════════════════════

import "./errorHandler.js";
import "./speedInsights.js";
import { supabase } from "./supabaseClient.js";
import { signOut, getSession } from "./auth.js";
import { fetchRole, portalPath } from "./role.js";
import { initTheme, bindThemeToggle } from "./theme.js";
import { initSidebarToggle } from "./ui.js";
import { renderSettings } from "./settings.js";
import { DEMO_MODE } from "./demoMode.js";
import { supabaseGateway, createAdminData } from "./adminData.js";
import { createDemoGateway } from "./adminDemoDb.js";
import { parseCsv, autoMap } from "./csv.js";
import { initI18n, applyTranslations, t, tn, formatDate } from "./i18n.js";

// ───────────────────────────────────────────────────────────────
//  1. AUTH GUARD + ROLE GATE
// ───────────────────────────────────────────────────────────────
const session = await getSession();
if (!session) {
  window.location.replace("/login.html");
  throw new Error("Unauthenticated");
}

const role = await fetchRole();
if (role !== "admin") {
  window.location.replace(portalPath(role));
  throw new Error("Unauthorized");
}

// ───────────────────────────────────────────────────────────────
//  2. DATA LAYER
// ───────────────────────────────────────────────────────────────
// Demo sandbox: writes land in an in-memory session overlay instead of the
// shared backend; reads stay live with the overlay applied. A refresh restores
// pristine data. The first write shows a one-time notice.
let demoNoticeShown = false;
const gateway = DEMO_MODE
  ? createDemoGateway(supabaseGateway, {
      onWrite: () => {
        if (demoNoticeShown) return;
        demoNoticeShown = true;
        showToast(t("admin.demo.sandboxNotice"));
      },
    })
  : supabaseGateway;
const data = createAdminData(gateway);

// Reference lists reused across sections, refreshed by the loaders that own them.
const state = {
  /** @type {any} */ activeYear: null,
  /** @type {any[]} */ gradeLevels: [],
  /** @type {any[]} */ rooms: [],
  /** @type {any[]} */ teachers: [],
  /** @type {any[]} */ subjects: [],
  /** @type {any[]} */ sections: [],
  /** @type {any[]} */ students: [],
  /** @type {string} */ studentFilter: "all", // "all" | "unassigned" | section id
};

// ───────────────────────────────────────────────────────────────
//  3. UI HELPERS
// ───────────────────────────────────────────────────────────────
const toastContainer = document.getElementById("toast-container");

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  const icon = type === "success" ? "check_circle" : "error";
  toast.innerHTML = `<span class="material-symbols-outlined"><svg aria-hidden="true"><use href="#icon-${icon}"></use></svg></span>${escapeHtml(message)}`;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
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

function num(v) {
  return v === "" || v == null ? null : Number(v);
}
function nullable(v) {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

// ── Generic modal form ─────────────────────────────────────────
const modalOverlay = document.getElementById("modal-overlay");
const modalTitle = document.getElementById("modal-title");
const modalForm = document.getElementById("modal-form");
let currentSubmitHandler = null;

/**
 * Open the shared modal with a field spec. `onSubmit` receives an object of
 * name → value (checkbox groups yield arrays); returning resolves & closes.
 */
function openModal({
  title,
  fields,
  onSubmit,
  submitLabel = t("common.save"),
}) {
  modalTitle.textContent = title;
  document.getElementById("modal-submit").textContent = submitLabel;
  modalForm.innerHTML = "";

  fields.forEach((field) => {
    const group = document.createElement("div");
    group.className = "field-group";

    if (field.type !== "checkboxes") {
      const label = document.createElement("label");
      label.textContent = field.label;
      label.htmlFor = `modal-field-${field.name}`;
      group.appendChild(label);
    }

    let input;
    if (field.type === "select") {
      input = document.createElement("select");
      input.id = `modal-field-${field.name}`;
      input.name = field.name;
      if (field.required) input.required = true;
      const ph = document.createElement("option");
      ph.value = "";
      ph.textContent = field.required
        ? t("common.selectPlaceholder", { label: field.label.toLowerCase() })
        : t("common.none");
      input.appendChild(ph);
      (field.options ?? []).forEach((opt) => {
        const o = document.createElement("option");
        o.value = opt.value;
        o.textContent = opt.label;
        if (String(opt.value) === String(field.value)) o.selected = true;
        input.appendChild(o);
      });
    } else if (field.type === "checkboxes") {
      const legend = document.createElement("span");
      legend.className = "field-legend";
      legend.textContent = field.label;
      group.appendChild(legend);
      input = document.createElement("div");
      input.className = "checkbox-grid";
      const checked = new Set((field.value ?? []).map(String));
      (field.options ?? []).forEach((opt) => {
        const wrap = document.createElement("label");
        wrap.className = "checkbox-item";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.name = field.name;
        cb.value = opt.value;
        if (checked.has(String(opt.value))) cb.checked = true;
        wrap.appendChild(cb);
        const span = document.createElement("span");
        span.textContent = opt.label;
        wrap.appendChild(span);
        input.appendChild(wrap);
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
    const values = {};
    fields.forEach((field) => {
      if (field.type === "checkboxes") {
        values[field.name] = [
          ...modalForm.querySelectorAll(`input[name="${field.name}"]:checked`),
        ].map((el) => el.value);
      } else {
        const el = modalForm.querySelector(`[name="${field.name}"]`);
        values[field.name] = el ? el.value : "";
      }
    });
    const submitBtn = document.getElementById("modal-submit");
    submitBtn.disabled = true;
    try {
      await onSubmit(values);
      closeModal();
    } catch (err) {
      showToast(err.message ?? String(err), "error");
    } finally {
      submitBtn.disabled = false;
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

document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal-cancel").addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});

// ── Confirm modal ──────────────────────────────────────────────
const confirmOverlay = document.getElementById("confirm-overlay");
const confirmMessage = document.getElementById("confirm-message");
const confirmDeleteBtn = document.getElementById("confirm-delete");
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
confirmDeleteBtn.addEventListener("click", async () => {
  if (!confirmHandler) return;
  confirmDeleteBtn.disabled = true;
  try {
    await confirmHandler();
    closeConfirm();
  } catch (err) {
    showToast(err.message ?? String(err), "error");
  } finally {
    confirmDeleteBtn.disabled = false;
  }
});
document
  .getElementById("confirm-cancel")
  .addEventListener("click", closeConfirm);
confirmOverlay.addEventListener("click", (e) => {
  if (e.target === confirmOverlay) closeConfirm();
});

// ── Table helpers ──────────────────────────────────────────────
function renderMessageRow(tbodyId, colspan, message) {
  const tbody = document.getElementById(tbodyId);
  if (tbody)
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="loading-cell">${escapeHtml(message)}</td></tr>`;
}
function renderEmptyRow(tbodyId, colspan, message = t("common.noRecords")) {
  renderMessageRow(tbodyId, colspan, message);
}
function renderErrorRow(tbodyId, colspan) {
  renderMessageRow(tbodyId, colspan, t("common.loadFailed"));
}

function iconBtn(icon, label, onClick, danger = false) {
  const btn = document.createElement("button");
  btn.className = `btn-icon${danger ? " danger" : ""}`;
  btn.type = "button";
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.innerHTML = `<span class="material-symbols-outlined"><svg aria-hidden="true"><use href="#icon-${icon}"></use></svg></span>`;
  btn.addEventListener("click", onClick);
  return btn;
}

/** Build a row with cells (HTML strings) and an actions cell of buttons. */
function tableRow(cells, actionButtons = []) {
  const tr = document.createElement("tr");
  cells.forEach((html) => {
    const td = document.createElement("td");
    td.innerHTML = html;
    tr.appendChild(td);
  });
  if (actionButtons.length) {
    const td = document.createElement("td");
    td.className = "actions-col";
    actionButtons.forEach((b) => td.appendChild(b));
    tr.appendChild(td);
  }
  return tr;
}

function optionsFrom(list, labelFn, valueKey = "id") {
  return list.map((item) => ({ value: item[valueKey], label: labelFn(item) }));
}

const fmtDate = (v) => (v ? formatDate(v) : "—");

// ───────────────────────────────────────────────────────────────
//  4. NAVIGATION
// ───────────────────────────────────────────────────────────────
const sections = document.querySelectorAll(".view-section");
const navLinks = document.querySelectorAll(".sidebar a[data-page]");
const loaded = { settings: false };
let PROFILE = null;

const LOADERS = {
  overview: loadOverview,
  yearperiods: loadYearPeriods,
  gradessections: loadGradesSections,
  subjects: loadSubjects,
  teachers: loadTeachers,
  students: loadStudents,
  settings: loadSettings,
};

function showSection(page) {
  sections.forEach((s) => s.classList.remove("active"));
  navLinks.forEach((a) => a.classList.remove("active"));
  document.getElementById(`view-${page}`)?.classList.add("active");
  document
    .querySelector(`.sidebar a[data-page="${page}"]`)
    ?.classList.add("active");

  if (page === "settings") {
    if (!loaded.settings) {
      loaded.settings = true;
      loadSettings();
    }
    return;
  }
  LOADERS[page]?.();
}

const closeNav = initSidebarToggle();
navLinks.forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    showSection(link.dataset.page);
    closeNav();
  });
});
document.getElementById("logout-btn")?.addEventListener("click", async () => {
  await signOut();
  window.location.replace("/login.html");
});
document.querySelector(".profile-photo")?.addEventListener("click", () => {
  showSection("settings");
  document
    .querySelector('#settings-root .settings-rail-item[data-section="account"]')
    ?.click();
});

initTheme();
bindThemeToggle(document.querySelector(".theme-toggler"));
initI18n("admin");
applyTranslations();

// ───────────────────────────────────────────────────────────────
//  5a. OVERVIEW
// ───────────────────────────────────────────────────────────────
async function loadOverview() {
  const welcomeTitle = document.getElementById("overview-welcome-title");
  const yearText = document.getElementById("overview-year-text");
  try {
    const [profile, years] = await Promise.all([
      PROFILE ? Promise.resolve(PROFILE) : fetchProfile(),
      data.listSchoolYears(),
    ]);
    PROFILE = profile;
    state.activeYear = years.find((y) => y.is_active) ?? null;

    const name = profile?.name ?? "";
    document.getElementById("admin-name").textContent =
      name || t("console.profile.admin");
    welcomeTitle.textContent = name
      ? t("console.overview.welcome", { name })
      : t("console.overview.welcomeFallback");
    yearText.textContent = state.activeYear?.name
      ? `${t("console.overview.activeYear")}: ${state.activeYear.name}`
      : t("console.overview.noActiveYear");
  } catch (err) {
    console.error("loadOverview:", err);
    yearText.textContent = t("common.loadFailed");
  }
}

async function fetchProfile() {
  const { data: row, error } = await supabase
    .from("profiles")
    .select("name, role")
    .eq("id", session.user.id)
    .single();
  if (error) throw error;
  return row;
}

// ───────────────────────────────────────────────────────────────
//  5b. YEAR & PERIODS
// ───────────────────────────────────────────────────────────────
async function loadYearPeriods() {
  renderMessageRow("years-body", 5, t("common.loading"));
  try {
    const years = await data.listSchoolYears();
    state.activeYear = years.find((y) => y.is_active) ?? null;
    renderYears(years);
    await loadPeriods();
  } catch (err) {
    console.error("loadYearPeriods:", err);
    renderErrorRow("years-body", 5);
  }
}

function renderYears(years) {
  const tbody = document.getElementById("years-body");
  tbody.innerHTML = "";
  if (!years.length) {
    renderEmptyRow("years-body", 5, t("console.years.empty"));
    return;
  }
  const activeIds = years.filter((y) => y.is_active).map((y) => y.id);
  years.forEach((y) => {
    const status = y.is_active
      ? `<span class="badge badge-success">${t("console.years.active")}</span>`
      : `<span class="badge badge-neutral">${t("console.years.inactive")}</span>`;
    const actions = [];
    if (!y.is_active) {
      actions.push(
        iconBtn("check_circle", t("console.years.setActive"), async () => {
          try {
            await data.setActiveYear(y.id, activeIds);
            showToast(t("console.years.activated"));
            loadYearPeriods();
          } catch (err) {
            showToast(err.message ?? String(err), "error");
          }
        }),
      );
    }
    actions.push(iconBtn("edit", t("common.edit"), () => openYearForm(y)));
    actions.push(
      iconBtn(
        "delete",
        t("common.delete"),
        () =>
          openConfirm(
            t("console.years.confirmDelete", { name: y.name }),
            async () => {
              await data.deleteSchoolYear(y.id);
              showToast(t("console.years.deleted"));
              loadYearPeriods();
            },
          ),
        true,
      ),
    );
    tbody.appendChild(
      tableRow(
        [
          escapeHtml(y.name),
          fmtDate(y.start_date),
          fmtDate(y.end_date),
          status,
        ],
        actions,
      ),
    );
  });
}

function openYearForm(year = null) {
  openModal({
    title: year ? t("console.years.editTitle") : t("console.years.addTitle"),
    fields: [
      {
        name: "name",
        label: t("console.years.name"),
        value: year?.name,
        required: true,
        placeholder: "2025-2026",
      },
      {
        name: "start_date",
        label: t("console.years.start"),
        type: "date",
        value: year?.start_date,
        required: true,
      },
      {
        name: "end_date",
        label: t("console.years.end"),
        type: "date",
        value: year?.end_date,
        required: true,
      },
    ],
    onSubmit: async (v) => {
      const payload = {
        name: v.name.trim(),
        start_date: v.start_date,
        end_date: v.end_date,
      };
      if (year) await data.updateSchoolYear(year.id, payload);
      else await data.createSchoolYear({ ...payload, is_active: false });
      showToast(t("common.saved"));
      loadYearPeriods();
    },
  });
}

async function loadPeriods() {
  const label = document.getElementById("periods-year-label");
  const addBtn = document.getElementById("btn-add-period");
  if (!state.activeYear) {
    label.textContent = t("console.periods.noYear");
    addBtn.disabled = true;
    renderEmptyRow("periods-body", 6, t("console.periods.noYear"));
    return;
  }
  addBtn.disabled = false;
  label.textContent = state.activeYear.name;
  renderMessageRow("periods-body", 6, t("common.loading"));
  try {
    const periods = await data.listPeriods(state.activeYear.id);
    renderPeriods(periods);
  } catch (err) {
    console.error("loadPeriods:", err);
    renderErrorRow("periods-body", 6);
  }
}

function renderPeriods(periods) {
  const tbody = document.getElementById("periods-body");
  tbody.innerHTML = "";
  if (!periods.length) {
    renderEmptyRow("periods-body", 6, t("console.periods.empty"));
    return;
  }
  periods.forEach((p) => {
    const actions = [
      iconBtn("edit", t("common.edit"), () => openPeriodForm(p)),
      iconBtn(
        "delete",
        t("common.delete"),
        () =>
          openConfirm(
            t("console.periods.confirmDelete", { name: p.name }),
            async () => {
              await data.deletePeriod(p.id);
              showToast(t("console.periods.deleted"));
              loadPeriods();
            },
          ),
        true,
      ),
    ];
    tbody.appendChild(
      tableRow(
        [
          escapeHtml(p.period_order),
          escapeHtml(p.name),
          fmtDate(p.start_date),
          fmtDate(p.end_date),
          p.weight != null ? `${escapeHtml(p.weight)}%` : "—",
        ],
        actions,
      ),
    );
  });
}

function openPeriodForm(period = null) {
  openModal({
    title: period
      ? t("console.periods.editTitle")
      : t("console.periods.addTitle"),
    fields: [
      {
        name: "name",
        label: t("console.periods.name"),
        value: period?.name,
        required: true,
        placeholder: t("console.periods.namePlaceholder"),
      },
      {
        name: "period_order",
        label: t("console.periods.order"),
        type: "number",
        value: period?.period_order,
        required: true,
        min: 1,
      },
      {
        name: "start_date",
        label: t("console.periods.start"),
        type: "date",
        value: period?.start_date,
        required: true,
      },
      {
        name: "end_date",
        label: t("console.periods.end"),
        type: "date",
        value: period?.end_date,
        required: true,
      },
      {
        name: "weight",
        label: t("console.periods.weight"),
        type: "number",
        value: period?.weight ?? 33.33,
        min: 0,
        max: 100,
        step: "0.01",
      },
    ],
    onSubmit: async (v) => {
      const payload = {
        name: v.name.trim(),
        period_order: num(v.period_order),
        start_date: v.start_date,
        end_date: v.end_date,
        weight: num(v.weight),
      };
      if (period) await data.updatePeriod(period.id, payload);
      else
        await data.createPeriod({
          ...payload,
          school_year_id: state.activeYear.id,
        });
      showToast(t("common.saved"));
      loadPeriods();
    },
  });
}

document
  .getElementById("btn-add-year")
  .addEventListener("click", () => openYearForm());
document
  .getElementById("btn-add-period")
  .addEventListener("click", () => openPeriodForm());

// ───────────────────────────────────────────────────────────────
//  5c. GRADES & SECTIONS
// ───────────────────────────────────────────────────────────────
async function loadGradesSections() {
  await Promise.all([loadGradeLevels(), loadRooms()]);
  await loadSections();
}

async function loadGradeLevels() {
  renderMessageRow("grades-body", 3, t("common.loading"));
  try {
    state.gradeLevels = await data.listGradeLevels();
    const tbody = document.getElementById("grades-body");
    tbody.innerHTML = "";
    if (!state.gradeLevels.length) {
      renderEmptyRow("grades-body", 3, t("console.grades.empty"));
      return;
    }
    state.gradeLevels.forEach((g) => {
      tbody.appendChild(
        tableRow(
          [escapeHtml(g.numeric_level), escapeHtml(g.name)],
          [
            iconBtn("edit", t("common.edit"), () => openGradeForm(g)),
            iconBtn(
              "delete",
              t("common.delete"),
              () =>
                openConfirm(
                  t("console.grades.confirmDelete", { name: g.name }),
                  async () => {
                    await data.deleteGradeLevel(g.id);
                    showToast(t("common.deleted"));
                    loadGradeLevels();
                  },
                ),
              true,
            ),
          ],
        ),
      );
    });
  } catch (err) {
    console.error("loadGradeLevels:", err);
    renderErrorRow("grades-body", 3);
  }
}

function openGradeForm(grade = null) {
  openModal({
    title: grade ? t("console.grades.editTitle") : t("console.grades.addTitle"),
    fields: [
      {
        name: "numeric_level",
        label: t("console.grades.level"),
        type: "number",
        value: grade?.numeric_level,
        required: true,
        min: 1,
      },
      {
        name: "name",
        label: t("console.grades.name"),
        value: grade?.name,
        required: true,
        placeholder: t("console.grades.namePlaceholder"),
      },
    ],
    onSubmit: async (v) => {
      const payload = {
        numeric_level: num(v.numeric_level),
        name: v.name.trim(),
      };
      if (grade) await data.updateGradeLevel(grade.id, payload);
      else await data.createGradeLevel(payload);
      showToast(t("common.saved"));
      loadGradeLevels();
    },
  });
}

async function loadRooms() {
  renderMessageRow("rooms-body", 4, t("common.loading"));
  try {
    state.rooms = await data.listRooms();
    const tbody = document.getElementById("rooms-body");
    tbody.innerHTML = "";
    if (!state.rooms.length) {
      renderEmptyRow("rooms-body", 4, t("console.rooms.empty"));
      return;
    }
    state.rooms.forEach((r) => {
      tbody.appendChild(
        tableRow(
          [
            escapeHtml(r.name),
            r.capacity != null ? escapeHtml(r.capacity) : "—",
            `<span class="badge badge-neutral">${escapeHtml(t(`console.rooms.types.${r.type ?? "classroom"}`))}</span>`,
          ],
          [
            iconBtn("edit", t("common.edit"), () => openRoomForm(r)),
            iconBtn(
              "delete",
              t("common.delete"),
              () =>
                openConfirm(
                  t("console.rooms.confirmDelete", { name: r.name }),
                  async () => {
                    await data.deleteRoom(r.id);
                    showToast(t("common.deleted"));
                    loadRooms();
                  },
                ),
              true,
            ),
          ],
        ),
      );
    });
  } catch (err) {
    console.error("loadRooms:", err);
    renderErrorRow("rooms-body", 4);
  }
}

const ROOM_TYPES = [
  "classroom",
  "lab",
  "gym",
  "library",
  "auditorium",
  "office",
];

function openRoomForm(room = null) {
  openModal({
    title: room ? t("console.rooms.editTitle") : t("console.rooms.addTitle"),
    fields: [
      {
        name: "name",
        label: t("console.rooms.name"),
        value: room?.name,
        required: true,
      },
      {
        name: "capacity",
        label: t("console.rooms.capacity"),
        type: "number",
        value: room?.capacity,
        min: 0,
      },
      {
        name: "type",
        label: t("console.rooms.type"),
        type: "select",
        value: room?.type ?? "classroom",
        required: true,
        options: ROOM_TYPES.map((v) => ({
          value: v,
          label: t(`console.rooms.types.${v}`),
        })),
      },
    ],
    onSubmit: async (v) => {
      const payload = {
        name: v.name.trim(),
        capacity: num(v.capacity),
        type: v.type,
      };
      if (room) await data.updateRoom(room.id, payload);
      else await data.createRoom(payload);
      showToast(t("common.saved"));
      loadRooms();
    },
  });
}

async function loadSections() {
  const label = document.getElementById("sections-year-label");
  const addBtn = document.getElementById("btn-add-section");
  if (!state.activeYear) {
    const years = await data.listSchoolYears();
    state.activeYear = years.find((y) => y.is_active) ?? null;
  }
  if (!state.activeYear) {
    label.textContent = t("console.sections.noYear");
    addBtn.disabled = true;
    renderEmptyRow("sections-body", 6, t("console.sections.noYear"));
    return;
  }
  addBtn.disabled = false;
  label.textContent = state.activeYear.name;
  renderMessageRow("sections-body", 6, t("common.loading"));
  try {
    const [sectionsList, teachers] = await Promise.all([
      data.listSections(state.activeYear.id),
      state.teachers.length
        ? Promise.resolve(state.teachers)
        : data.listTeachers(),
    ]);
    state.sections = sectionsList;
    state.teachers = teachers;
    renderSections(sectionsList);
  } catch (err) {
    console.error("loadSections:", err);
    renderErrorRow("sections-body", 6);
  }
}

function gradeName(id) {
  const g = state.gradeLevels.find((x) => x.id === id);
  return g ? g.name : "—";
}
function roomName(id) {
  const r = state.rooms.find((x) => x.id === id);
  return r ? r.name : "—";
}
function teacherName(id) {
  const tch = state.teachers.find((x) => x.id === id);
  return tch ? `${tch.first_name} ${tch.last_name}` : "—";
}
function sectionName(sec) {
  return sec.display_name || `${gradeName(sec.grade_level_id)} ${sec.section}`;
}

function renderSections(list) {
  const tbody = document.getElementById("sections-body");
  tbody.innerHTML = "";
  if (!list.length) {
    renderEmptyRow("sections-body", 6, t("console.sections.empty"));
    return;
  }
  list.forEach((s) => {
    tbody.appendChild(
      tableRow(
        [
          escapeHtml(gradeName(s.grade_level_id)),
          escapeHtml(s.section),
          escapeHtml(
            s.homeroom_teacher_id ? teacherName(s.homeroom_teacher_id) : "—",
          ),
          escapeHtml(s.room_id ? roomName(s.room_id) : "—"),
          s.max_capacity != null ? escapeHtml(s.max_capacity) : "—",
        ],
        [
          iconBtn("schedule", t("console.schedule.manage"), () =>
            openScheduleModal(s),
          ),
          iconBtn("edit", t("common.edit"), () => openSectionForm(s)),
          iconBtn(
            "delete",
            t("common.delete"),
            () =>
              openConfirm(
                t("console.sections.confirmDelete", { name: sectionName(s) }),
                async () => {
                  await data.deleteSection(s.id);
                  showToast(t("common.deleted"));
                  loadSections();
                },
              ),
            true,
          ),
        ],
      ),
    );
  });
}

function openSectionForm(section = null) {
  if (!state.gradeLevels.length) {
    showToast(t("console.sections.needGrade"), "error");
    return;
  }
  openModal({
    title: section
      ? t("console.sections.editTitle")
      : t("console.sections.addTitle"),
    fields: [
      {
        name: "grade_level_id",
        label: t("console.sections.grade"),
        type: "select",
        value: section?.grade_level_id,
        required: true,
        options: optionsFrom(
          state.gradeLevels,
          (g) => `${g.name} (${g.numeric_level})`,
        ),
      },
      {
        name: "section",
        label: t("console.sections.section"),
        value: section?.section,
        required: true,
        placeholder: "A",
      },
      {
        name: "homeroom_teacher_id",
        label: t("console.sections.homeroom"),
        type: "select",
        value: section?.homeroom_teacher_id,
        options: optionsFrom(
          state.teachers,
          (tch) => `${tch.first_name} ${tch.last_name}`,
        ),
      },
      {
        name: "room_id",
        label: t("console.sections.room"),
        type: "select",
        value: section?.room_id,
        options: optionsFrom(state.rooms, (r) => r.name),
      },
      {
        name: "max_capacity",
        label: t("console.sections.capacity"),
        type: "number",
        value: section?.max_capacity ?? 30,
        min: 1,
      },
    ],
    onSubmit: async (v) => {
      const gl = state.gradeLevels.find(
        (g) => String(g.id) === String(v.grade_level_id),
      );
      const sectionCode = v.section.trim();
      const payload = {
        grade_level_id: num(v.grade_level_id),
        section: sectionCode,
        display_name: gl ? `${gl.numeric_level}${sectionCode}` : sectionCode,
        homeroom_teacher_id: num(v.homeroom_teacher_id),
        room_id: num(v.room_id),
        max_capacity: num(v.max_capacity),
      };
      if (section) await data.updateSection(section.id, payload);
      else
        await data.createSection({
          ...payload,
          school_year_id: state.activeYear.id,
        });
      showToast(t("common.saved"));
      loadSections();
    },
  });
}

document
  .getElementById("btn-add-grade")
  .addEventListener("click", () => openGradeForm());
document
  .getElementById("btn-add-room")
  .addEventListener("click", () => openRoomForm());
document
  .getElementById("btn-add-section")
  .addEventListener("click", () => openSectionForm());

// ───────────────────────────────────────────────────────────────
//  5d. SUBJECTS (+ grade-level mapping)
// ───────────────────────────────────────────────────────────────
async function loadSubjects() {
  renderMessageRow("subjects-body", 5, t("common.loading"));
  try {
    const [subjects, gls, mapping] = await Promise.all([
      data.listSubjects(),
      state.gradeLevels.length
        ? Promise.resolve(state.gradeLevels)
        : data.listGradeLevels(),
      data.listGradeLevelSubjects(),
    ]);
    state.subjects = subjects;
    state.gradeLevels = gls;
    renderSubjects(subjects, mapping);
  } catch (err) {
    console.error("loadSubjects:", err);
    renderErrorRow("subjects-body", 5);
  }
}

function renderSubjects(subjects, mapping) {
  const tbody = document.getElementById("subjects-body");
  tbody.innerHTML = "";
  if (!subjects.length) {
    renderEmptyRow("subjects-body", 5, t("console.subjects.empty"));
    return;
  }
  const bySubject = new Map();
  mapping.forEach((m) => {
    if (!bySubject.has(m.subject_id)) bySubject.set(m.subject_id, []);
    bySubject.get(m.subject_id).push(m);
  });

  subjects.forEach((s) => {
    const mapped = bySubject.get(s.id) ?? [];
    const gradeNames =
      mapped
        .map((m) => gradeName(m.grade_level_id))
        .filter((n) => n !== "—")
        .join(", ") || "—";
    const swatch = s.color
      ? `<span class="color-swatch" style="background:${escapeHtml(s.color)}"></span>${escapeHtml(s.color)}`
      : "—";
    tbody.appendChild(
      tableRow(
        [
          `<code>${escapeHtml(s.code ?? "—")}</code>`,
          escapeHtml(s.name),
          swatch,
          escapeHtml(gradeNames),
        ],
        [
          iconBtn("edit", t("common.edit"), () => openSubjectForm(s, mapped)),
          iconBtn(
            "delete",
            t("common.delete"),
            () =>
              openConfirm(
                t("console.subjects.confirmDelete", { name: s.name }),
                async () => {
                  await data.deleteSubject(s.id);
                  showToast(t("common.deleted"));
                  loadSubjects();
                },
              ),
            true,
          ),
        ],
      ),
    );
  });
}

function openSubjectForm(subject = null, mapped = []) {
  const mappedGradeIds = mapped.map((m) => m.grade_level_id);
  openModal({
    title: subject
      ? t("console.subjects.editTitle")
      : t("console.subjects.addTitle"),
    fields: [
      {
        name: "name",
        label: t("console.subjects.name"),
        value: subject?.name,
        required: true,
      },
      {
        name: "code",
        label: t("console.subjects.code"),
        value: subject?.code,
        placeholder: "MATH7",
      },
      {
        name: "color",
        label: t("console.subjects.color"),
        type: "color",
        value: subject?.color ?? "#7380ec",
      },
      {
        name: "description",
        label: t("console.subjects.description"),
        type: "textarea",
        value: subject?.description,
      },
      {
        name: "grades",
        label: t("console.subjects.gradeLevels"),
        type: "checkboxes",
        value: mappedGradeIds,
        options: optionsFrom(state.gradeLevels, (g) => g.name),
      },
    ],
    onSubmit: async (v) => {
      const payload = {
        name: v.name.trim(),
        code: nullable(v.code),
        color: nullable(v.color),
        description: nullable(v.description),
      };
      let subjectId = subject?.id;
      if (subject) await data.updateSubject(subject.id, payload);
      else {
        const created = await data.createSubject(payload);
        subjectId = created.id;
      }
      // Reconcile grade-level mapping (add checked, remove unchecked).
      const desired = new Set(v.grades.map(Number));
      const current = new Map(mapped.map((m) => [m.grade_level_id, m.id]));
      for (const gid of desired) {
        if (!current.has(gid))
          await data.createGradeLevelSubject({
            subject_id: subjectId,
            grade_level_id: gid,
            weekly_hours: 4,
          });
      }
      for (const [gid, mapId] of current) {
        if (!desired.has(gid)) await data.deleteGradeLevelSubject(mapId);
      }
      showToast(t("common.saved"));
      loadSubjects();
    },
  });
}

document
  .getElementById("btn-add-subject")
  .addEventListener("click", () => openSubjectForm());

// ───────────────────────────────────────────────────────────────
//  5e. TEACHERS (+ assignments)
// ───────────────────────────────────────────────────────────────
async function loadTeachers() {
  renderMessageRow("teachers-body", 6, t("common.loading"));
  try {
    state.teachers = await data.listTeachers();
    renderTeachers(state.teachers);
  } catch (err) {
    console.error("loadTeachers:", err);
    renderErrorRow("teachers-body", 6);
  }
  await loadAssignments();
}

const TEACHER_STATUSES = ["active", "inactive", "on_leave"];

function renderTeachers(list) {
  const tbody = document.getElementById("teachers-body");
  tbody.innerHTML = "";
  if (!list.length) {
    renderEmptyRow("teachers-body", 6, t("console.teachers.empty"));
    return;
  }
  list.forEach((tch) => {
    const statusBadge = `<span class="badge ${tch.status === "active" ? "badge-success" : "badge-neutral"}">${escapeHtml(t(`console.teachers.statuses.${tch.status ?? "active"}`))}</span>`;
    tbody.appendChild(
      tableRow(
        [
          escapeHtml(`${tch.first_name} ${tch.last_name}`),
          escapeHtml(tch.national_id ?? "—"),
          escapeHtml(tch.email ?? "—"),
          escapeHtml(tch.specialization ?? "—"),
          statusBadge,
        ],
        [
          iconBtn("edit", t("common.edit"), () => openTeacherForm(tch)),
          iconBtn(
            "delete",
            t("common.delete"),
            () =>
              openConfirm(
                t("console.teachers.confirmDelete", {
                  name: `${tch.first_name} ${tch.last_name}`,
                }),
                async () => {
                  await data.deleteTeacher(tch.id);
                  showToast(t("common.deleted"));
                  loadTeachers();
                },
              ),
            true,
          ),
        ],
      ),
    );
  });
}

function openTeacherForm(teacher = null) {
  openModal({
    title: teacher
      ? t("console.teachers.editTitle")
      : t("console.teachers.addTitle"),
    fields: [
      {
        name: "first_name",
        label: t("console.teachers.firstName"),
        value: teacher?.first_name,
        required: true,
      },
      {
        name: "last_name",
        label: t("console.teachers.lastName"),
        value: teacher?.last_name,
        required: true,
      },
      {
        name: "national_id",
        label: t("console.teachers.nationalId"),
        value: teacher?.national_id,
      },
      {
        name: "email",
        label: t("console.teachers.email"),
        type: "email",
        value: teacher?.email,
      },
      {
        name: "phone",
        label: t("console.teachers.phone"),
        value: teacher?.phone,
      },
      {
        name: "specialization",
        label: t("console.teachers.specialization"),
        value: teacher?.specialization,
      },
      {
        name: "status",
        label: t("console.teachers.status"),
        type: "select",
        value: teacher?.status ?? "active",
        required: true,
        options: TEACHER_STATUSES.map((v) => ({
          value: v,
          label: t(`console.teachers.statuses.${v}`),
        })),
      },
    ],
    onSubmit: async (v) => {
      const payload = {
        first_name: v.first_name.trim(),
        last_name: v.last_name.trim(),
        national_id: nullable(v.national_id),
        email: nullable(v.email),
        phone: nullable(v.phone),
        specialization: nullable(v.specialization),
        status: v.status,
      };
      if (teacher) await data.updateTeacher(teacher.id, payload);
      else await data.createTeacher(payload);
      showToast(t("common.saved"));
      loadTeachers();
    },
  });
}

async function loadAssignments() {
  const label = document.getElementById("assignments-year-label");
  const addBtn = document.getElementById("btn-add-assignment");
  if (!state.activeYear) {
    const years = await data.listSchoolYears();
    state.activeYear = years.find((y) => y.is_active) ?? null;
  }
  if (!state.activeYear) {
    label.textContent = t("console.assignments.noYear");
    addBtn.disabled = true;
    renderEmptyRow("assignments-body", 4, t("console.assignments.noYear"));
    return;
  }
  addBtn.disabled = false;
  label.textContent = state.activeYear.name;
  renderMessageRow("assignments-body", 4, t("common.loading"));
  try {
    const [assignments, sectionsList, subjects] = await Promise.all([
      data.listAssignments(state.activeYear.id),
      data.listSections(state.activeYear.id),
      state.subjects.length
        ? Promise.resolve(state.subjects)
        : data.listSubjects(),
    ]);
    state.sections = sectionsList;
    state.subjects = subjects;
    if (!state.gradeLevels.length)
      state.gradeLevels = await data.listGradeLevels();
    renderAssignments(assignments);
  } catch (err) {
    console.error("loadAssignments:", err);
    renderErrorRow("assignments-body", 4);
  }
}

function subjectName(id) {
  const s = state.subjects.find((x) => x.id === id);
  return s ? s.name : "—";
}

function renderAssignments(list) {
  const tbody = document.getElementById("assignments-body");
  tbody.innerHTML = "";
  if (!list.length) {
    renderEmptyRow("assignments-body", 4, t("console.assignments.empty"));
    return;
  }
  list.forEach((a) => {
    const sec = state.sections.find((s) => s.id === a.class_id);
    tbody.appendChild(
      tableRow(
        [
          escapeHtml(sec ? sectionName(sec) : "—"),
          escapeHtml(subjectName(a.subject_id)),
          escapeHtml(teacherName(a.teacher_id)),
        ],
        [
          iconBtn(
            "delete",
            t("common.delete"),
            () =>
              openConfirm(t("console.assignments.confirmDelete"), async () => {
                await data.deleteAssignment(a.id);
                showToast(t("common.deleted"));
                loadAssignments();
              }),
            true,
          ),
        ],
      ),
    );
  });
}

function openAssignmentForm() {
  if (
    !state.sections.length ||
    !state.subjects.length ||
    !state.teachers.length
  ) {
    showToast(t("console.assignments.needData"), "error");
    return;
  }
  openModal({
    title: t("console.assignments.addTitle"),
    fields: [
      {
        name: "class_id",
        label: t("console.assignments.section"),
        type: "select",
        required: true,
        options: optionsFrom(state.sections, (s) => sectionName(s)),
      },
      {
        name: "subject_id",
        label: t("console.assignments.subject"),
        type: "select",
        required: true,
        options: optionsFrom(state.subjects, (s) => s.name),
      },
      {
        name: "teacher_id",
        label: t("console.assignments.teacher"),
        type: "select",
        required: true,
        options: optionsFrom(
          state.teachers,
          (tch) => `${tch.first_name} ${tch.last_name}`,
        ),
      },
    ],
    onSubmit: async (v) => {
      await data.createAssignment({
        class_id: num(v.class_id),
        subject_id: num(v.subject_id),
        teacher_id: num(v.teacher_id),
        school_year_id: state.activeYear.id,
      });
      showToast(t("common.saved"));
      loadAssignments();
    },
  });
}

document
  .getElementById("btn-add-teacher")
  .addEventListener("click", () => openTeacherForm());
document
  .getElementById("btn-add-assignment")
  .addEventListener("click", () => openAssignmentForm());

// ───────────────────────────────────────────────────────────────
//  5f. SCHEDULES (per section)
// ───────────────────────────────────────────────────────────────
const scheduleOverlay = document.getElementById("schedule-overlay");
const scheduleBody = document.getElementById("sch-body");
let scheduleSection = null;

const DAYS = [
  { value: 1, key: "monday" },
  { value: 2, key: "tuesday" },
  { value: 3, key: "wednesday" },
  { value: 4, key: "thursday" },
  { value: 5, key: "friday" },
];
const dayLabel = (dow) => {
  const d = DAYS.find((x) => x.value === Number(dow));
  return d ? t(`common.days.${d.key}`) : "—";
};

async function openScheduleModal(section) {
  scheduleSection = section;
  document.getElementById("sch-title").textContent = t(
    "console.schedule.titleFor",
    { name: sectionName(section) },
  );
  scheduleOverlay.classList.add("active");
  await renderScheduleModal();
}

function closeScheduleModal() {
  scheduleOverlay.classList.remove("active");
  scheduleSection = null;
  scheduleBody.innerHTML = "";
}

async function renderScheduleModal() {
  scheduleBody.innerHTML = `<p class="loading-cell">${t("common.loading")}</p>`;
  try {
    // Reference lists for the add form + labels.
    if (!state.subjects.length) state.subjects = await data.listSubjects();
    if (!state.teachers.length) state.teachers = await data.listTeachers();
    if (!state.rooms.length) state.rooms = await data.listRooms();
    const entries = await data.listSchedules(scheduleSection.id);
    entries.sort(
      (a, b) =>
        a.day_of_week - b.day_of_week ||
        String(a.start_time).localeCompare(String(b.start_time)),
    );

    scheduleBody.innerHTML = "";
    const table = document.createElement("table");
    table.className = "data-table";
    table.innerHTML = `<thead><tr>
        <th>${t("console.schedule.day")}</th>
        <th>${t("console.schedule.time")}</th>
        <th>${t("console.schedule.subject")}</th>
        <th>${t("console.schedule.teacher")}</th>
        <th>${t("console.schedule.room")}</th>
        <th class="actions-col"></th>
      </tr></thead>`;
    const tbody = document.createElement("tbody");
    if (!entries.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="loading-cell">${t("console.schedule.empty")}</td></tr>`;
    } else {
      entries.forEach((e) => {
        tbody.appendChild(
          tableRow(
            [
              escapeHtml(dayLabel(e.day_of_week)),
              `${escapeHtml(String(e.start_time).slice(0, 5))}–${escapeHtml(String(e.end_time).slice(0, 5))}`,
              escapeHtml(subjectName(e.subject_id)),
              escapeHtml(teacherName(e.teacher_id)),
              escapeHtml(e.room_id ? roomName(e.room_id) : "—"),
            ],
            [
              iconBtn(
                "delete",
                t("common.delete"),
                async () => {
                  await data.deleteSchedule(e.id);
                  showToast(t("common.deleted"));
                  renderScheduleModal();
                },
                true,
              ),
            ],
          ),
        );
      });
    }
    table.appendChild(tbody);

    const wrap = document.createElement("div");
    wrap.className = "table-scroll";
    wrap.appendChild(table);
    scheduleBody.appendChild(wrap);
    scheduleBody.appendChild(buildScheduleAddForm(entries));
  } catch (err) {
    console.error("renderScheduleModal:", err);
    scheduleBody.innerHTML = `<p class="loading-cell">${t("common.loadFailed")}</p>`;
  }
}

function buildScheduleAddForm(existing) {
  const form = document.createElement("form");
  form.className = "schedule-add-form";
  form.innerHTML = `
    <h3>${t("console.schedule.addEntry")}</h3>
    <div class="schedule-add-grid">
      <select name="day" required>
        <option value="">${t("console.schedule.day")}</option>
        ${DAYS.map((d) => `<option value="${d.value}">${escapeHtml(t(`common.days.${d.key}`))}</option>`).join("")}
      </select>
      <input type="time" name="start" required aria-label="${t("console.schedule.start")}" />
      <input type="time" name="end" required aria-label="${t("console.schedule.end")}" />
      <select name="subject" required>
        <option value="">${t("console.schedule.subject")}</option>
        ${state.subjects.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("")}
      </select>
      <select name="teacher" required>
        <option value="">${t("console.schedule.teacher")}</option>
        ${state.teachers.map((tch) => `<option value="${tch.id}">${escapeHtml(`${tch.first_name} ${tch.last_name}`)}</option>`).join("")}
      </select>
      <select name="room">
        <option value="">${t("common.none")}</option>
        ${state.rooms.map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join("")}
      </select>
      <button type="submit" class="btn btn-primary btn-sm">
        <span class="material-symbols-outlined"><svg aria-hidden="true"><use href="#icon-add"></use></svg></span>
        <span>${t("console.schedule.add")}</span>
      </button>
    </div>`;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const day = Number(f.get("day"));
    const start = String(f.get("start"));
    const end = String(f.get("end"));
    if (end <= start) {
      showToast(t("console.schedule.timeOrder"), "error");
      return;
    }
    // Basic clash guard: no overlap with an existing entry on the same day.
    const clash = existing.some(
      (x) =>
        x.day_of_week === day &&
        start < String(x.end_time).slice(0, 5) &&
        end > String(x.start_time).slice(0, 5),
    );
    if (clash) {
      showToast(t("console.schedule.clash"), "error");
      return;
    }
    try {
      await data.createSchedule({
        class_id: scheduleSection.id,
        day_of_week: day,
        start_time: start,
        end_time: end,
        subject_id: Number(f.get("subject")),
        teacher_id: Number(f.get("teacher")),
        room_id: num(f.get("room")),
      });
      showToast(t("common.saved"));
      renderScheduleModal();
    } catch (err) {
      showToast(err.message ?? String(err), "error");
    }
  });
  return form;
}

document
  .getElementById("sch-close")
  .addEventListener("click", closeScheduleModal);
document
  .getElementById("sch-done")
  .addEventListener("click", closeScheduleModal);
scheduleOverlay.addEventListener("click", (e) => {
  if (e.target === scheduleOverlay) closeScheduleModal();
});

// ───────────────────────────────────────────────────────────────
//  5g. STUDENTS & ENROLLMENT (+ CSV roster import)
// ───────────────────────────────────────────────────────────────
const STUDENT_STATUSES = [
  "active",
  "inactive",
  "graduated",
  "transferred",
  "withdrawn",
];

function genderLabel(g) {
  return g ? t(`enums.gender.${g}`) : "—";
}
function coerceGender(raw) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (["m", "male", "masculino", "hombre", "h"].includes(s)) return "M";
  if (["f", "female", "femenino", "mujer"].includes(s)) return "F";
  if (s === "o" || s === "other" || s === "otro") return "O";
  return null;
}
/** Normalize a birthdate to ISO yyyy-mm-dd; null if unparseable. */
function coerceDate(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/); // dd/mm/yyyy
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

async function loadStudents() {
  renderMessageRow("students-body", 7, t("common.loading"));
  try {
    if (!state.activeYear) {
      const years = await data.listSchoolYears();
      state.activeYear = years.find((y) => y.is_active) ?? null;
    }
    const [students, sectionsList] = await Promise.all([
      data.listStudents(),
      state.activeYear
        ? data.listSections(state.activeYear.id)
        : Promise.resolve([]),
    ]);
    state.students = students;
    state.sections = sectionsList;
    if (!state.gradeLevels.length)
      state.gradeLevels = await data.listGradeLevels();
    renderStudentFilter();
    renderStudents();
  } catch (err) {
    console.error("loadStudents:", err);
    renderErrorRow("students-body", 7);
  }
}

function renderStudentFilter() {
  const sel = document.getElementById("students-filter");
  const prev = String(state.studentFilter);
  sel.innerHTML = "";
  const opts = [
    { value: "all", label: t("console.students.allSections") },
    { value: "unassigned", label: t("console.students.unassigned") },
    ...state.sections.map((s) => ({
      value: String(s.id),
      label: sectionName(s),
    })),
  ];
  opts.forEach((o) => {
    const el = document.createElement("option");
    el.value = o.value;
    el.textContent = o.label;
    if (o.value === prev) el.selected = true;
    sel.appendChild(el);
  });
}

function filteredStudents() {
  if (state.studentFilter === "all") return state.students;
  if (state.studentFilter === "unassigned")
    return state.students.filter((s) => !s.class_id);
  return state.students.filter(
    (s) => String(s.class_id) === String(state.studentFilter),
  );
}

function renderStudents() {
  const list = filteredStudents();
  const countEl = document.getElementById("students-count");
  countEl.textContent = tn("console.students.count", list.length, {
    count: list.length,
  });
  const tbody = document.getElementById("students-body");
  tbody.innerHTML = "";
  if (!list.length) {
    renderEmptyRow("students-body", 7, t("console.students.empty"));
    return;
  }
  list.forEach((s) => {
    const active = s.status === "active";
    const statusBadge = `<span class="badge ${active ? "badge-success" : "badge-neutral"}">${escapeHtml(t(`enums.studentStatus.${s.status ?? "active"}`))}</span>`;
    const secName = s.class_id
      ? (state.sections.find((x) => x.id === s.class_id) &&
          sectionName(state.sections.find((x) => x.id === s.class_id))) ||
        "—"
      : "—";
    tbody.appendChild(
      tableRow(
        [
          escapeHtml(`${s.first_name} ${s.last_name}`),
          escapeHtml(s.enrollment_number ?? "—"),
          escapeHtml(s.national_id ?? "—"),
          escapeHtml(genderLabel(s.gender)),
          escapeHtml(secName),
          statusBadge,
        ],
        [
          iconBtn("edit", t("common.edit"), () => openStudentForm(s)),
          iconBtn(
            active ? "block" : "check_circle",
            active
              ? t("console.students.deactivate")
              : t("console.students.reactivate"),
            async () => {
              await data.updateStudent(s.id, {
                status: active ? "inactive" : "active",
              });
              showToast(t("common.saved"));
              loadStudents();
            },
          ),
          iconBtn(
            "delete",
            t("common.delete"),
            () =>
              openConfirm(
                t("console.students.confirmDelete", {
                  name: `${s.first_name} ${s.last_name}`,
                }),
                async () => {
                  await data.deleteStudent(s.id);
                  showToast(t("common.deleted"));
                  loadStudents();
                },
              ),
            true,
          ),
        ],
      ),
    );
  });
}

function sectionOptions() {
  return state.sections.map((s) => ({ value: s.id, label: sectionName(s) }));
}

function openStudentForm(student = null) {
  openModal({
    title: student
      ? t("console.students.editTitle")
      : t("console.students.addTitle"),
    fields: [
      {
        name: "first_name",
        label: t("console.students.firstName"),
        value: student?.first_name,
        required: true,
      },
      {
        name: "last_name",
        label: t("console.students.lastName"),
        value: student?.last_name,
        required: true,
      },
      {
        name: "enrollment_number",
        label: t("console.students.enrollmentNumber"),
        value: student?.enrollment_number,
        help: t("console.students.enrollmentHelp"),
      },
      {
        name: "national_id",
        label: t("console.students.nationalId"),
        value: student?.national_id,
      },
      {
        name: "date_of_birth",
        label: t("console.students.dateOfBirth"),
        type: "date",
        value: student?.date_of_birth,
      },
      {
        name: "gender",
        label: t("console.students.gender"),
        type: "select",
        value: student?.gender,
        options: ["M", "F", "O"].map((v) => ({
          value: v,
          label: t(`enums.gender.${v}`),
        })),
      },
      {
        name: "email",
        label: t("console.students.email"),
        type: "email",
        value: student?.email,
      },
      {
        name: "phone",
        label: t("console.students.phone"),
        value: student?.phone,
      },
      {
        name: "class_id",
        label: t("console.students.section"),
        type: "select",
        value: student?.class_id,
        options: sectionOptions(),
      },
      {
        name: "status",
        label: t("console.students.status"),
        type: "select",
        value: student?.status ?? "active",
        required: true,
        options: STUDENT_STATUSES.map((v) => ({
          value: v,
          label: t(`enums.studentStatus.${v}`),
        })),
      },
    ],
    onSubmit: async (v) => {
      const enrollment =
        nullable(v.enrollment_number) ?? generateEnrollment(student);
      const payload = {
        first_name: v.first_name.trim(),
        last_name: v.last_name.trim(),
        enrollment_number: enrollment,
        national_id: nullable(v.national_id),
        date_of_birth: nullable(v.date_of_birth),
        gender: nullable(v.gender),
        email: nullable(v.email),
        phone: nullable(v.phone),
        class_id: num(v.class_id),
        status: v.status,
      };
      if (student) await data.updateStudent(student.id, payload);
      else await data.createStudent(payload);
      showToast(t("common.saved"));
      loadStudents();
    },
  });
}

// Unique-enough enrollment number when the admin leaves it blank. Existing
// students keep theirs (edit passes the current value through).
function generateEnrollment(student) {
  if (student?.enrollment_number) return student.enrollment_number;
  const existing = new Set(
    state.students.map((s) => s.enrollment_number).filter(Boolean),
  );
  let candidate;
  do {
    candidate = `S-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
  } while (existing.has(candidate));
  return candidate;
}

document
  .getElementById("btn-add-student")
  .addEventListener("click", () => openStudentForm());
document.getElementById("students-filter").addEventListener("change", (e) => {
  state.studentFilter = e.target.value;
  renderStudents();
});

// ── CSV roster import ──────────────────────────────────────────
const importOverlay = document.getElementById("import-overlay");
const importBody = document.getElementById("import-body");
const importFooter = document.getElementById("import-footer");

// Target fields for the roster + their auto-map aliases. Order matters:
// "id" resolves to enrollment_number, not national_id.
const IMPORT_FIELDS = [
  { key: "first_name", required: true },
  { key: "last_name", required: true },
  { key: "enrollment_number", required: false },
  { key: "national_id", required: false },
  { key: "gender", required: false },
  { key: "date_of_birth", required: false },
  { key: "email", required: false },
  { key: "phone", required: false },
];
const IMPORT_ALIASES = {
  first_name: ["first name", "firstname", "nombre", "nombres", "given name"],
  last_name: ["last name", "lastname", "apellido", "apellidos", "surname"],
  enrollment_number: [
    "enrollment number",
    "enrollment",
    "matricula",
    "matrícula",
    "student id",
    "studentid",
    "codigo",
    "código",
    "carnet",
    "id",
  ],
  national_id: [
    "national id",
    "nationalid",
    "cedula",
    "cédula",
    "dni",
    "identificacion",
    "identificación",
  ],
  gender: ["gender", "sex", "genero", "género", "sexo"],
  date_of_birth: [
    "date of birth",
    "dob",
    "birthdate",
    "birth date",
    "fecha de nacimiento",
    "nacimiento",
  ],
  email: ["email", "correo", "e-mail", "mail"],
  phone: ["phone", "telefono", "teléfono", "celular", "mobile", "tel"],
};

let importCtx = null;

function openImportModal() {
  importCtx = { text: "", targetSection: "", parsed: null, mapping: null };
  importOverlay.classList.add("active");
  renderImportSource();
}
function closeImportModal() {
  importOverlay.classList.remove("active");
  importBody.innerHTML = "";
  importFooter.innerHTML = "";
  importCtx = null;
}

function importFooterButtons(buttons) {
  importFooter.innerHTML = "";
  buttons.forEach(({ label, kind, onClick, disabled }) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `btn ${kind}`;
    b.textContent = label;
    if (disabled) b.disabled = true;
    else b.addEventListener("click", onClick);
    importFooter.appendChild(b);
  });
}

// Step 1 — paste or upload + choose an optional target section.
function renderImportSource() {
  importBody.innerHTML = `
    <p class="import-help">${escapeHtml(t("console.import.sourceHelp"))}</p>
    <div class="field-group">
      <label for="import-file">${escapeHtml(t("console.import.chooseFile"))}</label>
      <input type="file" id="import-file" accept=".csv,.tsv,.txt,text/csv" />
    </div>
    <div class="field-group">
      <label for="import-text">${escapeHtml(t("console.import.orPaste"))}</label>
      <textarea id="import-text" rows="6" placeholder="first_name,last_name,enrollment_number&#10;Ana,García,S-101">${escapeHtml(importCtx.text)}</textarea>
    </div>
    <div class="field-group">
      <label for="import-section">${escapeHtml(t("console.import.targetSection"))}</label>
      <select id="import-section">
        <option value="">${escapeHtml(t("console.import.noSection"))}</option>
        ${state.sections.map((s) => `<option value="${s.id}"${String(s.id) === String(importCtx.targetSection) ? " selected" : ""}>${escapeHtml(sectionName(s))}</option>`).join("")}
      </select>
    </div>`;

  const fileInput = /** @type {HTMLInputElement} */ (
    document.getElementById("import-file")
  );
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const text = await file.text();
    /** @type {HTMLTextAreaElement} */ (
      document.getElementById("import-text")
    ).value = text;
  });

  importFooterButtons([
    { label: t("common.cancel"), kind: "btn-ghost", onClick: closeImportModal },
    {
      label: t("console.import.next"),
      kind: "btn-primary",
      onClick: () => {
        importCtx.text = /** @type {HTMLTextAreaElement} */ (
          document.getElementById("import-text")
        ).value;
        importCtx.targetSection = /** @type {HTMLSelectElement} */ (
          document.getElementById("import-section")
        ).value;
        const parsed = parseCsv(importCtx.text);
        if (!parsed.headers.length || !parsed.rows.length) {
          showToast(t("console.import.noData"), "error");
          return;
        }
        importCtx.parsed = parsed;
        importCtx.mapping = autoMap(parsed.headers, IMPORT_ALIASES);
        renderImportMapping();
      },
    },
  ]);
}

// Step 2 — map each target field to a source column.
function renderImportMapping() {
  const { headers, rows } = importCtx.parsed;
  const rowsHtml = IMPORT_FIELDS.map((f) => {
    const opts = [
      `<option value="">${escapeHtml(t("common.none"))}</option>`,
      ...headers.map(
        (h) =>
          `<option value="${escapeHtml(h)}"${importCtx.mapping[f.key] === h ? " selected" : ""}>${escapeHtml(h)}</option>`,
      ),
    ].join("");
    return `<div class="map-row">
        <span class="map-label">${escapeHtml(t(`console.import.fields.${f.key}`))}${f.required ? ' <b class="req">*</b>' : ""}</span>
        <select data-field="${f.key}">${opts}</select>
      </div>`;
  }).join("");

  importBody.innerHTML = `
    <p class="import-help">${escapeHtml(t("console.import.mapHelp", { count: rows.length }))}</p>
    <div class="map-grid">${rowsHtml}</div>`;

  importBody.querySelectorAll("select[data-field]").forEach((sel) => {
    sel.addEventListener("change", (e) => {
      const el = /** @type {HTMLSelectElement} */ (e.target);
      importCtx.mapping[el.dataset.field] = el.value;
    });
  });

  importFooterButtons([
    {
      label: t("console.import.back"),
      kind: "btn-ghost",
      onClick: renderImportSource,
    },
    {
      label: t("console.import.preview"),
      kind: "btn-primary",
      onClick: renderImportPreview,
    },
  ]);
}

// Build normalized payloads + validation report from the current mapping.
function buildImportRows() {
  const { rows } = importCtx.parsed;
  const map = importCtx.mapping;
  const get = (row, key) => (map[key] ? (row[map[key]] ?? "").trim() : "");
  const classId = importCtx.targetSection
    ? Number(importCtx.targetSection)
    : null;

  const existing = new Set(
    state.students.map((s) => s.enrollment_number).filter(Boolean),
  );
  const seen = new Set();
  const valid = [];
  const errors = [];

  rows.forEach((row, i) => {
    const first = get(row, "first_name");
    const last = get(row, "last_name");
    if (!first || !last) {
      errors.push({ line: i + 2, reason: t("console.import.errMissingName") });
      return;
    }
    let enrollment = get(row, "enrollment_number");
    if (enrollment) {
      if (existing.has(enrollment) || seen.has(enrollment)) {
        errors.push({
          line: i + 2,
          reason: t("console.import.errDupEnrollment", { value: enrollment }),
        });
        return;
      }
    } else {
      do {
        enrollment = `S-${Date.now().toString(36)}-${valid.length}-${Math.floor(Math.random() * 1e4)}`;
      } while (existing.has(enrollment) || seen.has(enrollment));
    }
    seen.add(enrollment);
    valid.push({
      first_name: first,
      last_name: last,
      enrollment_number: enrollment,
      national_id: get(row, "national_id") || null,
      gender: coerceGender(get(row, "gender")),
      date_of_birth: coerceDate(get(row, "date_of_birth")),
      email: get(row, "email") || null,
      phone: get(row, "phone") || null,
      class_id: classId,
      status: "active",
    });
  });
  return { valid, errors };
}

// Step 3 — preview valid rows + validation summary, then import.
function renderImportPreview() {
  const { valid, errors } = buildImportRows();
  const preview = valid.slice(0, 8);
  const previewRows = preview
    .map(
      (r) =>
        `<tr><td>${escapeHtml(`${r.first_name} ${r.last_name}`)}</td><td>${escapeHtml(r.enrollment_number)}</td><td>${escapeHtml(r.national_id ?? "—")}</td><td>${escapeHtml(genderLabel(r.gender))}</td></tr>`,
    )
    .join("");
  const errorList = errors
    .slice(0, 8)
    .map(
      (e) =>
        `<li>${escapeHtml(t("console.import.lineLabel", { line: e.line }))}: ${escapeHtml(e.reason)}</li>`,
    )
    .join("");

  importBody.innerHTML = `
    <div class="import-summary">
      <span class="badge badge-success">${escapeHtml(t("console.import.willImport", { count: valid.length }))}</span>
      ${errors.length ? `<span class="badge badge-warning">${escapeHtml(t("console.import.willSkip", { count: errors.length }))}</span>` : ""}
    </div>
    ${
      valid.length
        ? `<div class="table-scroll"><table class="data-table">
            <thead><tr>
              <th>${escapeHtml(t("console.students.name"))}</th>
              <th>${escapeHtml(t("console.students.enrollmentNumber"))}</th>
              <th>${escapeHtml(t("console.students.nationalId"))}</th>
              <th>${escapeHtml(t("console.students.gender"))}</th>
            </tr></thead><tbody>${previewRows}</tbody></table></div>
           ${valid.length > preview.length ? `<p class="import-help">${escapeHtml(t("console.import.andMore", { count: valid.length - preview.length }))}</p>` : ""}`
        : `<p class="import-help">${escapeHtml(t("console.import.nothingValid"))}</p>`
    }
    ${errors.length ? `<div class="import-errors"><h3>${escapeHtml(t("console.import.skippedRows"))}</h3><ul>${errorList}</ul>${errors.length > 8 ? `<p class="import-help">${escapeHtml(t("console.import.andMore", { count: errors.length - 8 }))}</p>` : ""}</div>` : ""}`;

  importFooterButtons([
    {
      label: t("console.import.back"),
      kind: "btn-ghost",
      onClick: renderImportMapping,
    },
    {
      label: t("console.import.doImport", { count: valid.length }),
      kind: "btn-primary",
      disabled: valid.length === 0,
      onClick: async () => {
        try {
          await data.bulkCreateStudents(valid);
          showToast(t("console.import.done", { count: valid.length }));
          closeImportModal();
          loadStudents();
        } catch (err) {
          showToast(err.message ?? String(err), "error");
        }
      },
    },
  ]);
}

document
  .getElementById("btn-import-csv")
  .addEventListener("click", openImportModal);
document
  .getElementById("import-close")
  .addEventListener("click", closeImportModal);
importOverlay.addEventListener("click", (e) => {
  if (e.target === importOverlay) closeImportModal();
});

// ───────────────────────────────────────────────────────────────
//  5h. SETTINGS (read-only)
// ───────────────────────────────────────────────────────────────
async function loadSettings() {
  const root = document.getElementById("settings-root");
  if (!root) return;
  let profile = PROFILE;
  if (!profile) {
    try {
      profile = await fetchProfile();
      PROFILE = profile;
    } catch (err) {
      console.error("loadSettings:", err);
      loaded.settings = false;
      root.innerHTML = `<div class="loading-cell">${t("common.couldNotLoadProfile")}</div>`;
      return;
    }
  }
  const email = session.user.email ?? "";
  renderSettings(root, {
    context: "admin",
    identity: {
      displayName: profile.name || t("console.profile.admin"),
      subtitle: t("settings.roleAdmin"),
      avatarIcon: "admin_panel_settings",
      roleBadge: { text: t("settings.roleAdmin"), className: "badge-primary" },
    },
    personal: [
      { label: t("settings.fields.name"), value: profile.name, icon: "badge" },
      { label: t("settings.fields.email"), value: email, icon: "mail" },
    ],
    username: email,
    email,
  });
}

// ───────────────────────────────────────────────────────────────
//  INIT
// ───────────────────────────────────────────────────────────────
if (DEMO_MODE) {
  const logo = document.querySelector("aside .logo");
  if (logo) {
    const badge = document.createElement("span");
    badge.className = "demo-badge";
    badge.dataset.i18n = "admin.demo.badge";
    badge.dataset.i18nTitle = "admin.demo.sandboxNotice";
    badge.textContent = t("admin.demo.badge");
    badge.title = t("admin.demo.sandboxNotice");
    logo.appendChild(badge);
  }
}

loadOverview();
showSection("overview");
