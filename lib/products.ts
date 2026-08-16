import { supabaseServer } from "@/lib/supabase";

// Shared product-creation helpers — read this file before writing another
// "generate a pcode/uri for a new product row" anywhere else in the app.
// Both current call sites (creating a brand-new product from scratch in
// app/api/products/route.ts, and duplicating a product as a new color
// variant in app/api/products/[id]/colors/route.ts) need the exact same
// two things: a fresh, collision-free артикул, and a slug that won't
// collide with the product it was copied from. Keeping both here means a
// third call site (e.g. a future bulk-duplicate action) gets the same
// behavior for free instead of re-deriving it slightly differently.

// Артикул (pcode) is always auto-generated, never typed by hand: the
// number is the highest existing numeric part + 1 (checked against the
// most recently created products — that counter has always tracked
// closely with id, e.g. id 10321 -> pcode "bs10280", so the last 200 rows
// are enough without scanning the whole products table for one column —
// keeps this cheap on egress).
// The letter prefix is inherited from `copyFromId` (the product this one
// was copied/duplicated from), if given, or otherwise a random single
// English letter, since nothing about a from-scratch product implies
// which letter it should get.
export async function generatePcode(copyFromId?: number): Promise<string> {
  const { data: recent } = await supabaseServer
    .from("products")
    .select("pcode")
    .order("id", { ascending: false })
    .limit(200);

  let maxNum = 0;
  for (const row of recent ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const n = parseInt(String((row as any).pcode ?? "").replace(/^\D+/, ""), 10);
    if (Number.isFinite(n) && n > maxNum) maxNum = n;
  }

  let letter = "";
  if (copyFromId) {
    const { data: src } = await supabaseServer
      .from("products")
      .select("pcode")
      .eq("id", copyFromId)
      .single();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    letter = String((src as any)?.pcode ?? "").match(/^\D*/)?.[0] ?? "";
  }
  if (!letter) {
    letter = String.fromCharCode(97 + Math.floor(Math.random() * 26));
  }

  return `${letter}${maxNum + 1}`;
}

// Every product uri is "<translation_id>-<transliterated-title-slug>"
// (verified against the live table, e.g. translation_id 10280 -> uri
// "10280-bigunok-tip-3-na-spiralnu-bliskavku-temnij-nikel-z-fiks-100sht")
// — translation_id is the leading number specifically, not the row's own
// id and not the pcode. So the cheapest way to turn a copied product's uri
// into one that's guaranteed not to collide with the source (same
// language, same descriptive text) is to swap in the *new* translation_id
// as that leading number and keep the rest of the slug untouched — no
// extra uniqueness query needed, and it stays consistent with every other
// uri in the table for anyone reading it later.
export function buildAutoUri(newTranslationId: number, sourceUri: string): string {
  const slug = sourceUri.replace(/^\d+-/, "");
  return `${newTranslationId}-${slug}`;
}

// products_colors is a plain id-pair link table (both directions — pid ->
// pid_with and pid_with -> pid) saying "these are the same real-world
// product, just a different color." The ids it links are meant to be
// translation_id values (that's what the storefront's own product.php
// queries by — see /api/products/[id]/colors's POST handler comment for
// the full story), but this function doesn't care which kind of id it's
// given — pass whatever ids might appear as `pid`/`pid_with` for the thing
// you're removing (a row's own id, its translation_id, or both, per
// caller). Nothing enforces this link when a product row is deleted
// elsewhere, so call this BEFORE deleting it, or it keeps showing up as a
// color of its group forever (a ghost entry in the color-swatch dropdown
// on product-form.tsx — this was the original bug: DELETE
// /api/products/[id] deleted the row but never called this).
export async function unlinkProductColors(productIds: number[]): Promise<void> {
  if (!productIds.length) return;
  await supabaseServer
    .from("products_colors")
    .delete()
    .or(`pid.in.(${productIds.join(",")}),pid_with.in.(${productIds.join(",")})`);
}

