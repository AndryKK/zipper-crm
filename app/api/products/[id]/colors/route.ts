import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

// POST /api/products/[id]/colors
// Body: { pcode, uri, copyText?: { currentColorName, newColorName, currentColorNameRu?, newColorNameRu? } }
// Якщо товар з таким pcode існує — лінкує (uk↔uk, ru↔ru).
// Якщо НЕ існує — створює UK+RU копії з основного товару з новим uri, потім лінкує.
// Повертає: { success, newTrId, newVariants } для оновлення стейту форми без перезавантаження.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { pcode, uri, copyText } = body as {
    pcode: string;
    uri?: string;
    copyText?: {
      currentColorName: string;
      newColorName: string;
      currentColorNameRu?: string;
      newColorNameRu?: string;
    };
  };

  if (!pcode?.trim()) return NextResponse.json({ error: "Вкажіть артикул" }, { status: 400 });

  const sourceId = parseInt(id);

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

  let toLink: { srcId: number; tgtId: number }[] = [];
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

    // Match by lang: uk↔uk, ru↔ru
    for (const srcVar of sourceVars) {
      const tgtVar = (targetVarsShort || []).find((t: any) => t.lang === srcVar.lang);
      if (tgtVar) toLink.push({ srcId: srcVar.id, tgtId: tgtVar.id });
    }

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
      await supabaseServer.from("products").update({ translation_id: createdTrId }).eq("id", newId);
    }

    for (const src of sourceVars) {
      const newId = newVarsByLang[src.lang];
      if (newId) toLink.push({ srcId: src.id, tgtId: newId });
    }

    newTrId = createdTrId!;
    const { data: fullVars } = await supabaseServer.from("products").select("*").eq("translation_id", newTrId);
    newVariants = fullVars ?? [];
  }

  // ── Insert same-lang links (bidirectional, skip if already exist) ─
  if (toLink.length) {
    const allSrcIds = toLink.map((p) => p.srcId);
    const allTgtIds = toLink.map((p) => p.tgtId);

    const [{ data: existingFwd }, { data: existingRev }] = await Promise.all([
      supabaseServer.from("products_colors").select("pid, pid_with").in("pid", allSrcIds).in("pid_with", allTgtIds),
      supabaseServer.from("products_colors").select("pid, pid_with").in("pid", allTgtIds).in("pid_with", allSrcIds),
    ]);
    const existingSet = new Set([
      ...(existingFwd || []).map((l: any) => `${l.pid}-${l.pid_with}`),
      ...(existingRev || []).map((l: any) => `${l.pid}-${l.pid_with}`),
    ]);

    const rows: { pid: number; pid_with: number }[] = [];
    for (const { srcId, tgtId } of toLink) {
      if (!existingSet.has(`${srcId}-${tgtId}`)) rows.push({ pid: srcId, pid_with: tgtId });
      if (!existingSet.has(`${tgtId}-${srcId}`)) rows.push({ pid: tgtId, pid_with: srcId });
    }
    if (rows.length) await supabaseServer.from("products_colors").insert(rows);
  }

  return NextResponse.json({ success: true, newTrId, newVariants });
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
  const { data: sourceVars } = await supabaseServer.from("products").select("id").eq("translation_id", (sourceProd as any)?.translation_id);
  const sourceIds = (sourceVars || []).map((s: any) => s.id);

  const { data: targetVars } = await supabaseServer.from("products").select("id").eq("translation_id", colorTranslationId);
  const targetIds = (targetVars || []).map((t: any) => t.id);

  if (sourceIds.length && targetIds.length) {
    await Promise.all([
      supabaseServer.from("products_colors").delete().in("pid", sourceIds).in("pid_with", targetIds),
      supabaseServer.from("products_colors").delete().in("pid", targetIds).in("pid_with", sourceIds),
    ]);
  }

  if (hardDelete && targetIds.length) {
    await supabaseServer.from("products_colors").delete()
      .or(`pid.in.(${targetIds.join(",")}),pid_with.in.(${targetIds.join(",")})`);
    await supabaseServer.from("products_photos").delete().in("pid", targetIds);
    await supabaseServer.from("products_photos2").delete().in("pid", targetIds);
    await supabaseServer.from("products").delete().in("id", targetIds);
  }

  return NextResponse.json({ success: true });
}
