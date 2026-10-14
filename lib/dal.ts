import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export type CurrentUser = { id: string; name: string; email: string; tokensUsed: number };

/**
 * Returns the signed-in user, or redirects to /login.
 * Verifies the JWT *and* that the user still exists in the database,
 * so use this (not the proxy) for real authorization checks.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, tokensUsed: true },
  });
  if (!user) redirect("/api/session/clear");

  return user;
});
