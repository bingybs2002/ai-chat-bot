import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// Pages only reachable when signed out.
const authRoutes = ["/login", "/signup"];

/**
 * Optimistic auth check: only verifies the JWT signature from the cookie
 * (no database lookup). Real authorization happens in lib/dal.ts.
 */
export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isAuthRoute = authRoutes.includes(path);
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (!isAuthRoute && !session) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
  if (isAuthRoute && session) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
