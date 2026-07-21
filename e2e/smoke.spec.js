import { test, expect } from "@playwright/test";
import {
  REF,
  studentFix,
  teacherFix,
  consoleFix,
  routeSupabase,
  sessionSeed,
} from "./fixtures.js";

// Fail the test if any uncaught error reaches the page.
function trackErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

test.describe("login", () => {
  test("loads with locked demo credentials and hidden sign-up, no errors", async ({
    page,
    context,
  }) => {
    await routeSupabase(context, {});
    const errors = trackErrors(page);

    await page.goto("/login.html");
    await page.waitForSelector("#auth-form");

    await expect(page.locator("#input-email")).not.toHaveValue("");
    expect(
      await page.locator("#input-email").evaluate((el) => el.readOnly),
    ).toBe(true);
    // Sign-up path is disabled in the demo.
    expect(
      await page
        .locator(".auth-switch")
        .evaluate((el) => getComputedStyle(el).display === "none")
        .catch(() => true),
    ).toBe(true);

    expect(errors).toEqual([]);
  });
});

test.describe("student portal", () => {
  test("dashboard renders mocked data and the theme toggles", async ({
    page,
    context,
  }) => {
    const writes = await routeSupabase(context, studentFix);
    await context.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [`sb-${REF}-auth-token`, sessionSeed()],
    );
    const errors = trackErrors(page);

    await page.goto("/");
    await page.waitForFunction(
      () =>
        document.getElementById("welcome-name")?.textContent?.includes("Ana"),
      { timeout: 10_000 },
    );

    await expect(page.locator("#attendance-pct")).toContainText("%");
    await expect(page.locator("#grade-avg")).not.toHaveText("");
    await expect(page.locator("#upcoming-events-card")).toContainText(
      "Final Exams",
    );

    // Theme toggle flips the <html> dark class.
    const before = await page.evaluate(() =>
      document.documentElement.classList.contains("dark-theme-variables"),
    );
    await page.click(".theme-toggler");
    const after = await page.evaluate(() =>
      document.documentElement.classList.contains("dark-theme-variables"),
    );
    expect(after).toBe(!before);

    expect(errors).toEqual([]);
    // Student portal is read-only; nothing should write to the backend.
    expect(writes).toEqual([]);
  });
});

test.describe("teacher console", () => {
  test("loads the teacher workspace in demo mode with zero writes", async ({
    page,
    context,
  }) => {
    const writes = await routeSupabase(context, teacherFix);
    await context.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [`sb-${REF}-auth-token`, sessionSeed()],
    );
    const errors = trackErrors(page);

    await page.goto("/teacher.html");
    await page.waitForFunction(
      () =>
        document.getElementById("teacher-name")?.textContent?.includes("Sofía"),
      { timeout: 10_000 },
    );
    await expect(page.locator(".demo-badge").first()).toBeVisible();

    expect(errors).toEqual([]);
    expect(writes).toEqual([]);
  });
});

test.describe("admin console", () => {
  test("loads the shell, does academic-structure CRUD, and never writes", async ({
    page,
    context,
  }) => {
    const writes = await routeSupabase(context, consoleFix);
    await context.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [`sb-${REF}-auth-token`, sessionSeed()],
    );
    const errors = trackErrors(page);

    await page.goto("/admin.html");
    await page.waitForFunction(
      () =>
        document.getElementById("admin-name")?.textContent?.includes("Gabriel"),
      { timeout: 10_000 },
    );
    await expect(page.locator("#overview-year-text")).toContainText(
      "2025-2026",
    );
    await expect(page.locator(".demo-badge").first()).toBeVisible();

    // Year & Periods: the seeded year renders; adding one shows optimistically.
    await page.click('.sidebar a[data-page="yearperiods"]');
    await expect(page.locator("#years-body")).toContainText("2025-2026");
    await page.click("#btn-add-year");
    await page.fill("#modal-field-name", "2026-2027");
    await page.fill("#modal-field-start_date", "2026-09-01");
    await page.fill("#modal-field-end_date", "2027-06-30");
    await page.click("#modal-submit");
    await expect(page.locator("#years-body")).toContainText("2026-2027");

    // Students & Enrollment stays a Phase 3 placeholder.
    await page.click('.sidebar a[data-page="students"]');
    await expect(
      page.locator("#view-students .console-placeholder"),
    ).toBeVisible();

    expect(errors).toEqual([]);
    // Demo mode: the write landed in the in-browser overlay, not Supabase.
    expect(writes).toEqual([]);
  });

  test("bounces a teacher-role profile to the teacher console", async ({
    page,
    context,
  }) => {
    await routeSupabase(context, teacherFix);
    await context.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [`sb-${REF}-auth-token`, sessionSeed()],
    );

    await page.goto("/admin.html");
    await page.waitForURL("**/teacher.html", { timeout: 10_000 });
    await page.waitForFunction(
      () =>
        document.getElementById("teacher-name")?.textContent?.includes("Sofía"),
      { timeout: 10_000 },
    );
  });
});
