// Shared between app/(admin)/orders/page.tsx and app/(admin)/page.tsx
// (dashboard "Останні замовлення") — both list a page of live `orders`
// rows and need the exact same status→label/badge/row-background mapping,
// so a card on the dashboard is colored identically to the matching row
// on the real orders list, not just similarly.

// The six real statuses an order can be in, in canonical pipeline order —
// same order PIPELINE/ALL_STATUSES in app/(admin)/orders/[id]/page.tsx
// use. Exported so anything that needs to always show all six (even ones
// with zero matching orders right now, e.g. the dashboard's status pie
// chart legend) doesn't have to duplicate this list.
export const ORDER_STATUSES = ["Новий", "В роботі", "Оплачено", "Відправлено", "Завершено", "Скасовано"] as const;

// Brand-new/unprocessed orders carry the literal English status "new"
// (lowercase — a legacy leftover, confirmed against the live orders table:
// order #1 and presumably every never-touched order have status="new",
// not a Ukrainian/Russian word and not null/empty), so every "is this a
// new order" check below needs to match that exact literal on top of the
// null/empty/"нов*" cases already handled.
// "Отримано"/"Получен" looks like it should mean "customer received the
// parcel", but verified directly against the live table: every single one
// of the 89 orders carrying this status (across the whole history, not
// just recent ones) has ttn=null and pay_method=null — none were ever
// paid or shipped. The storefront actually writes this status to mean
// "[we] received the order" (order intake), not "[customer] received the
// package" — a literal-translation trap, not a distinct pipeline stage.
export function isNewStatus(status: string | null): boolean {
  const s = (status ?? "").toLowerCase();
  return !s || s === "new" || s.includes("нов") || s.includes("отримано") || s.includes("получен");
}

export function orderStatusLabel(status: string | null): string {
  if (isNewStatus(status)) return "Новий";
  return status ?? "Новий";
}

export function orderStatusClass(status: string | null): string {
  const s = (status ?? "").toLowerCase();
  if (s.includes("завершен") || s.includes("завершено")) return "badge badge-green";
  if (s.includes("відправлен") || s.includes("отправлен")) return "badge badge-purple";
  if (s.includes("в работ") || s.includes("в робот")) return "badge badge-amber";
  if (s.includes("скасован") || s.includes("отмен")) return "badge badge-red";
  if (s.includes("оплач")) return "badge badge-blue";
  return "badge badge-gray";
}

// Row/card background tint — only for statuses that need a manager's
// attention (new, in progress, paid-and-awaiting-shipment); Завершено/
// Скасовано intentionally get no tint, same as the plain (untinted) rows
// they already are on the real orders list — a card mirrors that exactly
// rather than inventing its own always-colored scheme.
export function orderRowClass(status: string | null): string {
  const s = (status ?? "").toLowerCase();
  if (s.includes("в работ") || s.includes("в робот")) return "order-row--progress";
  if (s.includes("оплач")) return "order-row--paid";
  if (isNewStatus(status)) return "order-row--new";
  return "";
}
