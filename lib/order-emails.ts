import { getOrderDocumentData, renderOrderConfirmationHtml } from "@/lib/order-documents";
import { renderInvoicePdf, renderWaybillPdf } from "@/lib/order-pdf";
import { renderPaymentRequestEmail, renderPaymentConfirmedEmail, renderNewOrderNotificationEmail, renderPaymentReceivedNotificationEmail, type EmailRenderOptions } from "@/lib/email-templates";
import { sendEmail, isValidEmail, type EmailResult } from "@/lib/email";
import { isGuestCheckoutEmail } from "@/lib/guest-checkout";
import { supabaseServer } from "@/lib/supabase";

const GUEST_CHECKOUT_EMAIL_ERROR = "Це технічна адреса сайту для замовлень без реєстрації, не адреса клієнта — лист не надсилається";

// Shared by the automatic sends (process / confirm-payment routes), the
// preview endpoint, and the manual "resend" endpoint, so every path builds
// the exact same email — optionally with a manager-edited subject/note.

export async function sendPaymentRequestEmail(orderId: number, overrideEmail?: string, opts: EmailRenderOptions = {}): Promise<EmailResult> {
  const doc = await getOrderDocumentData(orderId);
  if (!doc) return { ok: false, error: "Не вдалося сформувати дані документів" };

  const to = (overrideEmail || doc.order.login || "").trim();
  if (isGuestCheckoutEmail(to)) return { ok: false, error: GUEST_CHECKOUT_EMAIL_ERROR };
  if (!isValidEmail(to)) return { ok: false, error: `Некоректний email отримувача: ${to || "—"}` };

  const { subject, html } = renderPaymentRequestEmail(doc, opts);
  const [invoicePdf, waybillPdf] = await Promise.all([renderInvoicePdf(doc), renderWaybillPdf(doc)]);
  return sendEmail({
    to, toName: doc.order.person ?? undefined, subject, html,
    attachments: [
      { name: `rahunok-${doc.docNumber}.pdf`, content: invoicePdf.toString("base64") },
      { name: `nakladna-${doc.docNumber}.pdf`, content: waybillPdf.toString("base64") },
    ],
  });
}

// "Order received, checking stock" greeting — sent once, automatically, by
// app/api/cron/send-welcome-emails as soon as an order shows up with
// welcome_email_sent=false (new orders only; see the backfill in
// scripts/add-welcome-email-sent-column.sql). Also reused by the manual
// "Вітальне повідомлення" resend button on the order page for exactly the
// same content, so a repeat send always matches what actually went out.
export async function sendWelcomeEmail(orderId: number, overrideEmail?: string, opts: EmailRenderOptions = {}): Promise<EmailResult> {
  const doc = await getOrderDocumentData(orderId);
  if (!doc) return { ok: false, error: "Не вдалося сформувати дані замовлення" };

  const to = (overrideEmail || doc.order.login || "").trim();
  if (isGuestCheckoutEmail(to)) return { ok: false, error: GUEST_CHECKOUT_EMAIL_ERROR };
  if (!isValidEmail(to)) return { ok: false, error: `Некоректний email отримувача: ${to || "—"}` };

  const html = renderOrderConfirmationHtml(doc, { greeting: true });
  const subject = opts.subject?.trim() || `Замовлення №${doc.order.id} отримано — перевіряємо наявність на складі`;
  return sendEmail({ to, toName: doc.order.person ?? undefined, subject, html });
}

export async function sendPaymentConfirmedEmail(orderId: number, overrideEmail?: string, opts: EmailRenderOptions = {}): Promise<EmailResult> {
  const doc = await getOrderDocumentData(orderId);
  if (!doc) return { ok: false, error: "Не вдалося сформувати дані замовлення" };

  const to = (overrideEmail || doc.order.login || "").trim();
  if (isGuestCheckoutEmail(to)) return { ok: false, error: GUEST_CHECKOUT_EMAIL_ERROR };
  if (!isValidEmail(to)) return { ok: false, error: `Некоректний email отримувача: ${to || "—"}` };

  const { subject, html } = renderPaymentConfirmedEmail(doc, doc.order.ttn ?? null, opts);
  return sendEmail({ to, toName: doc.order.person ?? undefined, subject, html });
}

// Internal "нове замовлення" ping — see app/api/webhooks/inventory-sync's
// "orders"+"INSERT" branch, the only caller. Deliberately independent of
// the customer-facing sends above: fires regardless of whether the
// customer's own login is a guest-checkout placeholder or an invalid
// email, since this is a staff notification about the order existing at
// all, not about the customer's contact info.
const DEFAULT_NEW_ORDER_NOTIFY_EMAIL = "zipper.in.ua@gmail.com";
const DEFAULT_CRM_URL = "https://zipper-crm.vercel.app";

export async function sendNewOrderNotification(orderId: number): Promise<EmailResult> {
  const { data: settingRow } = await supabaseServer
    .from("settings")
    .select("text")
    .eq("value", "internal_new_order_email")
    .eq("lang", "uk")
    .maybeSingle();
  const to = ((settingRow?.text as string | undefined) ?? "").trim() || DEFAULT_NEW_ORDER_NOTIFY_EMAIL;
  if (!isValidEmail(to)) return { ok: false, error: `Некоректний email отримувача: ${to}` };

  const crmUrl = (process.env.CRM_URL || DEFAULT_CRM_URL).replace(/\/$/, "");
  const { subject, html } = renderNewOrderNotificationEmail(orderId, crmUrl);
  return sendEmail({ to, subject, html });
}

// Internal "оплату отримано" ping — see app/api/orders/[id]/confirm-payment
// (the only caller), fired the moment an order's status flips to
// "Оплачено". Independent of the customer-facing "Лист-подяка" send right
// next to it in that route — this must go out regardless of whether the
// customer email is a guest-checkout placeholder, invalid, or its own send
// failed, since it's a staff notification about the payment, not about the
// customer's contact info (same reasoning as sendNewOrderNotification
// above). Settings-driven with a fallback for the same reason that one is —
// so the recipient can be changed later without a code deploy.
const DEFAULT_PAYMENT_NOTIFY_EMAIL = "maksymabramov@gmail.com";

export async function sendPaymentReceivedNotification(
  orderId: number,
  opts: { amount?: number; ttn?: string | null } = {}
): Promise<EmailResult> {
  const { data: settingRow } = await supabaseServer
    .from("settings")
    .select("text")
    .eq("value", "internal_payment_notify_email")
    .eq("lang", "uk")
    .maybeSingle();
  const to = ((settingRow?.text as string | undefined) ?? "").trim() || DEFAULT_PAYMENT_NOTIFY_EMAIL;
  if (!isValidEmail(to)) return { ok: false, error: `Некоректний email отримувача: ${to}` };

  const crmUrl = (process.env.CRM_URL || DEFAULT_CRM_URL).replace(/\/$/, "");
  const { subject, html } = renderPaymentReceivedNotificationEmail(orderId, crmUrl, opts);
  return sendEmail({ to, subject, html });
}
