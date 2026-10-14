import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type SessionPayload = { userId: string };

function getKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function signSession(userId: string, expiresAt: Date) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(getKey());
}

export async function verifySessionToken(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getKey(), { algorithms: ["HS256"] });
    return payload.sub ? { userId: payload.sub } : null;
  } catch {
    return null;
  }
}

export async function createSession(userId: string) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const token = await signSession(userId, expiresAt);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession() {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}
