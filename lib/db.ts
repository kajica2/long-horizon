import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton.
 * Standard Next.js pattern — avoids exhausting connection pool during
 * dev hot reload by reusing the same instance on globalThis.
 *
 * Path-resolution note (gotcha):
 *   The Prisma CLI (`migrate`, `studio`) resolves `file:./...` SQLite
 *   URLs relative to the schema location (prisma/schema.prisma).
 *   The Prisma CLIENT at runtime resolves them relative to process.cwd().
 *   To make both work with the same URL, use `file:./dev.db` AND run
 *   from the project root. Running `migrate deploy` from a subdir or
 *   with a `file:./prisma/...` URL will silently create files at
 *   `prisma/prisma/...` paths that nothing else can open.
 *
 * Defensive check: if DATABASE_URL is "file:./prisma/..." at runtime
 * (i.e. someone is using the wrong convention), fail loud rather than
 * letting SQLite CANTOPEN. Helps catch the bug early.
 */

function checkDbUrl() {
  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("file:./prisma/")) {
    // Old convention that resolves to prisma/prisma/X for both CLI and
    // runtime. Loud-fail so this can't silently corrupt another file.
    throw new Error(
      `DATABASE_URL uses the old "file:./prisma/..." convention. ` +
        `Use "file:./dev.db" or "file:./test.db" instead. Got: ${url}`,
    );
  }
  if (url.startsWith("file:./prisma")) {
    // Catches the bare "file:./prisma" case (no trailing /...).
    throw new Error(
      `DATABASE_URL is "file:./prisma" which resolves wrong. ` +
        `Use "file:./dev.db" or "file:./test.db" instead. Got: ${url}`,
    );
  }
}

if (process.env.NODE_ENV !== "test") {
  // Skip the guard in vitest because vitest.config sets file:./dev.db.
  checkDbUrl();
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}