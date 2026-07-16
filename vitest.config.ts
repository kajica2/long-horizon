import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    // Tests share prisma/test.db (SQLite). Force SERIAL execution across
    // test files to avoid lock contention. fileParallelism: false is the
    // vitest 4 way (the older poolOptions.singleFork was removed).
    pool: "forks",
    fileParallelism: false,
    sequence: {
      hooks: "list",
      concurrent: false,
    },
    maxConcurrency: 1,
    // Default the DATABASE_URL so DB-touching tests work without an env
    // prefix. Override via real env var or .env if you need a different DB.
    env: {
      DATABASE_URL: "file:./dev.db",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
