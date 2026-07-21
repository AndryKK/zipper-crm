import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isLoginPage = req.nextUrl.pathname === "/login";
  const isApiAuth = req.nextUrl.pathname.startsWith("/api/auth");
  const isWebhook = req.nextUrl.pathname.startsWith("/api/webhooks/");
  const isCron = req.nextUrl.pathname.startsWith("/api/cron/");
  const isApiRoute = req.nextUrl.pathname.startsWith("/api/");

  // Webhooks (e.g. Supabase Database Webhooks) and Vercel Cron invocations
  // never carry an admin session cookie — they authenticate via their own
  // shared-secret/Bearer header instead, checked inside the route handler.
  if (isApiAuth || isWebhook || isCron) return NextResponse.next();
  if (isApiRoute && !isLoggedIn) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isLoggedIn && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }
  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads|img).*)"],
};
