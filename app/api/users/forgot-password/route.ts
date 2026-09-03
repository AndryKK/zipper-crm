import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { supabaseServer } from "@/lib/supabase";
import { sendEmail, isValidEmail } from "@/lib/email";
import { renderNewPasswordEmail } from "@/lib/email-templates";

// Public, unauthenticated — storefront "Забули пароль?" button (see
// proxy.ts's isForgotPasswordRoute bypass; this path must stay in sync
// with that). Accepts an email, and if a `users` row's login matches it
// (login IS the customer's email on this storefront — see
// lib/guest-checkout.ts's own doc comment for the same fact), generates a
// brand-new random password, saves its hash, and emails the plaintext
// password to that address. The account's REAL existing password can
// never be recovered — it's bcrypt-hashed (one-way) — so "send me my
// password" can only ever mean "give me a fresh one"; this mirrors what
// the legacy PHP site's own recovery flow does (includes/metadata.php),
// just collapsed to one step instead of its request-a-link-then-reset
// two-step flow, per explicit request.
//
// Responds with the same generic message whether or not the email was
// found (never reveals which emails are registered) as long as nothing
// goes wrong — a DB/send failure after a real account IS found still
// surfaces its own distinct error below, since claiming success there
// would be actively misleading (nothing was actually sent).
const GENERIC_MESSAGE = "Якщо такий email зареєстрований, на нього надіслано новий пароль.";

// Best-effort in-memory rate limiting — this is a public, unauthenticated
// endpoint that mutates a real account's password, so it needs SOME
// abuse guard even though nothing fancier (Redis/Upstash) is wired up in
// this project yet. Resets on a cold start and doesn't share state across
// server instances — not a hard guarantee, but it meaningfully raises the
// bar against casual scripted abuse, which is what actually matters here.
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_PER_KEY = 3;
const rateLimitHits = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const hits = (rateLimitHits.get(key) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  rateLimitHits.set(key, hits);
  // Cheap unbounded-growth guard — trims stale keys out whenever the map
  // gets large, instead of a separate timer/cron for a low-traffic route.
  if (rateLimitHits.size > 5000) {
    for (const [k, times] of rateLimitHits) {
      if (!times.some((t) => now - t < RATE_LIMIT_WINDOW_MS)) rateLimitHits.delete(k);
    }
  }
  return hits.length > RATE_LIMIT_MAX_PER_KEY;
}

const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; // no 0/O/1/l/I ambiguity
function generatePassword(length = 10): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += PASSWORD_CHARS[bytes[i] % PASSWORD_CHARS.length];
  return out;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Вкажіть коректний email" }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(`ip:${ip}`) || isRateLimited(`email:${email}`)) {
    return NextResponse.json({ error: "Забагато запитів. Спробуйте пізніше." }, { status: 429 });
  }

  const { data: user } = await supabaseServer
    .from("users")
    .select("id, login")
    .eq("login", email)
    .maybeSingle();

  if (user) {
    const newPassword = generatePassword();
    const hash = await bcrypt.hash(newPassword, 10);
    const { error: updErr } = await supabaseServer.from("users").update({ password: hash }).eq("id", user.id);

    if (updErr) {
      // A real account exists but the update failed — surface this
      // distinctly rather than silently claiming success (nothing was
      // actually sent, so a generic "ok" would be actively misleading).
      return NextResponse.json({ error: "Не вдалося оновити пароль. Спробуйте пізніше." }, { status: 500 });
    }

    const { subject, html } = renderNewPasswordEmail(user.login, newPassword);
    const result = await sendEmail({ to: user.login, subject, html });
    if (!result.ok) {
      return NextResponse.json({ error: "Не вдалося надіслати лист. Спробуйте пізніше." }, { status: 500 });
    }
  }

  return NextResponse.json({ message: GENERIC_MESSAGE });
}
