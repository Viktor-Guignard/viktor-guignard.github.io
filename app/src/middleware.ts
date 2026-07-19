import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, isValidSessionCookieValue } from "@/lib/auth";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/auth/login).*)"],
};

export async function middleware(req: NextRequest) {
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (await isValidSessionCookieValue(cookie)) {
    return NextResponse.next();
  }
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}
