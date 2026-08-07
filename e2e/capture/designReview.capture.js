// Design-review captures — a screenshot run, not a test.
//
// Reuses the e2e harness verbatim (session seeding + the mocked Supabase
// origin from e2e/fixtures.js) so every capture is authenticated and the app
// runs against the same data shape the suite uses, only with richer rows
// (e2e/capture/designFixtures.js).
//
// Run it with its own config so `npm run test:e2e` and CI stay untouched:
//   npx playwright test --config playwright.capture.config.js
//
// Output: design-review/*.png, full-page, no device frames or annotations.

import path from "node:path";
import { test, expect } from "@playwright/test";
import { REF, studentFix, routeSupabase, sessionSeed } from "../fixtures.js";
import {
  adminPopulatedFix,
  adminEmptyFix,
  teacherPopulatedFix,
} from "./designFixtures.js";

const OUT = path.resolve(process.cwd(), "design-review");

/** Same session seed the suite uses — every capture is signed in. */
async function seedSession(context) {
  await context.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [`sb-${REF}-auth-token`, sessionSeed()],
  );
}

/**
 * Settle the page before the shutter: network quiet, fonts loaded, no
 * skeleton placeholders left, and one frame for any transition to land.
 */
async function settle(page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  // Only what's on screen: every page keeps skeleton markup inside its
  // inactive sections, and those never resolve until that section is opened.
  await expect(
    page.locator(".skeleton:visible, .skeleton-line:visible"),
  ).toHaveCount(0);
  await page.waitForTimeout(400);
}

/**
 * Full-page by default. `fullPage: false` is for the modal capture only: the
 * overlay is position:fixed, and a full-page shot stretches the canvas to the
 * scroll height of the table behind it, which clips the dialog's own footer
 * off the bottom. Viewport-sized is what the modal actually looks like.
 */
async function shoot(page, name, { fullPage = true } = {}) {
  await settle(page);
  await page.screenshot({ path: path.join(OUT, name), fullPage });
}

test.describe("desktop captures", () => {
  test("01 — login", async ({ page, context }) => {
    await routeSupabase(context, {});
    await page.goto("/login.html");
    await page.waitForSelector("#auth-form", { state: "visible" });
    await shoot(page, "01-login.png");
  });

  test("02 — admin dashboard, populated", async ({ page, context }) => {
    await routeSupabase(context, adminPopulatedFix);
    await seedSession(context);

    await page.goto("/admin.html");
    // Stat cards start at "—"; wait for the real counts.
    await expect(page.locator("#stat-enrollment")).not.toHaveText("—");
    await expect(page.locator("#stat-teachers")).not.toHaveText("—");
    await expect(page.locator("#overview-year-text")).toContainText(
      "2025-2026",
    );
    await shoot(page, "02-admin-dashboard.png");
  });

  test("03 — admin students list, populated", async ({ page, context }) => {
    await routeSupabase(context, adminPopulatedFix);
    await seedSession(context);

    await page.goto("/admin.html");
    await expect(page.locator("#stat-enrollment")).not.toHaveText("—");
    await page.click('.sidebar a[data-page="students"]');
    // The whole roster, not a loading/empty placeholder row.
    await expect(page.locator("#students-body tr")).toHaveCount(14);
    await shoot(page, "03-admin-students-list.png");
  });

  test("04 — Add student modal with inline validation errors", async ({
    page,
    context,
  }) => {
    await routeSupabase(context, adminPopulatedFix);
    await seedSession(context);

    await page.goto("/admin.html");
    await expect(page.locator("#stat-enrollment")).not.toHaveText("—");
    await page.click('.sidebar a[data-page="students"]');
    await expect(page.locator("#students-body tr")).not.toHaveCount(0);

    await page.click("#btn-add-student");
    await expect(page.locator("#modal-overlay")).toBeVisible();

    // Invalid input on purpose: required names left blank, and a malformed
    // email/phone so more than one kind of rule is on screen at once.
    await page.fill('#modal-form [name="email"]', "ana.garcia(at)example");
    await page.fill('#modal-form [name="phone"]', "call me");
    await page.click("#modal-submit");

    await expect(
      page.locator("#modal-form .field-error").first(),
    ).toBeVisible();
    // Submitting scrolls the first invalid field into view, which nudges the
    // dialog's own header out of frame. Reset it so the modal is shown whole
    // from its title down — the errors sit at the top either way.
    await page
      .locator("#modal-overlay .modal")
      .evaluate((el) => (el.scrollTop = 0));
    await shoot(page, "04-admin-modal-error.png", { fullPage: false });
  });

  test("05 — teacher gradebook", async ({ page, context }) => {
    await routeSupabase(context, teacherPopulatedFix);
    await seedSession(context);

    await page.goto("/teacher.html");
    await page.click('.sidebar a[data-page="myclasses"]');
    await page.click(".myclasses-grid .class-card");
    await page.click('.class-subtab[data-tab="gradebook"]');
    await expect(page.locator(".gradebook-table tbody tr")).not.toHaveCount(0);
    await shoot(page, "05-teacher-gradebook.png");
  });

  test("06 — admin dashboard, brand new school", async ({ page, context }) => {
    await routeSupabase(context, adminEmptyFix);
    await seedSession(context);

    await page.goto("/admin.html");
    await expect(page.locator("#stat-enrollment")).toHaveText("0");
    await expect(page.locator("#overview-year-text")).not.toHaveText("");
    await shoot(page, "06-admin-dashboard-empty.png");
  });
});

test.describe("mobile captures", () => {
  test("07 — student portal", async ({ page, context }) => {
    await routeSupabase(context, studentFix);
    await seedSession(context);

    await page.goto("/");
    await expect(page.locator("#welcome-name")).toContainText("Ana");
    await shoot(page, "07-student-portal-mobile.png");
  });
});
