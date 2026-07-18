// ─────────────────────────────────────────────────────────────
//  Small shared UI helpers — shimmer skeleton placeholders used
//  for loading states across the student portal and admin views.
//  (Empty / error states stay as plain text or .empty-state.)
// ─────────────────────────────────────────────────────────────

/** Skeleton rows for a <tbody> while a table loads. */
export function skeletonRows(rows = 4, cols = 4) {
  const cell = '<td><span class="skeleton skeleton-text"></span></td>';
  let out = "";
  for (let r = 0; r < rows; r++) {
    out += `<tr class="skeleton-row">${cell.repeat(cols)}</tr>`;
  }
  return out;
}

/** Skeleton lines for a card / list / panel while it loads. */
export function skeletonBlock(lines = 3) {
  let out = '<div class="skeleton-block">';
  for (let i = 0; i < lines; i++) {
    out += '<span class="skeleton skeleton-line"></span>';
  }
  return out + "</div>";
}

/** Bare skeleton cards — for a parent that is already a card grid. */
export function skeletonCardItems(count = 3) {
  return '<div class="skeleton skeleton-card"></div>'.repeat(count);
}

/** Self-contained skeleton card grid — for a plain (non-grid) container. */
export function skeletonCards(count = 3) {
  return `<div class="skeleton-cards">${skeletonCardItems(count)}</div>`;
}

/** Wire the mobile nav drawer (open, close, scrim, Escape). Returns the closer. */
export function initSidebarToggle() {
  const aside = document.querySelector(".container > aside");
  const open = () => {
    aside.classList.add("active");
    document.body.classList.add("nav-open");
  };
  const close = () => {
    aside.classList.remove("active");
    document.body.classList.remove("nav-open");
  };
  document.getElementById("menu-btn")?.addEventListener("click", open);
  const closeBtn = document.getElementById("close-btn");
  closeBtn?.addEventListener("click", close);
  closeBtn?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      close();
    }
  });
  document.body.addEventListener("click", (e) => {
    if (e.target === document.body) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
  return close;
}
