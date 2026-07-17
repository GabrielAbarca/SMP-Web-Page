import { defineConfig, devices } from "@playwright/test";

// Self-contained e2e: the dev server boots with dummy Supabase env (the specs
// mock the backend at the network layer), so no real .env or backend is needed
// — the same command works locally and in CI.
const PORT = 5199;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      VITE_SUPABASE_URL: "https://demo.supabase.co",
      VITE_SUPABASE_ANON_KEY: "e2e-anon-key",
      VITE_DEMO_MODE: "true",
    },
  },
});
