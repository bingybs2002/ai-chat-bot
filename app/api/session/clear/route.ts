import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

// Clears a session whose JWT is valid but whose user no longer exists,
// then sends the browser to /login (avoids a proxy redirect loop).
export function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.nextUrl));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
