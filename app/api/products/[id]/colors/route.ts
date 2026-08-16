import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { generatePcode, buildAutoUri, unlinkProductColors, setMainColor } from "@/lib/products";

// POST /api/products/[id]/colors
// Body: { pcode?, uri?, copyText?: { currentColorName, newColorName, currentColorNameRu?, newColorNameRu? } }
// Якщо товар з таким pcode існує — лінкує (uk↔uk, ru↔ru).
// Якщо НЕ існує — створює UK+RU копії з основного товару з новим uri, потім лінкує.
// Повертає: { success, newTrId, newVariants } для оновлення стейту форми без перезавантаження.
//
// pcode/uri обидва необов'язкові: якщо їх не передали (як робить кнопка
// "Копіювати товар" у списку товарів — жодного ручного вводу), артикул і
// slug генеруються самі через lib/products.ts (generatePcode/buildAutoUri)
// — ті самі функції, що й при створенні товару з нуля. Ручна модалка
// "Додати колір" у product-form.tsx як і раніше передає обидва явно.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { pcode: pcodeInput, uri, copyText } = body as {
    pcode?: string;
    uri?: string;
    copyText?: {
      currentColorName: string;
      newColorName: string;
      currentColorNameRu?: string;
      newColorNameRu?: string;
    };
  };

  const sourceId = parseInt(id);
  const pcode = pcodeInput?.trim() || await generatePcode(sourceId);

  const { data: sourceProd } = await supabaseServer
    .from("products")
    .select("translation_id")
    .eq("id", sourceId)
    .single();
  if (!sourceProd) return NextResponse.json({ error: "Поточний товар не знайдено" }, { status: 404 });

  const sourceTrId = (sourceProd as any).translation_id;

  const { data: sourceVars } = await supabaseServer
    .from("products")
    .select("*")
    .eq("translation_id", sourceTrId);
  if (!sourceVars?.length) return NextResponse.json({ error: "Варіанти джерела не знайдено" }, { status: 404 });

  function replaceColor(text: string | null, lang: string): string | null {
    if (!text || !copyText) return text;
    const isRu = lang === "ru";
    const searchTerm = isRu
      ? (copyText.currentColorNameRu?.trim() || copyText.currentColorName?.trim())
      : copyText.currentColorName?.trim();
    const replacement = isRu
      ? (copyText.newColorNameRu ?? copyText.newColorName ?? "")
      : (copyText.newColorName ?? "");
    if (!searchTerm) return text;
    try {
      return text.replace(new RegExp(searchTerm, "gi"), replacement);
    } catch {
      return text;
    }
  }

  // ── Try to find existing product by pcode ─────────────────────────
  const { data: existing } = await supabaseServer
    .from("products")
    .select("id, translation_id")
    .eq("pcode", pcode.trim());

  // Exactly one bidirectional pair per color-group relationship, keyed by
  // translation_id — NOT per-language row ids. This must match the
  // storefront's own query (product.php: `SELECT ... FROM products_colors
  // WHERE pid = :edit`, where :edit is always $row['translationId']); the
  // storefront has no idea a specific language row's own id even exists
  // here, and never resolves one. A translation_id happens to double as
  // one particular language row's own id (whichever row was created
  // first — see buildAutoUri's comment on the same convention for uri),
  // which is exactly why a row-id-keyed link used to *look* like it
  // worked from inside the CRM (findColorGroup in
  // app/(admin)/products/[id]/page.tsx does its own row-id ->
  // translation_id resolution and isn't picky about which one it's given)
  // while silently never showing up as a real variant option on the live
  // site — the storefront has no such resolution step.
  let toLink: { srcId: number; tgtId: number } | null = null;
  let newTrId: number;
  let newVariants: any[];

  if (existing?.length) {
    // Product exists — collect all lang variants
    const targetTrIds = [...new Set(existing.map((t: any) => t.translation_id))];
    const { data: targetVarsShort } = await supabaseServer
      .from("products")
      .select("id, lang, translation_id")
      .in("translation_id", targetTrIds);

    const targetIds = (targetVarsShort || []).map((t: any) => t.id);
    const sourceIds = sourceVars.map((s: any) => s.id);

    if (sourceIds.some((sid) => targetIds.some((tid) => tid === sid))) {
      return NextResponse.json({ error: "Це вже поточний товар" }, { status: 400 });
    }

    toLink = { srcId: sourceTrId, tgtId: targetTrIds[0] };

    // Copy + replace text if requested
    if (copyText) {
      for (const tgtVar of targetVarsShort || []) {
        const src = sourceVars.find((s: any) => s.lang === tgtVar.lang);
        if (!src) continue;
        await supabaseServer.from("products").update({
          title: replaceColor(src.title, tgtVar.lang),
          main_title: replaceColor(src.main_title, tgtVar.lang),
          descr: replaceColor(src.descr, tgtVar.lang),
          text: replaceColor(src.text, tgtVar.lang),
          heading: replaceColor(src.heading, tgtVar.lang),
        }).eq("id", tgtVar.id);
      }
    }

    newTrId = targetTrIds[0];
    // Fetch full data for return
    const { data: fullVars } = await supabaseServer.from("products").select("*").eq("translation_id", newTrId);
    newVariants = fullVars ?? [];
  } else {
    // ── Product NOT found — create copies of source ───────────────
    let createdTrId: number | null = null;
    const newVarsByLang: Record<string, number> = {};

    for (const src of sourceVars) {
      const insertResult = await supabaseServer
        .from("products")
        .insert({
          title: replaceColor(src.title, src.lang),
          main_title: replaceColor(src.main_title, src.lang),
          // Placeholder — an explicit `uri` wins as-is, but the auto-derived
          // case (no `uri` given) needs createdTrId, which only exists once
          // the first row below is inserted, so that case gets patched in
          // the translation_id update just below instead.
          uri: uri?.trim() || src.uri,
          heading: replaceColor(src.heading, src.lang),
          descr: replaceColor(src.descr, src.lang),
          text: replaceColor(src.text, src.lang),
          price: src.price,
          price_sale: src.price_sale,
          price2: src.price2,
          price2n: src.price2n,
          price3: src.price3,
          price3n: src.price3n,
          measure: src.measure,
          minquantity: src.minquantity,
          popular: src.popular,
          priority: src.priority,
          active: src.active,
          label_action: src.label_action,
          pcode: pcode.trim(),
          lang: src.lang,
          translation_id: createdTrId ?? -1,
        })
        .select("id")
        .single();

      const inserted = insertResult.data as { id: number } | null;
      const insertErr = insertResult.error;

      if (insertErr || !inserted) {
        return NextResponse.json({ error: `Помилка створення: ${insertErr?.message}` }, { status: 500 });
      }

      const newId: number = inserted.id;
      newVarsByLang[src.lang] = newId;

      if (createdTrId === null) {
        createdTrId = newId;
      }
      const patch: Record<string, unknown> = { translation_id: createdTrId };
      // No explicit uri override — differentiate it from the source's own
      // uri now that createdTrId (the new color group's id) is known, per
      // buildAutoUri's doc comment. Without this every auto-created color
      // would silently keep the SOURCE product's exact uri (a real gap in
      // the old "falls back to src.uri" behavior — two live products with
      // an identical uri, only distinguishable by id).
      if (!uri?.trim()) patch.uri = buildAutoUri(createdTrId, src.uri);
      await supabaseServer.from("products").update(patch).eq("id", newId);
    }

    toLink = { srcId: sourceTrId, tgtId: createdTrId! };

    // ── Copy categories + filters onto the new rows ──────────────────
    // Two different keying schemes, both inherited from the storefront's
    // own schema — not something to "fix" here, just something to get
    // right when copying:
    //   - products_categories.pid is a specific per-language product ROW
    //     id (see app/(admin)/products/page.tsx's category-name lookup,
    //     which cross-references it against the "ru" row's own id) — so
    //     each new language row needs its own copied rows, source-row-id
    //     to new-row-id, matched by lang.
    //   - all_filters_filters_items.pid is the shared translation_id (see
    //     GET/PUT /api/products/[id]/filters's doc comment) — one set
    //     covers every language variant, so this only needs copying once,
    //     sourceTrId -> createdTrId.
    const sourceIds = sourceVars.map((s: any) => s.id);
    const [{ data: sourceCats }, { data: sourceFilters }] = await Promise.all([
      supabaseServer.from("products_categories").select("pid, cid").in("pid", sourceIds),
      supabaseServer.from("all_filters_filters_items").select("fid").eq("pid", sourceTrId),
    ]);

    const srcIdToNewId = new Map(sourceVars.map((s: any) => [s.id, newVarsByLang[s.lang]]));
    const newCatRows = (sourceCats ?? [])
      .map((c: any) => ({ pid: srcIdToNewId.get(c.pid), cid: c.cid }))
      .filter((c) => c.pid);
    if (newCatRows.length) await supabaseServer.from("products_categories").insert(newCatRows);

    if (sourceFilters?.length) {
      await supabaseServer.from("all_filters_filters_items").insert(
        sourceFilters.map((f: any) => ({ pid: createdTrId, fid: f.fid }))
      );
    }

    newTrId = createdTrId!;
    const { data: fullVars } = await supabaseServer.from("products").select("*").eq("translation_id", newTrId);
    newVariants = fullVars ?? [];
  }

  // ── Insert the translation_id link (bidirectional, skip if already exists) ─
  if (toLink) {
    const { srcId, tgtId } = toLink;
    const { data: existingLink } = await supabaseServer
      .from("products_colors")
      .select("pid")
      .or(`and(pid.eq.${srcId},pid_with.eq.${tgtId}),and(pid.eq.${tgtId},pid_with.eq.${srcId})`);
    if (!existingLink?.length) {
      await supabaseServer.from("products_colors").insert([
        { pid: srcId, pid_with: tgtId },
        { pid: tgtId, pid_with: srcId },
      ]);
    }
  }

  return NextResponse.json({ success: true, newTrId, newVariants });
}

