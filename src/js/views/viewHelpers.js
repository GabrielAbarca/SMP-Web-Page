import { t } from "../i18n.js";

/** Student/teacher status label from the DB status value. */
export function statusLabel(status) {
  return status ? t(`enums.studentStatus.${status}`) : "";
}

/** A score wrapped in its pass/mid/fail color-coding span. */
export function scoreHtml(score) {
  const cls =
    score >= 70 ? "score-high" : score >= 50 ? "score-mid" : "score-low";
  return `<span class="${cls}">${score}</span>`;
}

/**
 * Escape a value for interpolation into an HTML template string.
 *
 * The teacher console has its own copy in teacherTableHelpers.js, but that
 * module pulls in teacherAuth/teacherState — importing it from a student view
 * would drag the teacher console's auth into the student bundle.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
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
