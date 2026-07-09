/**
 * Perf baseline — FPS + frame budget across all 8 living systems.
 *
 * Boots a Next.js dev server, launches headless Chromium via Playwright, and
 * for each of the 8 living systems:
 *   1. Navigates to /engine/<seed-id> for a known DB-seeded artwork
 *   2. Waits 3s for the engine to mount (matches tests/smoke/engines.spec.ts)
 *   3. Counts requestAnimationFrame ticks over a 10s window using high-res
 *      performance.now() deltas
 *   4. Records average FPS, max/min frame time, and dropped-frame count
 *      (frame > 33ms = dropped, i.e. below 30fps)
 *
 * Reports go to:
 *   - stdout           (machine-readable summary table)
 *   - out/perf-baseline/summary.md (committed-markdown summary)
 *
 * Caveats:
 *   - Headless Chromium uses SwiftShader, so we're measuring a software-GPU
 *     floor, not real production GPU performance. Numbers are a baseline
 *     floor for CI; production browsers with a real GPU should be 2-10x higher
 *     for GPU-bound systems (cosmicFilaments, lorenzAttractor, physarum).
 *   - reactionDiffusion runs the Gray-Scott step on the CPU per frame,
 *     so it's the most realistic on this runner.
 *
 * Run:  DATABASE_URL="file:./prisma/dev.db" npx tsx scripts/perf-baseline.ts
 */

