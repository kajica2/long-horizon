import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright smoke test — Long Horizon.
 *
 * Boots the live Next.js dev server on a free port and exercises the
 * canonical user path:
 *
 *   1. Landing loads, hero copy visible.
 *   2. Gallery loads with artwork tiles.
 *   3. Engine page loads for a known seed, runs for 5s, measures FPS.
 *   4. Shareable page renders the genome section.
 *
 * Fail thresholds:
 *   - FPS < 10 on desktop chromium after 5s => fail.
 *
 * Run with:  npm run smoke
 * CI only — not part of `npm test` (which is vitest unit tests).
 */

const PORT = Number(process.env.SMOKE_PORT ?? 4011);

export default defineConfig({
  testDir: "./tests/smoke",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "tmp/smoke-results.json" }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "off",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: `PORT=${PORT} npm run dev`,
    url: `http://127.0.0.1:${PORT}`,
    timeout: 120 * 1000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
  },
});