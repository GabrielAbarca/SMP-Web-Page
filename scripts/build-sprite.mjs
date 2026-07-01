// Build src/icons/icons.svg — an inline SVG sprite containing ONLY the icons the
// app actually uses, extracted from the Material Symbols Outlined (weight 400, FILL 0)
// SVGs shipped by the @material-symbols/svg-400 dev dependency.
//
// Usage:
//   npm i -D @material-symbols/svg-400
//   node scripts/build-sprite.mjs
//   npm uninstall @material-symbols/svg-400   # nothing extra ships
//
// The generated src/icons/icons.svg is committed and inlined into every HTML entry
// point by the inline-svg-sprite plugin in vite.config.js. To add/remove an icon,
// edit ICONS below, reinstall the dev dep, and re-run this script.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC_DIR = resolve(ROOT, "node_modules/@material-symbols/svg-400/outlined");
const OUT_FILE = resolve(ROOT, "src/icons/icons.svg");

// The exact set of icons used across the app (HTML + JS-generated). Keep sorted.
// This set was derived directly from source: static `material-symbols-outlined`
// spans plus every dynamic value (toast icons, settings/profile config `icon:`
// fields, the event-type and subject icon maps in main.js, makeActionBtn args,
// and the login.js avatar / password-toggle swaps).
const ICONS = [
  "account_circle", "add", "admin_panel_settings", "alternate_email", "arrow_back",
  "assignment", "badge", "beach_access", "biotech", "block", "book", "cake", "calculate",
  "calendar_month", "calendar_today", "call", "category", "celebration", "check_circle",
  "chevron_right", "close", "co_present", "dark_mode", "dashboard", "delete",
  "deployed_code", "description", "edit", "edit_note", "error", "event", "event_available",
  "event_busy", "fact_check", "fingerprint", "fitness_center", "gavel", "grade", "grading",
  "group", "groups", "handshake", "help", "history_edu", "home", "info", "light_mode",
  "list_alt", "lock", "lock_reset", "logout", "mail", "menu", "menu_book", "monitoring",
  "palette", "password", "person", "person_add", "policy", "print", "public", "quiz",
  "save", "schedule", "school", "science", "search", "settings", "support_agent", "tag",
  "today", "translate", "tune", "visibility", "visibility_off", "wc", "weekend",
];

// Material Symbols ligatures that share a glyph are deduped by the npm package under
// one canonical filename. Map the ligature we use → the file that holds its glyph.
const ALIASES = {
  grade: "star", // "grade" (the star rating icon) ships as star.svg
};

const VIEWBOX = "0 -960 960 960";

function symbolFor(name) {
  const file = ALIASES[name] ?? name;
  let raw;
  try {
    raw = readFileSync(resolve(SRC_DIR, `${file}.svg`), "utf8");
  } catch {
    throw new Error(
      `Missing icon "${name}" (file "${file}.svg") in ${SRC_DIR}. Check the name, or run \`npm i -D @material-symbols/svg-400\` first.`
    );
  }

  // Copy each source SVG's OWN viewBox (don't assume one) so a symbol's path
  // coordinate system always matches its render box. Falls back to the Material
  // Symbols default grid only if a source somehow omits it.
  const vb = (raw.match(/viewBox="([^"]+)"/) || [])[1] || VIEWBOX;

  // Pull out everything inside the root <svg> … </svg> (the <path> element(s)).
  const inner = raw.match(/<svg[^>]*>([\s\S]*?)<\/svg>/);
  if (!inner) throw new Error(`Could not parse <svg> for "${name}".`);

  // Strip any hardcoded fill, then force fill="currentColor" so CSS color/theme rules apply.
  const paths = inner[1]
    .replace(/\s*fill="[^"]*"/g, "")
    .replace(/<path\b/g, '<path fill="currentColor"');

  return `<symbol id="icon-${name}" viewBox="${vb}">${paths}</symbol>`;
}

const symbols = ICONS.map(symbolFor).join("\n  ");
const sprite =
  `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">\n  ` +
  symbols +
  `\n</svg>\n`;

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, sprite, "utf8");
console.log(`Wrote ${ICONS.length} symbols to ${OUT_FILE}`);
