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

    // Students & Enrollment renders its roster panel (empty seed → prompt).
    await page.click('.sidebar a[data-page="students"]');
    await expect(page.locator("#view-students .console-panel")).toBeVisible();
    await expect(page.locator("#students-body")).toContainText(/No students/);

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

  test("enrolls a student and CSV-imports a roster with zero writes", async ({
    page,
    context,
  }) => {
    const seeded = {
      ...consoleFix,
      grade_levels: [{ id: 1, name: "7th Grade", numeric_level: 7 }],
      classes: [
        {
          id: 21,
          school_year_id: 1,
          grade_level_id: 1,
          section: "A",
          display_name: "7A",
        },
      ],
      students: [],
    };
    const writes = await routeSupabase(context, seeded);
    await context.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [`sb-${REF}-auth-token`, sessionSeed()],
    );
    const errors = trackErrors(page);

    await page.goto("/admin.html");
    await page.waitForFunction(() =>
      document.getElementById("admin-name")?.textContent?.includes("Gabriel"),
    );
    await page.click('.sidebar a[data-page="students"]');

    // Add one student enrolled into 7A.
    await page.click("#btn-add-student");
    await page.fill("#modal-field-first_name", "Ana");
    await page.fill("#modal-field-last_name", "García");
    await page.fill("#modal-field-enrollment_number", "S-101");
    await page.selectOption("#modal-field-class_id", { label: "7A" });
    await page.click("#modal-submit");
    await expect(page.locator("#students-body")).toContainText("Ana García");

    // CSV import: paste 3 rows (one with a blank enrollment → auto-generated).
    await page.click("#btn-import-csv");
    await page.fill(
      "#import-text",
      "first_name,last_name,enrollment_number,gender\n" +
        "Luis,Martínez,S-102,M\nMaría,Rojas,S-103,F\nCarlos,Díaz,,M",
    );
    await page.selectOption("#import-section", { label: "7A" });
    await page.click("#import-footer .btn-primary"); // → mapping
    await expect(page.locator(".map-grid")).toBeVisible();
    await page.click("#import-footer .btn-primary"); // → preview
    await expect(page.locator(".import-summary")).toContainText("3");
    await page.click("#import-footer .btn-primary"); // → import
    await expect(page.locator("#students-body")).toContainText("Carlos Díaz");

    expect(errors).toEqual([]);
    expect(writes).toEqual([]);
  });

  test("overview shows enrollment, attendance rate and at-risk absences", async ({
    page,
    context,
  }) => {
    const today = new Date().toISOString().slice(0, 10);
    const seeded = {
      ...consoleFix,
      grade_levels: [{ id: 1, name: "7th Grade", numeric_level: 7 }],
      classes: [
        {
          id: 21,
          school_year_id: 1,
          grade_level_id: 1,
          section: "A",
          display_name: "7A",
        },
      ],
      students: [
        {
          id: 101,
          first_name: "Ana",
          last_name: "García",
          status: "active",
          class_id: 21,
        },
        {
          id: 102,
          first_name: "Luis",
          last_name: "Martínez",
          status: "active",
          class_id: 21,
        },
        {
          id: 103,
          first_name: "María",
          last_name: "Rojas",
          status: "inactive",
          class_id: 21,
        },
      ],
      attendance: [
        {
          id: 1,
          student_id: 101,
          class_id: 21,
          date: today,
          status: "present",
        },
        { id: 2, student_id: 102, class_id: 21, date: today, status: "absent" },
        {
          id: 3,
          student_id: 101,
          class_id: 21,
          date: "2026-01-01",
          status: "absent",
        },
        {
          id: 4,
          student_id: 101,
          class_id: 21,
          date: "2026-01-02",
          status: "absent",
        },
        {
          id: 5,
          student_id: 101,
          class_id: 21,
          date: "2026-01-03",
          status: "absent",
        },
      ],
    };
    const writes = await routeSupabase(context, seeded);
    await context.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [`sb-${REF}-auth-token`, sessionSeed()],
    );
    const errors = trackErrors(page);

    await page.goto("/admin.html");
    await expect(page.locator("#stat-enrollment")).toHaveText("2");
    await expect(page.locator("#stat-attendance")).toHaveText("50%");
    await expect(page.locator("#stat-atrisk")).toHaveText("1");
    await expect(page.locator("#atrisk-body")).toContainText("Ana García");

    expect(errors).toEqual([]);
    expect(writes).toEqual([]);
  });

  test("create-login is simulated in demo mode and never calls the backend", async ({
    page,
    context,
  }) => {
    const seeded = {
      ...consoleFix,
      teachers: [
        {
          id: 7,
          first_name: "Sofía",
          last_name: "Ramírez",
          email: "sofia@example.com",
          status: "active",
          auth_user_id: null,
        },
      ],
    };
    const writes = await routeSupabase(context, seeded);
    await context.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [`sb-${REF}-auth-token`, sessionSeed()],
    );
    const errors = trackErrors(page);

    await page.goto("/admin.html");
    await page.waitForFunction(() =>
      document.getElementById("admin-name")?.textContent?.includes("Gabriel"),
    );
    await page.click('.sidebar a[data-page="teachers"]');
    await expect(page.locator("#teachers-body")).toContainText("Sofía");

    await page.click('#teachers-body button[title="Create login"]');
    await expect(page.locator("#modal-field-email")).toHaveValue(
      "sofia@example.com",
    );
    await page.click("#modal-submit");
    // Row flips to reset-password (link reflected locally in demo).
    await expect(
      page.locator('#teachers-body button[title="Reset password"]'),
    ).toBeVisible();

    expect(errors).toEqual([]);
    expect(writes).toEqual([]);
  });

  test("generic CSV import handles teachers, grade levels and sections", async ({
    page,
    context,
  }) => {
    const seeded = {
      ...consoleFix,
      grade_levels: [{ id: 1, name: "7th Grade", numeric_level: 7 }],
      rooms: [{ id: 41, name: "Room 101", capacity: 30, type: "classroom" }],
      teachers: [
        {
          id: 7,
          first_name: "Sofía",
          last_name: "Ramírez",
          email: "sofia@x.com",
          status: "active",
        },
      ],
      classes: [],
    };
    const writes = await routeSupabase(context, seeded);
    await context.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [`sb-${REF}-auth-token`, sessionSeed()],
    );
    const errors = trackErrors(page);

    const runImport = async (btn, csv) => {
      await page.click(btn);
      await expect(page.locator("#import-overlay")).toHaveClass(/active/);
      await page.fill("#import-text", csv);
      await page.click("#import-footer .btn-primary"); // → mapping
      await expect(page.locator(".map-grid")).toBeVisible();
      await page.click("#import-footer .btn-primary"); // → preview
      await expect(page.locator(".import-summary")).toBeVisible();
      await page.click("#import-footer .btn-primary"); // → import
    };

    await page.goto("/admin.html");
    await page.waitForFunction(() =>
      document.getElementById("admin-name")?.textContent?.includes("Gabriel"),
    );

    // Teachers.
    await page.click('.sidebar a[data-page="teachers"]');
    await runImport(
      "#btn-import-teachers",
      "first_name,last_name,email\nMarco,López,marco@x.com",
    );
    await expect(page.locator("#teachers-body")).toContainText("Marco López");

    // Grade levels, then sections (grade by number, homeroom + room by name).
    await page.click('.sidebar a[data-page="gradessections"]');
    await runImport("#btn-import-grades", "numeric_level,name\n8,8th Grade");
    await expect(page.locator("#grades-body")).toContainText("8th Grade");

    await runImport(
      "#btn-import-sections",
      "grade,section,homeroom,room\n7,A,Sofía Ramírez,Room 101",
    );
    await expect(page.locator("#sections-body")).toContainText("7th Grade");
    await expect(page.locator("#sections-body")).toContainText("Sofía Ramírez");

    expect(errors).toEqual([]);
    expect(writes).toEqual([]);
  });
});
