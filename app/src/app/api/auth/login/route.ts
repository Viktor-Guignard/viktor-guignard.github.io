import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, checkSitePassword, createSessionCookieValue } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/elomty");

  if (!checkSitePassword(password)) {
    const url = new URL("/login", req.url);
    url.searchParams.set("error", "1");
    url.searchParams.set("next", next);
    return NextResponse.redirect(url, { status: 303 });
  }

  const value = await createSessionCookieValue();
  const res = NextResponse.redirect(new URL(next, req.url), { status: 303 });
  res.cookies.set(SESSION_COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
