import { test, expect } from "@playwright/test";
import {
  REF,
  studentFix,
  teacherFix,
  consoleFix,
  routeSupabase,
  sessionSeed,
} from "./fixtures.js";

async function noOverflow(page) {
  const scrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  return scrollWidth <= page.viewportSize().width;
}

async function seedSession(context) {
  await context.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [`sb-${REF}-auth-token`, sessionSeed()],
  );
}

test.describe("mobile — student portal", () => {
  test("fits the viewport and the nav drawer opens and closes", async ({
    page,
    context,
  }) => {
    await routeSupabase(context, studentFix);
    await seedSession(context);

    await page.goto("/");
    await page.waitForFunction(
      () =>
        document.getElementById("welcome-name")?.textContent?.includes("Ana"),
      { timeout: 10_000 },
    );
    expect(await noOverflow(page)).toBe(true);

    await page.click("#menu-btn");
    await expect(page.locator(".container > aside")).toBeVisible();
    const logout = page.locator("#logout-btn");
    await logout.scrollIntoViewIfNeeded();
    await expect(logout).toBeVisible();

    await page.click("#close-btn");
    await expect(page.locator(".container > aside")).toBeHidden();
    expect(await noOverflow(page)).toBe(true);
  });
});

test.describe("mobile — teacher console", () => {
  test("fits the viewport and drawer navigation closes the menu", async ({
    page,
    context,
  }) => {
    await routeSupabase(context, teacherFix);
    await seedSession(context);

    await page.goto("/teacher.html");
    await page.waitForFunction(
      () =>
        document.getElementById("teacher-name")?.textContent?.includes("Sofía"),
      { timeout: 10_000 },
    );
    expect(await noOverflow(page)).toBe(true);

    await page.click("#menu-btn");
    await expect(page.locator(".container > aside")).toBeVisible();
    await page.click('.container > aside a[data-page="myclasses"]');
    await expect(page.locator(".container > aside")).toBeHidden();

    await page.waitForSelector(".myclasses-grid");
    expect(await noOverflow(page)).toBe(true);
  });
});

test.describe("mobile — admin console", () => {
  test("fits the viewport and drawer navigation closes the menu", async ({
    page,
    context,
  }) => {
    await routeSupabase(context, consoleFix);
    await seedSession(context);

    await page.goto("/admin.html");
    await page.waitForFunction(
      () =>
        document.getElementById("admin-name")?.textContent?.includes("Gabriel"),
      { timeout: 10_000 },
    );
    expect(await noOverflow(page)).toBe(true);

    await page.click("#menu-btn");
    await expect(page.locator(".container > aside")).toBeVisible();
    await page.click('.container > aside a[data-page="students"]');
    await expect(page.locator(".container > aside")).toBeHidden();

    await expect(page.locator("#view-students")).toHaveClass(/active/);
    expect(await noOverflow(page)).toBe(true);
  });
});
