import "server-only";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";

/** Runs repository writes atomically. Pass the un-awaited calls, e.g. `inTransaction([a.x(), b.y()])`. */
export function inTransaction(operations: Prisma.PrismaPromise<unknown>[]) {
  return prisma.$transaction(operations);
}
