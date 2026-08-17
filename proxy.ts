import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";
import { isPathAllowed } from "@/lib/roles";

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

  // Role-based access — see lib/roles.ts for what each role can reach.
  // superadmin (and "/" for every role) always passes; a restricted role
  // hitting a page outside its allowed set is bounced to the dashboard,
  // hitting an API outside it gets a 403 instead of leaking data via a
  // direct fetch to a route its own UI never shows it.
  if (isLoggedIn) {
    const role = (req.auth?.user as { role?: string } | undefined)?.role;
    if (!isPathAllowed(role, req.nextUrl.pathname)) {
      if (isApiRoute) {
        return NextResponse.json({ error: "Доступ заборонено для цієї ролі" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/", req.nextUrl.origin));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads|img).*)"],
};
