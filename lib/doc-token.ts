// Lets order-document routes (receipt/invoice/waybill) be opened without an
// admin session — needed so a link pasted into Viber/SMS to an actual
// customer (see app/(admin)/orders/[id]/viber-messages) opens directly, not
// a login wall. Signed with the app's own AUTH_SECRET (already a
// server-only secret used for session signing) rather than a new env var;
// non-expiring since these are read-only printable documents a customer
// might reasonably reopen days later, not an action that needs to expire.
//
// Uses Web Crypto (crypto.subtle), not Node's `crypto` module, on purpose —
// proxy.ts (this app's middleware, see its own comment) has to call
// verifyOrderDocToken too, and Next.js middleware runs on the Edge runtime,
// which has no Node `crypto`. Web Crypto works in both.
async function hmacHex(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(process.env.AUTH_SECRET || ""),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signOrderDocToken(orderId: number): Promise<string> {
  const full = await hmacHex(`order-doc:${orderId}`);
  return full.slice(0, 32);
}

export async function verifyOrderDocToken(orderId: number, token: string | null): Promise<boolean> {
  if (!token || token.length !== 32) return false;
  const expected = await signOrderDocToken(orderId);
  return expected === token;
}
