import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { ROLES } from "@/lib/roles";

// PUT — assign/change which factory a product is sourced from. Any role
// that can reach /inventory may set it the FIRST time (while it's still
// unassigned); once set, only a superadmin may change it — see the
// 2026-09-04 request that introduced this. Applied to every products row
// sharing the same translation_id (the ru/uk pair), mirroring how the main
// product image is updated for "all colors" in main-image/route.ts, so the
// assignment stays consistent regardless of which language's id an
// inventory row happens to reference.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string } | undefined)?.role;

  const { id } = await params;
  const productId = parseInt(id);
  const { factory_id } = await req.json();

  const { data: prod } = await supabaseServer
    .from("products")
    .select("translation_id, factory_id")
    .eq("id", productId)
    .single();
  if (!prod) return NextResponse.json({ error: "Товар не знайдено" }, { status: 404 });

  if ((prod as any).factory_id != null && role !== ROLES.SUPERADMIN) {
    return NextResponse.json(
      { error: "Фабрику вже призначено — змінити може лише суперадмін" },
      { status: 403 }
    );
  }

  const trId = (prod as any).translation_id ?? productId;
  const { error } = await supabaseServer
    .from("products")
    .update({ factory_id: factory_id ?? null })
    .eq("translation_id", trId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ factory_id: factory_id ?? null });
}
