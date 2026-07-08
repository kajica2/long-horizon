import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    // Tests share a single SQLite file (prisma/test.db). Run test files
    // serially within a single worker to avoid lock contention.
    pool: "forks",
    // @ts-expect-error — poolOptions isn't in the public InlineConfig type
    // in vitest v4 but it does work at runtime (we use it to force singleFork
    // for SQLite safety).
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    sequence: {
      hooks: "list",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});