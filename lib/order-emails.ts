import { getOrderDocumentData, renderInvoiceHtml, renderWaybillHtml } from "@/lib/order-documents";
import { renderPaymentRequestEmail, renderPaymentConfirmedEmail } from "@/lib/email-templates";
import { sendEmail, isValidEmail, type EmailResult } from "@/lib/email";

// Shared by the automatic sends (process / confirm-payment routes) and the
// manual "resend" endpoint, so all three paths build the exact same email.

export async function sendPaymentRequestEmail(orderId: number, overrideEmail?: string): Promise<EmailResult> {
  const doc = await getOrderDocumentData(orderId);
  if (!doc) return { ok: false, error: "Не вдалося сформувати дані документів" };

  const to = (overrideEmail || doc.order.login || "").trim();
  if (!isValidEmail(to)) return { ok: false, error: `Некоректний email отримувача: ${to || "—"}` };

  const { subject, html } = renderPaymentRequestEmail(doc);
  return sendEmail({
    to, toName: doc.order.person ?? undefined, subject, html,
    attachments: [
      { name: `rahunok-${doc.docNumber}.html`, content: Buffer.from(renderInvoiceHtml(doc), "utf-8").toString("base64") },
      { name: `nakladna-${doc.docNumber}.html`, content: Buffer.from(renderWaybillHtml(doc), "utf-8").toString("base64") },
    ],
  });
}

export async function sendPaymentConfirmedEmail(orderId: number, overrideEmail?: string): Promise<EmailResult> {
  const doc = await getOrderDocumentData(orderId);
  if (!doc) return { ok: false, error: "Не вдалося сформувати дані замовлення" };

  const to = (overrideEmail || doc.order.login || "").trim();
  if (!isValidEmail(to)) return { ok: false, error: `Некоректний email отримувача: ${to || "—"}` };

  const { subject, html } = renderPaymentConfirmedEmail(doc, doc.order.ttn ?? null);
  return sendEmail({ to, toName: doc.order.person ?? undefined, subject, html });
}
