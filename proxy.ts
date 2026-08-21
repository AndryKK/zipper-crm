import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";
import { isPathAllowed } from "@/lib/roles";
import { verifyOrderDocToken } from "@/lib/doc-token";

const { auth } = NextAuth(authConfig);

// Order documents (receipt/invoice/waybill) opened from a Viber link (see
// app/(admin)/orders/[id]/viber-messages) carry their own ?token= instead
// of a session — this blanket API auth gate would otherwise 401 a customer
// before the route handler (which already knows how to check that token)
// ever runs.
const DOC_ROUTE = /^\/api\/orders\/(\d+)\/(receipt|invoice|waybill)$/;

export default auth(async (req) => {
  const isLoggedIn = !!req.auth;
  const isLoginPage = req.nextUrl.pathname === "/login";
  const isApiAuth = req.nextUrl.pathname.startsWith("/api/auth");
  const isWebhook = req.nextUrl.pathname.startsWith("/api/webhooks/");
  const isCron = req.nextUrl.pathname.startsWith("/api/cron/");
  const isApiRoute = req.nextUrl.pathname.startsWith("/api/");

  const docMatch = req.nextUrl.pathname.match(DOC_ROUTE);
  const isPublicDocLink = !isLoggedIn && !!docMatch &&
    await verifyOrderDocToken(parseInt(docMatch[1]), req.nextUrl.searchParams.get("token"));

  // Webhooks (e.g. Supabase Database Webhooks) and Vercel Cron invocations
  // never carry an admin session cookie — they authenticate via their own
  // shared-secret/Bearer header instead, checked inside the route handler.
  if (isApiAuth || isWebhook || isCron || isPublicDocLink) return NextResponse.next();
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
