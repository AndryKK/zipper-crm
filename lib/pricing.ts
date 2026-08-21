import { supabaseServer } from "@/lib/supabase";

// products.price is stored raw (same USD-equivalent unit the legacy PHP
// storefront uses — see includes/functions.php's usdrate_uah()); the грн
// row of the `currency` table is what actually converts it to hryvnia.
export async function getUahRate(): Promise<number> {
  const { data } = await supabaseServer
    .from("currency")
    .select("rate")
    .eq("title", "грн")
    .eq("enabled", 1)
    .limit(1)
    .maybeSingle();
  return data?.rate ?? 1;
}

// Matches the legacy storefront's own checkout discount: users.rank links
// to users_categories.translation_id (both 1-4: Незареєстрований/
// Зареєстрований/Постійний/VIP), whose discount column is the % actually
// applied — confirmed live against real orders (e.g. price_base=36.75,
// price=34.91 is exactly a 5% "Зареєстрований клієнт" discount). Falls
// back to 5% (the "usually 5%" default) for logged-out/unknown clients.
const DEFAULT_DISCOUNT_PERCENT = 5;

export async function getClientDiscountPercent(login: string | null | undefined): Promise<number> {
  if (!login) return DEFAULT_DISCOUNT_PERCENT;
  const { data: user } = await supabaseServer.from("users").select("rank").eq("login", login).maybeSingle();
  if (!user?.rank) return DEFAULT_DISCOUNT_PERCENT;
  const { data: category } = await supabaseServer
    .from("users_categories")
    .select("discount")
    .eq("translation_id", user.rank)
    .eq("lang", "uk")
    .maybeSingle();
  return category?.discount ?? DEFAULT_DISCOUNT_PERCENT;
}

// order.discount_percent is a manager override (set from the stock-check
// popup or the "resend with new discount" action) — null means "use the
// client's own rank discount automatically".
export async function resolveOrderDiscountPercent(order: { login: string | null; discount_percent: number | null }): Promise<number> {
  if (order.discount_percent != null) return order.discount_percent;
  return getClientDiscountPercent(order.login);
}

// priceBase = converted grn price before the client discount; price = what
// they actually pay. Rounding matches every existing price_base/price pair
// found in real orders (round-half-up to 2dp at each step).
export function computeItemPricing(rawPrice: number, rate: number, discountPercent: number) {
  const priceBase = Math.round(rawPrice * rate * 100) / 100;
  const price = Math.round(priceBase * (1 - discountPercent / 100) * 100) / 100;
  return { priceBase, price };
}
