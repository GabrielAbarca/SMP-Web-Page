// ═══════════════════════════════════════════════════════════════
//  admin.js — Simple Manage Pro | Admin Console
//
//  The school director/coordinator portal: where a school gets
//  configured and operated. This is the authenticated shell —
//  role-gated entry, bilingual navigation, a school-year overview
//  and read-only Settings; the data sections (academic structure,
//  people, enrollment) are placeholders that land in later updates.
//
//  Architecture (mirrors teacher.js):
//  1. Auth guard + role gate (admin only)
//  2. Data layer  (db object — reads only while the shell has no forms;
//     the demo-overlay wrapper arrives with the first write)
//  3. Navigation  (sidebar → view sections)
//  4. Overview + read-only Settings
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
import { initI18n, applyTranslations, t } from "./i18n.js";

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
// Reads only: the shell has no forms yet, so there is nothing to sandbox.
// The first write feature must wrap this object in a demo overlay
// (wrapDbForDemo pattern in demoDb.js) before it ships.
const db = {
  async fetchProfile() {
    const { data, error } = await supabase
      .from("profiles")
      .select("name, role")
      .eq("id", session.user.id)
      .single();
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
};

// ───────────────────────────────────────────────────────────────
//  3. NAVIGATION
// ───────────────────────────────────────────────────────────────
const sections = document.querySelectorAll(".view-section");
const navLinks = document.querySelectorAll(".sidebar a[data-page]");
const loaded = { settings: false };

let PROFILE = null; // filled by loadOverview, reused by Settings

function showSection(page) {
  sections.forEach((s) => s.classList.remove("active"));
  navLinks.forEach((a) => a.classList.remove("active"));

  const target = document.getElementById(`view-${page}`);
  if (target) target.classList.add("active");
  document
    .querySelector(`.sidebar a[data-page="${page}"]`)
    ?.classList.add("active");

  if (page === "settings" && !loaded.settings) {
    loaded.settings = true;
    loadSettings();
  }
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
  // Snap to Account & Profile (default sub-tab on first render; re-select it
  // when re-opening after the user switched to another settings sub-tab).
  document
    .querySelector('#settings-root .settings-rail-item[data-section="account"]')
    ?.click();
});

initTheme();
bindThemeToggle(document.querySelector(".theme-toggler"));

// Resolve this view's language (stored "smp-lang-console" → browser → English)
// and translate the static markup before any section renders.
initI18n("admin");
applyTranslations();

// ───────────────────────────────────────────────────────────────
//  4. OVERVIEW + SETTINGS
// ───────────────────────────────────────────────────────────────
async function loadOverview() {
  const welcomeTitle = document.getElementById("overview-welcome-title");
  const yearText = document.getElementById("overview-year-text");

  try {
    const [profile, year] = await Promise.all([
      db.fetchProfile(),
      db.fetchActiveYear(),
    ]);
    PROFILE = profile;

    const name = profile?.name ?? "";
    document.getElementById("admin-name").textContent =
      name || t("console.profile.admin");
    if (welcomeTitle) {
      welcomeTitle.textContent = name
        ? t("console.overview.welcome", { name })
        : t("console.overview.welcomeFallback");
    }
    if (yearText) {
      yearText.textContent = year?.name
        ? `${t("console.overview.activeYear")}: ${year.name}`
        : t("console.overview.noActiveYear");
    }
  } catch (err) {
    console.error("loadOverview:", err);
    if (yearText) yearText.textContent = t("common.loadFailed");
  }
}

// Read-only Settings for the admin context. Admins have no teachers/students
// record — identity comes from the profiles row + the auth session email.
async function loadSettings() {
  const root = document.getElementById("settings-root");
  if (!root) return;

  let profile = PROFILE;
  if (!profile) {
    try {
      profile = await db.fetchProfile();
    } catch (err) {
      console.error("loadSettings:", err);
      loaded.settings = false; // allow a retry on next visit
      root.innerHTML = `<div class="loading-cell">${t("common.couldNotLoadProfile")}</div>`;
      return;
    }
  }

  const email = session.user.email ?? "";
  const adapter = {
    context: "admin",
    identity: {
      displayName: profile.name || t("console.profile.admin"),
      subtitle: t("settings.roleAdmin"),
      avatarIcon: "admin_panel_settings",
      roleBadge: {
        text: t("settings.roleAdmin"),
        className: "badge-primary",
      },
    },
    personal: [
      { label: t("settings.fields.name"), value: profile.name, icon: "badge" },
      { label: t("settings.fields.email"), value: email, icon: "mail" },
    ],
    username: email,
    email,
  };

  renderSettings(root, adapter);
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
