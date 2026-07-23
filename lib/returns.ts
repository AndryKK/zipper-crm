// Status workflow for orders_returns. A return only restocks the warehouse
// when it reaches RECEIVED — everything else (including the initial
// creation) leaves inventory untouched, per the business rule: stock only
// comes back once Nova Poshta has actually delivered the return parcel to
// the warehouse (or the order was cancelled before it ever shipped, which
// is handled separately by the inventory-sync webhook).
export const RETURN_STATUS = {
  NEW: "Нове",
  CONFIRMED: "Підтверджено",
  // Nova Poshta confirmed the return parcel was delivered (auto-set by the
  // sync-ttn-status cron once a ttn is on the return) but nobody has walked
  // to the branch and confirmed it in hand yet — this status IS the manager
  // notification: it shows up highlighted in the returns list until someone
  // moves it to RECEIVED.
  ARRIVED: "Прибуло, забрати",
  RECEIVED: "Отримано на складі",
  REJECTED: "Відхилено",
  CANCELLED: "Скасовано",
} as const;

export type ReturnStatus = (typeof RETURN_STATUS)[keyof typeof RETURN_STATUS];

export const RETURN_STATUSES: ReturnStatus[] = [
  RETURN_STATUS.NEW,
  RETURN_STATUS.CONFIRMED,
  RETURN_STATUS.ARRIVED,
  RETURN_STATUS.RECEIVED,
  RETURN_STATUS.REJECTED,
  RETURN_STATUS.CANCELLED,
];

export const RETURN_STATUS_COLOR: Record<string, string> = {
  [RETURN_STATUS.NEW]: "#6b7280",
  [RETURN_STATUS.CONFIRMED]: "#2563eb",
  [RETURN_STATUS.ARRIVED]: "#f59e0b",
  [RETURN_STATUS.RECEIVED]: "#059669",
  [RETURN_STATUS.REJECTED]: "#dc2626",
  [RETURN_STATUS.CANCELLED]: "#dc2626",
};
