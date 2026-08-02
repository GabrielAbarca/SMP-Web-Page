import { test, expect } from "@playwright/test";

/**
 * Privacy and terms pages.
 *
 * They are static and script-light on purpose, so these check the things that
 * actually break: that the pages are in the build at all (a missing
 * vite.config input silently 404s only in production), that both languages
 * are present and switchable, and that the app links to them.
 */

const PAGES = [
  { path: "/privacy.html", en: "Privacy policy", es: "Política de privacidad" },
  {
    path: "/terms.html",
    en: "Terms of service",
    es: "Términos del servicio",
  },
];

for (const page_ of PAGES) {
  test.describe(`${page_.path}`, () => {
    test("loads in English with the Spanish version hidden", async ({
      page,
    }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));

      await page.goto(page_.path);

      await expect(page.locator('section[data-legal-lang="en"]')).toBeVisible();
      await expect(page.locator('section[data-legal-lang="es"]')).toBeHidden();
      await expect(page.locator('section[data-legal-lang="en"] h1')).toHaveText(
        page_.en,
      );

      expect(errors).toEqual([]);
    });

    test("switches to Spanish and back", async ({ page }) => {
      await page.goto(page_.path);

      await page.click('[data-legal-set-lang="es"]');
      await expect(page.locator('section[data-legal-lang="es"]')).toBeVisible();
      await expect(page.locator('section[data-legal-lang="en"]')).toBeHidden();
      await expect(page.locator("html")).toHaveAttribute("lang", "es");
      await expect(page.locator('section[data-legal-lang="es"] h1')).toHaveText(
        page_.es,
      );

      await page.click('[data-legal-set-lang="en"]');
      await expect(page.locator('section[data-legal-lang="en"]')).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
    });

    test("states plainly that the records describe children", async ({
      page,
    }) => {
      await page.goto(page_.path);
      // Both documents must say what this system holds — that is the whole
      // reason a director reads them.
      await expect(page.locator('section[data-legal-lang="en"]')).toContainText(
        /child|student/i,
      );
    });
  });
}

test("the two pages link to each other and back to sign-in", async ({
  page,
}) => {
  await page.goto("/privacy.html");
  await page.click('.legal-footer a[href="/terms.html"]');
  await expect(page).toHaveURL(/\/terms\.html$/);

  await page.click('.legal-footer a[href="/privacy.html"]');
  await expect(page).toHaveURL(/\/privacy\.html$/);

  await page.click('.legal-footer a[href="/login.html"]');
  await expect(page).toHaveURL(/\/login\.html$/);
});

test("the login page links to both policies without signing in", async ({
  page,
}) => {
  await page.goto("/login.html");

  const privacy = page.locator('.auth-legal a[href="/privacy.html"]');
  const terms = page.locator('.auth-legal a[href="/terms.html"]');
  await expect(privacy).toBeVisible();
  await expect(terms).toBeVisible();

  await privacy.click();
  await expect(page).toHaveURL(/\/privacy\.html$/);
});