// PATCH /api/products/[id]/colors — makes this product's color the group's
// "main" one (active=1), demoting every other color in the group to
// active=0. See setMainColor's doc comment in lib/products.ts for why
// active is what actually controls this on the live site.
export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await setMainColor(parseInt(id));
  return NextResponse.json({ success: true });
}

// DELETE /api/products/[id]/colors
// Body: { colorTranslationId, hardDelete?: boolean }
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { colorTranslationId, hardDelete } = await req.json();

  const sourceId = parseInt(id);

  const { data: sourceProd } = await supabaseServer.from("products").select("translation_id").eq("id", sourceId).single();
  const sourceTrId = (sourceProd as any)?.translation_id;
  const { data: sourceVars } = await supabaseServer.from("products").select("id").eq("translation_id", sourceTrId);
  const sourceIds = (sourceVars || []).map((s: any) => s.id);

  const { data: targetVars } = await supabaseServer.from("products").select("id").eq("translation_id", colorTranslationId);
  const targetIds = (targetVars || []).map((t: any) => t.id);

  // Unlinking checks both translation_id (how POST above links things now)
  // and the per-language row ids (how it used to, incorrectly — see the
  // POST handler's comment) so this still cleans up a pre-existing,
  // wrongly-keyed link too, not just newly-created ones.
  const sourceKeys = [...new Set([sourceTrId, ...sourceIds].filter(Boolean))];
  const targetKeys = [...new Set([colorTranslationId, ...targetIds].filter(Boolean))];

  if (sourceKeys.length && targetKeys.length) {
    await Promise.all([
      supabaseServer.from("products_colors").delete().in("pid", sourceKeys).in("pid_with", targetKeys),
      supabaseServer.from("products_colors").delete().in("pid", targetKeys).in("pid_with", sourceKeys),
    ]);
  }

  if (hardDelete && targetIds.length) {
    await unlinkProductColors([...targetKeys]);
    await supabaseServer.from("products_photos").delete().in("pid", targetIds);
    await supabaseServer.from("products_photos2").delete().in("pid", targetIds);
    await supabaseServer.from("products").delete().in("id", targetIds);
  }

  return NextResponse.json({ success: true });
}
