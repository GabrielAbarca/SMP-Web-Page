// ─────────────────────────────────────────────────────────────────
//  SETTINGS — one shared, read-only renderer for both contexts.
//
//  index.html (student) and admin.html (teacher) share the SAME
//  structure but feed DIFFERENT data. Rather than duplicate markup,
//  each context resolves its own record, normalizes it into the
//  adapter shape below, and calls renderSettings(rootEl, adapter).
//
//  DEMO SCOPE: display only. Everything in Account & Profile is
//  natively `disabled` (greyed inputs + inert buttons); the Login
//  security card is presentational (no Supabase Auth). Preferences is
//  a styled shell (Language stub is a no-op, flagged "Coming soon").
//  No writes of any kind originate here.
//
//  Adapter shape:
//    {
//      context: "student" | "teacher",
//      identity: {
//        displayName, subtitle, avatarIcon,
//        roleBadge: { text, className }
//      },
//      personal: [ { label, value, icon }, ... ],
//      username,   // account login identity (email)
//      email       // shown in Login security
//    }
// ─────────────────────────────────────────────────────────────────

// App version surfaced in "More info". Bump alongside package.json.
const APP_VERSION = "1.0.0";

// Local HTML-escape — values originate from the DB. Mirrors admin.js's escapeHtml.
function esc(value) {
  if (value === null || value === undefined) return "—";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Settings sub-sections — the left rail. `render` builds each panel body.
const SECTIONS = [
  { id: "account", label: "Account & Profile", icon: "account_circle", render: renderAccount },
  { id: "preferences", label: "Preferences", icon: "tune", render: renderPreferences },
  { id: "help", label: "Help", icon: "help", render: renderHelp },
  { id: "moreinfo", label: "More info", icon: "info", render: renderMoreInfo },
];

/**
 * Render the full Settings UI (left rail + panels) into `rootEl`.
 * Idempotent: a re-render replaces previous content and rebinds events.
 */
export function renderSettings(rootEl, adapter) {
  if (!rootEl) return;

  const rail = SECTIONS.map(
    (s, i) => `
    <button
      type="button"
      class="settings-rail-item${i === 0 ? " active" : ""}"
      data-section="${s.id}"
      role="tab"
      aria-selected="${i === 0 ? "true" : "false"}"
    >
      <span class="material-symbols-outlined">${s.icon}</span>
      <span>${esc(s.label)}</span>
    </button>`,
  ).join("");

  const panels = SECTIONS.map(
    (s, i) => `
    <section class="settings-panel${i === 0 ? " active" : ""}" id="settings-panel-${s.id}" role="tabpanel">
      ${s.render(adapter)}
    </section>`,
  ).join("");

  rootEl.innerHTML = `
    <div class="settings">
      <nav class="settings-rail" role="tablist" aria-label="Settings sections">
        ${rail}
      </nav>
      <div class="settings-panels">
        ${panels}
      </div>
    </div>`;

  // Local-only tab switching — no app router, no persistence.
  const items = rootEl.querySelectorAll(".settings-rail-item");
  const sectionPanels = rootEl.querySelectorAll(".settings-panel");
  items.forEach((item) => {
    item.addEventListener("click", () => {
      const id = item.dataset.section;
      items.forEach((b) => {
        const on = b === item;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      sectionPanels.forEach((p) =>
        p.classList.toggle("active", p.id === `settings-panel-${id}`),
      );
    });
  });

  // Language stub — visual-only toggle so it feels responsive. It deliberately
  // does NOT persist or call anything; deeper wiring lands in a later prompt.
  const segments = rootEl.querySelectorAll(".settings-segment");
  segments.forEach((seg) => {
    seg.addEventListener("click", () => {
      segments.forEach((s) => s.classList.toggle("active", s === seg));
    });
  });
}

// ── Account & Profile ────────────────────────────────────────────
function renderAccount(adapter) {
  const id = adapter.identity ?? {};
  const badge = id.roleBadge ?? { text: "", className: "badge-primary" };

  const personalFields = (adapter.personal ?? [])
    .map(
      (f) => `
      <label class="settings-field">
        <span class="settings-field-label">
          ${f.icon ? `<span class="material-symbols-outlined">${f.icon}</span>` : ""}
          ${esc(f.label)}
        </span>
        <input type="text" value="${esc(f.value)}" disabled />
      </label>`,
    )
    .join("");

  return `
    <div class="settings-demo-banner" role="note">
      <span class="material-symbols-outlined">lock</span>
      <span>Editing is disabled in this demo — values are shown read-only.</span>
    </div>

    <div class="settings-identity">
      <div class="settings-avatar">
        <span class="material-symbols-outlined">${esc(id.avatarIcon ?? "person")}</span>
      </div>
      <div class="settings-identity-meta">
        <h3>${esc(id.displayName)}</h3>
        <p>${esc(id.subtitle)}</p>
      </div>
      <span class="badge ${esc(badge.className)}">${esc(badge.text)}</span>
    </div>

    <div class="settings-card">
      <h4 class="settings-card-title">Personal info</h4>
      <div class="settings-grid">
        ${personalFields}
      </div>
    </div>

    <div class="settings-card">
      <h4 class="settings-card-title">Username</h4>
      <div class="settings-row">
        <label class="settings-field settings-field-grow">
          <span class="settings-field-label">
            <span class="material-symbols-outlined">alternate_email</span>
            Username
          </span>
          <input type="text" value="${esc(adapter.username)}" disabled />
        </label>
        <button type="button" class="btn btn-ghost" disabled>Change username</button>
      </div>
      <p class="settings-hint">Your username is the email you sign in with.</p>
    </div>

    <div class="settings-card">
      <h4 class="settings-card-title">Login security</h4>
      <div class="settings-row">
        <label class="settings-field settings-field-grow">
          <span class="settings-field-label">
            <span class="material-symbols-outlined">mail</span>
            Email
          </span>
          <input type="email" value="${esc(adapter.email)}" disabled />
        </label>
      </div>
      <div class="settings-row">
        <label class="settings-field settings-field-grow">
          <span class="settings-field-label">
            <span class="material-symbols-outlined">password</span>
            Password
          </span>
          <input type="password" value="••••••••••" disabled />
        </label>
        <button type="button" class="btn btn-ghost" disabled>Change password</button>
      </div>
      <div class="settings-toggle-row">
        <div class="settings-toggle-text">
          <span class="settings-toggle-title">Two-factor authentication</span>
          <span class="settings-hint">Adds a second step at sign-in.</span>
        </div>
        <span class="settings-switch" aria-disabled="true" title="Disabled in demo"></span>
      </div>
    </div>`;
}

// ── Preferences (shell only) ─────────────────────────────────────
function renderPreferences() {
  return `
    <div class="settings-card">
      <h4 class="settings-card-title">Preferences</h4>

      <div class="settings-toggle-row">
        <div class="settings-toggle-text">
          <span class="settings-toggle-title">Language</span>
          <span class="settings-hint">Choose the language for the interface.</span>
        </div>
        <div class="settings-segmented" role="group" aria-label="Language">
          <button type="button" class="settings-segment active" data-lang="en">English</button>
          <button type="button" class="settings-segment" data-lang="es">Español</button>
        </div>
        <span class="settings-coming-soon">Coming soon</span>
      </div>

      <p class="settings-hint">More preferences will land in a future update.</p>
    </div>`;
}

// ── Help (static) ────────────────────────────────────────────────
function renderHelp() {
  const faqs = [
    {
      q: "How do I view my grades?",
      a: "Open the Grades section from the sidebar to see scores by subject and grading period.",
    },
    {
      q: "Where do I check attendance?",
      a: "The Attendance section lists every record with its status and the staff member who logged it.",
    },
    {
      q: "Why can't I edit my profile?",
      a: "This is a demo build — Account & Profile is read-only so reviewers can explore safely.",
    },
  ];

  const faqHtml = faqs
    .map(
      (f) => `
      <div class="settings-faq-item">
        <p class="settings-faq-q">${esc(f.q)}</p>
        <p class="settings-faq-a">${esc(f.a)}</p>
      </div>`,
    )
    .join("");

  return `
    <div class="settings-card">
      <h4 class="settings-card-title">Frequently asked</h4>
      <div class="settings-faq">${faqHtml}</div>
    </div>

    <div class="settings-card">
      <h4 class="settings-card-title">Need a hand?</h4>
      <p class="settings-hint">
        Use the sidebar to move between sections. Each card on the dashboard is a shortcut to
        its full view.
      </p>
      <div class="settings-contact">
        <span class="material-symbols-outlined">support_agent</span>
        <span>Contact support — <span class="settings-muted">gzelaya0404@gmail.com</span></span>
      </div>
    </div>`;
}

// ── More info (static) ───────────────────────────────────────────
function renderMoreInfo() {
  return `
    <div class="settings-card">
      <h4 class="settings-card-title">About Simple Manage Pro</h4>
      <p class="settings-hint">
        Simple Manage Pro (SMP) is a school-management portal for students, teachers and staff —
        grades, attendance, schedules and class information in one place.
      </p>
      <div class="settings-meta-row">
        <span class="settings-field-label">
          <span class="material-symbols-outlined">deployed_code</span>
          Version
        </span>
        <span class="badge badge-info">v${esc(APP_VERSION)} · Demo</span>
      </div>
    </div>

    <div class="settings-card">
      <h4 class="settings-card-title">Links</h4>
      <ul class="settings-links">
        <li><span class="material-symbols-outlined">description</span> Documentation <span class="settings-coming-soon">Coming soon</span></li>
        <li><span class="material-symbols-outlined">policy</span> Privacy policy <span class="settings-coming-soon">Coming soon</span></li>
        <li><span class="material-symbols-outlined">gavel</span> Terms of service <span class="settings-coming-soon">Coming soon</span></li>
      </ul>
    </div>`;
}
