// The storefront's "quick order without registration" checkout stores
// every such guest order under this ONE literal shared login/email —
// confirmed against the live `orders` table: 10,000+ orders (and growing)
// carry this exact login, with the customer's real name/phone typed into
// `orders.person`/`orders.phone` instead of a personal account. It's
// syntactically a valid email (isValidEmail alone can't tell it apart from
// a real customer's address) but is actually the site's own generic
// mailbox — an automated email sent "to the customer" here would really
// just land back in Zipper's own inbox, and the order page's own contact
// info for the customer is really phone/name only.
//
// Never a valid send target for any of the three automated customer
// emails (welcome/payment-request/payment-confirmed — see
// lib/order-emails.ts, which checks this for all three) — and the order
// page warns before processing one of these at all, since a manager needs
// to call the client rather than rely on an automatic email; see
// app/(admin)/orders/[id]/page.tsx's guest-checkout warning popup.
export const GUEST_CHECKOUT_EMAIL = "zipper.in.ua@gmail.com";

export function isGuestCheckoutEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === GUEST_CHECKOUT_EMAIL;
}
