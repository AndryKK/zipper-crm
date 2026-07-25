import { getOrderDocumentData } from "@/lib/order-documents";
import { renderInvoicePdf, renderWaybillPdf } from "@/lib/order-pdf";
import { renderPaymentRequestEmail, renderPaymentConfirmedEmail, type EmailRenderOptions } from "@/lib/email-templates";
import { sendEmail, isValidEmail, type EmailResult } from "@/lib/email";

// Shared by the automatic sends (process / confirm-payment routes), the
// preview endpoint, and the manual "resend" endpoint, so every path builds
// the exact same email — optionally with a manager-edited subject/note.

export async function sendPaymentRequestEmail(orderId: number, overrideEmail?: string, opts: EmailRenderOptions = {}): Promise<EmailResult> {
  const doc = await getOrderDocumentData(orderId);
  if (!doc) return { ok: false, error: "Не вдалося сформувати дані документів" };

  const to = (overrideEmail || doc.order.login || "").trim();
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

export async function sendPaymentConfirmedEmail(orderId: number, overrideEmail?: string, opts: EmailRenderOptions = {}): Promise<EmailResult> {
  const doc = await getOrderDocumentData(orderId);
  if (!doc) return { ok: false, error: "Не вдалося сформувати дані замовлення" };

  const to = (overrideEmail || doc.order.login || "").trim();
  if (!isValidEmail(to)) return { ok: false, error: `Некоректний email отримувача: ${to || "—"}` };

  const { subject, html } = renderPaymentConfirmedEmail(doc, doc.order.ttn ?? null, opts);
  return sendEmail({ to, toName: doc.order.person ?? undefined, subject, html });
}