// BFS over products_colors starting from one product's translation_id,
// returning every translation_id in its color group (the start included).
// Same walk as findColorGroup in app/(admin)/products/[id]/page.tsx (kept
// there too since that one already has langIds/baseTrId in scope from the
// page load — this version resolves those itself so a route handler that
// only has a product id can call it directly), robust to both the correct
// translation_id-keyed products_colors rows and the old, incorrectly
// row-id-keyed ones some groups still have (see the POST handler comment
// in app/api/products/[id]/colors/route.ts for that whole story) — it
// doesn't assume which kind of id a `pid`/`pid_with` value is, it just
// resolves whatever product id it finds back to a translation_id and
// keeps walking.
export async function findColorGroupTrIds(productId: number): Promise<number[]> {
  const { data: startProd } = await supabaseServer
    .from("products")
    .select("translation_id")
    .eq("id", productId)
    .single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const startTrId = (startProd as any)?.translation_id;
  if (!startTrId) return [];

  const { data: startVars } = await supabaseServer
    .from("products")
    .select("id")
    .eq("translation_id", startTrId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let frontier = (startVars ?? []).map((p: any) => p.id);

  const visitedTrIds = new Set<number>([startTrId]);
  const visitedPIds = new Set<number>(frontier);

  while (frontier.length > 0) {
    const { data: links } = await supabaseServer
      .from("products_colors")
      .select("pid, pid_with")
      .or(`pid.in.(${frontier.join(",")}),pid_with.in.(${frontier.join(",")})`);

    const newPIds: number[] = [];
    for (const lk of links ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const l = lk as any;
      if (!visitedPIds.has(l.pid)) { visitedPIds.add(l.pid); newPIds.push(l.pid); }
      if (!visitedPIds.has(l.pid_with)) { visitedPIds.add(l.pid_with); newPIds.push(l.pid_with); }
    }
    if (!newPIds.length) break;

    const { data: prods } = await supabaseServer
      .from("products")
      .select("id, translation_id")
      .in("id", newPIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newTrIds = [...new Set((prods ?? []).map((p: any) => p.translation_id))]
      .filter((tid) => !visitedTrIds.has(tid));
    if (!newTrIds.length) break;

    const { data: newVars } = await supabaseServer
      .from("products")
      .select("id")
      .in("translation_id", newTrIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    frontier = (newVars ?? []).map((p: any) => p.id);
    frontier.forEach((pid) => visitedPIds.add(pid));
    newTrIds.forEach((tid) => visitedTrIds.add(tid));
  }

  return [...visitedTrIds];
}

// The storefront (product.php) picks which color of a group to actually
// show/search on by `active` — an inactive color's page silently redirects
// to whichever sibling has active=1 (see product.php: `WHERE (row.active
// == 0) THEN ... translationid = (SELECT pid_with FROM products_colors
// WHERE pid = :edit)`). Making a color "the main one" therefore has to
// flip that flag for real, not just change what the CRM happens to be
// looking at — see handleMakeMain in product-form.tsx, which used to only
// router.push to the color's own page and call that "making it main," so
// the CRM's ★ badge and the live site's actual search result silently
// diverged (this is the fix for that).
export async function setMainColor(productId: number): Promise<void> {
  const groupTrIds = await findColorGroupTrIds(productId);
  const { data: target } = await supabaseServer.from("products").select("translation_id").eq("id", productId).single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const targetTrId = (target as any)?.translation_id;
  if (!targetTrId) return;

  const otherTrIds = groupTrIds.filter((tid) => tid !== targetTrId);
  await Promise.all([
    supabaseServer.from("products").update({ active: 1 }).eq("translation_id", targetTrId),
    otherTrIds.length
      ? supabaseServer.from("products").update({ active: 0 }).in("translation_id", otherTrIds)
      : Promise.resolve(),
  ]);
}