import { chromium, type Page, type Browser } from "playwright";
import { spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import http from "node:http";

// ============================================================
// Seed mapping (one artwork per living system)
// ============================================================

type SystemTarget = {
  system: string;
  seedId: string;
  notes?: string;
};

const TARGETS: SystemTarget[] = [
  {
    system: "flowFieldMeditation",
    seedId: "demo-driftwav",
  },
  {
    system: "cosmicFilaments",
    seedId: "planetary-jul2026",
  },
  {
    system: "sandTraveler",
    seedId: "sand-tarbell-port",
  },
  {
    system: "deJongAttractor",
    seedId: "dejong-bourke",
  },
  {
    system: "birthChart",
    seedId: "birth-kepler",
    notes: "Kepler's chart: 1571-05-16 Weil der Stadt",
  },
  {
    system: "reactionDiffusion",
    seedId: "rd-mitosis",
  },
  {
    system: "lorenzAttractor",
    seedId: "lorenz-butterfly",
  },
  {
    system: "physarum",
    seedId: "physarum-network",
  },
];

// ============================================================
// Dev server lifecycle
// ============================================================

const PORT = Number(process.env.PERF_PORT ?? 4012);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const MEASURE_MS = 10_000;
const BOOT_WAIT_MS = 3_000;
const SERVER_BOOT_TIMEOUT_MS = 90_000;

async function isServerReady(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise<boolean>((resolve) => {
      const req = http.get(url, { host: "127.0.0.1", port: PORT, path: "/" }, (res) => {
        res.resume();
        resolve(res.statusCode !== undefined && res.statusCode < 500);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(3000, () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function startDevServer(): Promise<ChildProcess> {
  const env = {
    ...process.env,
    PORT: String(PORT),
    DATABASE_URL: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  };
  // Use `next dev` directly (no npm wrapper) so the child process can stream
  // stdout/stderr without buffering — npm piping is known to wedge when the
  // parent doesn't drain. We're going to discard everything except the "Ready"
  // line anyway.
  process.stderr.write(`[perf] spawning npx next dev -p ${PORT}\n`);
  const child = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    env,
    cwd: process.cwd(),
    stdio: ["ignore", "ignore", "ignore"],
    detached: false,
  });
  child.on("exit", (code, signal) => {
    process.stderr.write(`[perf] dev server exited code=${code} signal=${signal}\n`);
  });
  child.on("error", (err) => {
    process.stderr.write(`[perf] dev server spawn error: ${err.message}\n`);
  });
  return child;
}

async function stopDevServer(child: ChildProcess): Promise<void> {
  if (child.killed) return;
  return new Promise((resolve) => {
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
    setTimeout(() => {
      if (!child.killed) child.kill("SIGKILL");
      resolve();
    }, 5_000);
  });
}

// ============================================================
// In-page FPS measurement via requestAnimationFrame
// ============================================================

type FpsWindow = {
  frames: number;
  totalMs: number;
  maxFrameMs: number;
  minFrameMs: number;
  droppedFrames: number; // frame delta > 33ms
};

/**
 * The page-side measurement. Runs in the browser. We count `requestAnimationFrame`
 * ticks and record the delta between consecutive callbacks using
 * performance.now() at ms precision.
 *
 * We also probe `useEngineStore.getState()` via the global window to confirm
 * which system actually booted for the target seed — the seed id can theoretically
 * fall back to a synthetic seed if the artwork doesn't exist in the DB.
 *
 * NOTE: We pass the body to `page.evaluate` as a string (compiled via the
 * Function constructor) because Playwright serializes arrow function bodies
 * through esbuild's `__name` annotation when run under tsx, which fails in
 * browsers since `__name` is a Node-only helper.
 */
/**
 * Body of `window.__measureFps` — installed into every new page as plain JS
 * via `addInitScript`. We avoid passing any function value through
 * `page.evaluate` because tsx/esbuild's `--keep-names` mangles named arrow /
 * function expressions with an `__name(...)` call that fails in browsers.
 *
 * Self-contained ES5: no template literals, no arrow functions, no const/let.
 */
/**
 * Initialize the page: install a small store-probe hook. The engine store
 * itself isn't currently exposed to `window` (we don't modify app source),
 * so we read the booted system name from a `<meta name="x-engine-system">`
 * tag in the live page IF it shows up; otherwise we fall back to the seed
 * id which corresponds 1:1 to a system (see TARGETS).
 */
const PROBE_STORE_BODY = `(function(){
  window.__probeEngineSystem = function probeEngineSystem() {
    return new Promise(function(resolve) {
      var start = Date.now();
      function tick() {
        var m = document.querySelector('meta[name="x-engine-system"]');
        if (m && m.content) { resolve(m.content); return; }
        if (Date.now() - start > 4000) { resolve(null); return; }
        setTimeout(tick, 200);
      }
      tick();
    });
  };
})();
`;

const MEASURE_FPS_BODY = `(function(){
  window.__measureFps = function measureFps(durationMs) {
    return new Promise(function(resolve) {
      var frames = 0;
      var totalDelta = 0;
      var maxDelta = 0;
      var minDelta = Number.POSITIVE_INFINITY;
      var dropped = 0;
      var prev = performance.now();
      var start = prev;
      function tick(now) {
        var delta = now - prev;
        if (frames > 0) {
          totalDelta += delta;
          if (delta > maxDelta) maxDelta = delta;
          if (delta < minDelta) minDelta = delta;
          if (delta > 33) dropped++;
        }
        frames++;
        prev = now;
        if (now - start < durationMs) {
          requestAnimationFrame(tick);
          return;
        }
        var bootedSystem = null;
        try {
          var m = document.querySelector('meta[name="x-engine-system"]');
          if (m && m.content) bootedSystem = m.content;
        } catch (_e) {
          bootedSystem = null;
        }
        resolve({
          frames: frames,
          totalMs: totalDelta,
          maxFrameMs: maxDelta,
          minFrameMs: minDelta === Number.POSITIVE_INFINITY ? 0 : minDelta,
          droppedFrames: dropped,
          bootedSystem: bootedSystem
        });
      }
      requestAnimationFrame(tick);
    });
  };
  window.__startMeasure = function startMeasure(ms) {
    if (typeof window.__measureFps !== 'function') {
      window.__perfResult = { __error: '__measureFps missing on window' };
      return;
    }
    window.__perfResult = null;
    window.__perfError = undefined;
    window.__measureFps(ms).then(function(r) {
      window.__perfResult = r;
    }, function(e) {
      window.__perfError = String((e && e.message) || e);
      window.__perfResult = { __error: window.__perfError };
    });
  };
})();
`;

/**
 * Run the measurement. We invoke `window.__measureFps` (installed by
 * `addInitScript` on the page) using only string-form `page.evaluate` calls
 * so Playwright never serializes a Node-shaped function for the browser —
 * tsx/esbuild's `--keep-names` would otherwise wrap it in an `__name(...)`
 * helper that doesn't exist in browsers.
 */
async function measureFps(page: Page): Promise<FpsWindow & { bootedSystem: string | null }> {
  // Kick off the measurement on the page. The MEASURE_MS is inlined into
  // the script string so we never pass any function values through evaluate.
  await page.evaluate(
    `window.__startMeasure(${String(MEASURE_MS)})`,
  );

  // Poll for completion (the helper installs the result on window).
  await page.waitForFunction(
    "window.__perfResult != null",
    undefined,
    { polling: 200, timeout: MEASURE_MS + 60_000 },
  );

  const result = await page.evaluate("window.__perfResult");
  return result as FpsWindow & { bootedSystem: string | null };
}

// ============================================================
// Per-system probe
// ============================================================

type Measurement = SystemTarget & {
  fps: number;
  frames: number;
  maxFrameMs: number;
  minFrameMs: number;
  avgFrameMs: number;
  droppedFrames: number;
  bootedSystem: string | null;
  status: "ok" | "error";
  error?: string;
};

async function probeSystem(browser: Browser, target: SystemTarget): Promise<Measurement> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });
  // Install the FPS-measurement helper + engine-store probe on every page
  // in this context before any navigation. Bodies are plain ES5 — no
  // `__name` mangling.
  await context.addInitScript({ content: MEASURE_FPS_BODY });
  await context.addInitScript({ content: PROBE_STORE_BODY });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  try {
    const url = `${BASE_URL}/engine/${target.seedId}`;
    const res = await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    if (!res || !res.ok()) {
      return baseResult(target, "error", `HTTP ${res?.status() ?? "no response"}`);
    }
    // Match the smoke test's 3s boot wait
    await page.waitForTimeout(BOOT_WAIT_MS);

    const measured = await measureFps(page);
    const realErrors = errors.filter(
      (e) => !/webgl|swiftshader|three\.js|hardware/i.test(e),
    );

    if (!measured || typeof measured !== "object") {
      return baseResult(target, "error", `measureFps returned ${String(measured)}`);
    }

    const measuredFrames = measured.frames - 1; // exclude the first delta
    const avgFrameMs = measuredFrames > 0 ? measured.totalMs / measuredFrames : 0;
    const observedMs = Math.max(avgFrameMs * measuredFrames, 1);
    const fps = (measuredFrames / observedMs) * 1000;

    return {
      ...target,
      fps: Number.isFinite(fps) ? Number(fps.toFixed(2)) : 0,
      frames: measuredFrames,
      maxFrameMs: Number(measured.maxFrameMs.toFixed(2)),
      minFrameMs: Number(measured.minFrameMs.toFixed(2)),
      avgFrameMs: Number(avgFrameMs.toFixed(2)),
      droppedFrames: measured.droppedFrames,
      bootedSystem: measured.bootedSystem,
      status: realErrors.length > 0 ? "error" : "ok",
      error: realErrors.length > 0 ? realErrors.join("; ") : undefined,
    };
  } catch (err) {
    return baseResult(target, "error", err instanceof Error ? err.message : String(err));
  } finally {
    await context.close();
  }
}

function baseResult(
  target: SystemTarget,
  status: "ok" | "error",
  error?: string,
): Measurement {
  return {
    ...target,
    fps: 0,
    frames: 0,
    maxFrameMs: 0,
    minFrameMs: 0,
    avgFrameMs: 0,
    droppedFrames: 0,
    bootedSystem: null,
    status,
    error,
  };
}

// ============================================================
// Reporting
// ============================================================

function tableReport(rows: Measurement[]): string {
  const header =
    "| System | Seed | FPS | Frames | Avg ms | Max ms | Min ms | Dropped | Status |";
  const sep =
    "|---|---|---:|---:|---:|---:|---:|---:|---|";
  const body = rows
    .map((r) => {
      const status = r.status === "ok" ? "ok" : `fail (${r.error ?? "unknown"})`;
      return `| ${r.system} | ${r.seedId} | ${r.fps.toFixed(2)} | ${r.frames} | ${r.avgFrameMs.toFixed(2)} | ${r.maxFrameMs.toFixed(2)} | ${r.minFrameMs.toFixed(2)} | ${r.droppedFrames} | ${status} |`;
    })
    .join("\n");
  return `${header}\n${sep}\n${body}\n`;
}

async function writeSummary(outDir: string, rows: Measurement[]): Promise<void> {
  await fs.mkdir(outDir, { recursive: true });
  const summaryPath = path.join(outDir, "summary.md");
  const okRows = rows.filter((r) => r.status === "ok");
  const meanFps =
    okRows.length > 0
      ? okRows.reduce((s, r) => s + r.fps, 0) / okRows.length
      : 0;
  const medianFps = computeMedian(okRows.map((r) => r.fps));
  const minFps = okRows.length > 0 ? Math.min(...okRows.map((r) => r.fps)) : 0;
  const maxFps = okRows.length > 0 ? Math.max(...okRows.map((r) => r.fps)) : 0;

  const body = `# Perf baseline — ${new Date().toISOString()}

Headless Chromium under SwiftShader. Each engine boots on the seed id below,
runs for ${BOOT_WAIT_MS / 1000}s, then is sampled over ${MEASURE_MS / 1000}s of
\`requestAnimationFrame\` ticks.

## Caveats
- Headless Chromium uses SwiftShader (software GL). This is a **floor**, not
  a ceiling. Real GPU-equipped browsers should report 2-10x higher FPS for
  GPU-bound systems (cosmicFilaments, lorenzAttractor, physarum).
- \`reactionDiffusion\` runs the Gray-Scott solver CPU-side, so its numbers
  are the closest to a real machine.
- Frame counts are taken from the **second** sample onward — the first
  sample is ignored because its delta is the boot-wait window.

## Summary
- Systems measured: ${rows.length}
- Systems healthy: ${okRows.length}
- Systems failed: ${rows.length - okRows.length}
- Mean FPS (healthy only): ${meanFps.toFixed(2)}
- Median FPS (healthy only): ${medianFps.toFixed(2)}
- Min FPS (healthy only): ${minFps.toFixed(2)}
- Max FPS (healthy only): ${maxFps.toFixed(2)}

## Table

${tableReport(rows)}

## Per-system notes

${rows
  .map(
    (r) =>
      `- **${r.system}** (\`${r.seedId}\`)${r.notes ? ` — ${r.notes}` : ""}: ${
        r.status === "ok"
          ? `${r.fps.toFixed(2)} fps avg, max frame ${r.maxFrameMs.toFixed(0)}ms, ${r.droppedFrames} dropped frames`
          : `FAILED — ${r.error ?? "unknown error"}`
      }${
        r.bootedSystem && r.bootedSystem !== r.system
          ? ` (page reported system=\`${r.bootedSystem}\`)`
          : ""
      }`,
  )
  .join("\n")}
`;
  await fs.writeFile(summaryPath, body, "utf8");
}

function computeMedian(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<{ rows: Measurement[] }> {
  const server = await startDevServer();
  let cleaned = false;
  const cleanup = async (): Promise<void> => {
    if (cleaned) return;
    cleaned = true;
    await stopDevServer(server);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  try {
    const ready = await isServerReady(BASE_URL, SERVER_BOOT_TIMEOUT_MS);
    if (!ready) {
      throw new Error(`dev server did not become ready on ${BASE_URL}`);
    }
    console.log(`[perf] dev server ready on ${BASE_URL}`);

    const browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-gpu-sandbox",
        "--enable-features=Vulkan,UseSkiaRenderer",
        "--use-gl=swiftshader",
      ],
    });

    const rows: Measurement[] = [];
    for (const target of TARGETS) {
      console.log(`[perf] probing ${target.system} (${target.seedId})…`);
      const row = await probeSystem(browser, target);
      rows.push(row);
      console.log(
        `          fps=${row.fps.toFixed(2)} frames=${row.frames} ` +
          `avg=${row.avgFrameMs.toFixed(1)}ms max=${row.maxFrameMs.toFixed(1)}ms ` +
          `dropped=${row.droppedFrames} status=${row.status}`,
      );
    }

    await browser.close();

    const outDir = path.resolve("out/perf-baseline");
    await writeSummary(outDir, rows);

    console.log("\n========================================");
    console.log("Perf baseline summary");
    console.log("========================================");
    console.log(tableReport(rows));

    return { rows };
  } finally {
    await cleanup();
  }
}

// ============================================================
// Entry — only run when invoked directly (importable for tests)
// ============================================================

const isDirectInvocation =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("perf-baseline.ts") === true;

if (isDirectInvocation) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}

export { main, probeSystem, TARGETS, type Measurement, type SystemTarget };
