// Frontend demo-sandbox flag. Default ON so a deployed build is always
// protected even if the env var is forgotten; point the app at a real,
// writable backend by setting VITE_DEMO_MODE=false (e.g. in .env.local).
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE !== "false";

// Shared demo account the login page prefills and locks. This is a dedicated,
// low-privilege sandbox user (not a personal account); the password is public
// by design in a one-click demo, so it must never be reused elsewhere.
export const DEMO_CREDENTIALS = {
  email: "demo@smp.app",
  password: "smp-demo-2026",
};
