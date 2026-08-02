import "./errorHandler.js";

// ─────────────────────────────────────────────────────────────
//  Privacy / terms pages.
//
//  Both languages ship in the markup and this only decides which one is
//  visible. Legal text does not belong in the i18n dictionaries: those are
//  loaded by the app bundles and hold interface strings, while this is long
//  prose that has to stay readable in the page source, remain available if
//  scripting fails, and be quotable by someone who was shown it. A reader
//  with JavaScript off sees English rather than an empty page.
// ─────────────────────────────────────────────────────────────

const SUPPORTED = ["en", "es"];

/**
 * Which language to show. The student portal's stored choice is read but
 * never written — language belongs to the app's scoped preference, and a
 * visitor reading the privacy page shouldn't silently retarget it.
 */
function preferredLang() {
  try {
    const stored = localStorage.getItem("smp-lang-student");
    if (SUPPORTED.includes(stored)) return stored;
  } catch {
    // Private browsing can throw on access; fall through to the browser.
  }
  const nav = (navigator.language || "").slice(0, 2).toLowerCase();
  return SUPPORTED.includes(nav) ? nav : "en";
}

/**
 * @param {string} selector
 * @returns {NodeListOf<HTMLElement>}
 */
function all(selector) {
  return document.querySelectorAll(selector);
}

/** Elements carrying `data-legal-text="en:…|es:…"` (the footer links). */
function applyInlineText(lang) {
  all("[data-legal-text]").forEach((el) => {
    const map = Object.fromEntries(
      (el.dataset.legalText ?? "").split("|").map((pair) => {
        const at = pair.indexOf(":");
        return [pair.slice(0, at), pair.slice(at + 1)];
      }),
    );
    if (map[lang]) el.textContent = map[lang];
  });
}

function setLang(lang) {
  const next = SUPPORTED.includes(lang) ? lang : "en";
  document.documentElement.lang = next;

  all("[data-legal-lang]").forEach((section) => {
    section.hidden = section.dataset.legalLang !== next;
  });

  all("[data-legal-set-lang]").forEach((btn) => {
    const active = btn.dataset.legalSetLang === next;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  });

  applyInlineText(next);
}

all("[data-legal-set-lang]").forEach((btn) => {
  btn.addEventListener("click", () => setLang(btn.dataset.legalSetLang));
});

setLang(preferredLang());
