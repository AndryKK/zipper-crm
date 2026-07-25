import { supabaseServer } from "@/lib/supabase";

export type EmailAttachment = { name: string; content: string /* base64 */ };

export type EmailResult = { ok: true } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string | null | undefined): value is string {
  return !!value && EMAIL_RE.test(value.trim());
}

async function getSender(): Promise<{ name: string; email: string }> {
  const { data } = await supabaseServer
    .from("settings").select("value, text")
    .in("value", ["email_sender_name", "email_sender_email"]);
  const s: Record<string, string> = {};
  for (const row of data ?? []) s[row.value] = row.text;
  return {
    name: (s["email_sender_name"] || "Zipper").trim(),
    email: (s["email_sender_email"] || "").trim(),
  };
}

// Transactional send via Brevo's REST API (v3/smtp/email) — no SDK dependency,
// just the documented JSON shape. Sender address must be verified in the
// Brevo account (Settings → Senders) or every send fails with a 401.
export async function sendEmail(opts: {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}): Promise<EmailResult> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { ok: false, error: "BREVO_API_KEY не налаштовано" };
  if (!isValidEmail(opts.to)) return { ok: false, error: `Некоректний email отримувача: ${opts.to}` };

  const sender = await getSender();
  if (!isValidEmail(sender.email)) {
    return { ok: false, error: "Email відправника не налаштовано (Налаштування → Email)" };
  }

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender,
        to: [{ email: opts.to, name: opts.toName || undefined }],
        subject: opts.subject,
        htmlContent: opts.html,
        attachment: opts.attachments?.length ? opts.attachments : undefined,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Brevo ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
