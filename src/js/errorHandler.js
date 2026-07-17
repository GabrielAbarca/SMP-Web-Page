// Global safety net — surface a neutral, dismissible banner when an uncaught
// error or unhandled promise rejection escapes, so a failure never leaves the
// user staring at a silently broken screen. The real error is always logged to
// the console; the user sees a generic message (no internals leaked).
//
// Imported first in every entry point so the listeners are registered before
// any other module's top-level code can throw. Dependency-free and self-styled
// so it works on every page regardless of which stylesheet loaded.

// Intentional control-flow throws that halt a module right after a redirect
// (the auth guards) are not failures — don't alarm the user for those.
const BENIGN = [/^Unauthenticated$/, /No student profile/i];

let bannerShown = false;

function isBenign(reason) {
  const msg =
    reason && reason.message ? String(reason.message) : String(reason ?? "");
  return BENIGN.some((re) => re.test(msg));
}

function bannerText() {
  const es = (document.documentElement.lang || "")
    .toLowerCase()
    .startsWith("es");
  return es
    ? "Algo salió mal. Por favor, actualiza la página."
    : "Something went wrong. Please refresh the page.";
}

function showErrorBanner() {
  if (bannerShown) return; // one at a time — don't let a loop spam banners
  bannerShown = true;

  const bar = document.createElement("div");
  bar.setAttribute("role", "alert");
  Object.assign(bar.style, {
    position: "fixed",
    insetInline: "0",
    top: "0",
    zIndex: "2147483647",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "1rem",
    padding: "0.75rem 1rem",
    background: "#b3261e",
    color: "#fff",
    font: "500 0.9rem/1.3 system-ui, sans-serif",
    boxShadow: "0 2px 8px rgba(0,0,0,.25)",
  });
  bar.append(bannerText());

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.setAttribute("aria-label", "Dismiss");
  dismiss.textContent = "✕";
  Object.assign(dismiss.style, {
    background: "transparent",
    border: "0",
    color: "inherit",
    cursor: "pointer",
    fontSize: "1rem",
    lineHeight: "1",
  });
  dismiss.addEventListener("click", () => {
    bar.remove();
    bannerShown = false;
  });
  bar.appendChild(dismiss);

  (document.body ?? document.documentElement).appendChild(bar);
}

window.addEventListener("error", (event) => {
  if (isBenign(event.error ?? event.message)) return;
  console.error("[SMP] Uncaught error:", event.error ?? event.message);
  showErrorBanner();
});

window.addEventListener("unhandledrejection", (event) => {
  if (isBenign(event.reason)) return;
  console.error("[SMP] Unhandled promise rejection:", event.reason);
  showErrorBanner();
});
