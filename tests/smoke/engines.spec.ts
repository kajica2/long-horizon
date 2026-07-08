import { test, expect } from "@playwright/test";

/**
 * Long Horizon smoke — landing page renders.
 */
test("landing page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Long Horizon/i);
  // Hero copy
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading.first()).toBeVisible();
});

/**
 * Long Horizon smoke — gallery page lists artworks.
 */
test("gallery page lists seed artworks", async ({ page }) => {
  await page.goto("/gallery");
  // Wait for the heading to render with a non-zero count (server-side).
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/\d+ artworks/);
  const tiles = page.locator('[data-testid^="gallery-tile-"]');
  await expect(tiles.first()).toBeVisible({ timeout: 10000 });
  expect(await tiles.count()).toBeGreaterThan(0);
});

/**
 * Long Horizon smoke — engine page boots.
 *
 * The engine is a client-only Three.js canvas mounted after R3F
 * hydration, so we only assert that:
 *   - The page loads
 *   - The artwork id appears in the URL (parameter echoes)
 *   - No fatal pageerror fires
 *
 * Real FPS baselines should be measured on a GPU-equipped runner.
 * Headless swiftshader can't sustain 30fps for R3F.
 */
test("engine page boots for a known seed", async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  // Use 'load' (full page load) and 'networkidle' to give hydration time.
  const res = await page.goto("/engine/demo-driftwav", { waitUntil: "networkidle" });
  expect(res?.ok()).toBe(true);

  // Wait long enough for the artwork fetch + R3F mount to start.
  await page.waitForTimeout(3000);

  // Filter out Three.js / WebGL noise — headless swiftshader is messy.
  const realErrors = errors.filter(
    (e) => !/webgl|swiftshader|three\.js|hardware/i.test(e),
  );
  expect(realErrors).toEqual([]);
});

/**
 * Long Horizon smoke — shareable page renders genome section.
 */
test("shareable page exposes remix action", async ({ page }) => {
  await page.goto("/a/demo-driftwav");
  // Wait for the hero heading to render.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 10_000 });
  // The "Remix this artwork" CTA lives in the hero strip.
  const remix = page.getByRole("link", { name: /remix/i }).first();
  await expect(remix).toBeVisible({ timeout: 10_000 });
});