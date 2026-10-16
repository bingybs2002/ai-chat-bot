import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { userRepository } from "@/lib/repositories/user-repository";
import { getSession } from "@/lib/session";

export type CurrentUser = { id: string; name: string; email: string };

/**
 * Returns the signed-in user, or null. Verifies the JWT *and* that the user still exists
 * in the database. Use this in route handlers and server actions, which can't redirect.
 */
export const getUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;
  return userRepository.findById(session.userId);
});

/**
 * Returns the signed-in user, or redirects to /login. Use this (not the proxy) for real
 * authorization checks in pages and layouts.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await getUser();
  if (!user) redirect("/api/session/clear");

  return user;
});
