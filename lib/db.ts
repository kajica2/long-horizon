import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton.
 * Standard Next.js pattern — avoids exhausting connection pool during
 * dev hot reload by reusing the same instance on globalThis.
 */
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