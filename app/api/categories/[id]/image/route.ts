import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { uploadToR2 } from "@/lib/r2";

const ALLOWED_FIELDS = ["img", "image_new_shop"] as const;
type AllowedField = (typeof ALLOWED_FIELDS)[number];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const fieldParam = req.nextUrl.searchParams.get("field") ?? "img";
  if (!(ALLOWED_FIELDS as readonly string[]).includes(fieldParam)) {
    return NextResponse.json({ error: "Invalid field" }, { status: 400 });
  }
  const field = fieldParam as AllowedField;

  const formData = await req.formData();
  const file = formData.get("img") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const ext = file.name.split(".").pop() ?? "jpg";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const key = `categories/${filename}`;

  const bytes = await file.arrayBuffer();
  const publicUrl = await uploadToR2(key, bytes, file.type || "image/jpeg");

  const { data: updated } = await supabaseServer
    .from("categories")
    .update({ [field]: publicUrl })
    .eq("id", parseInt(id))
    .select(field)
    .single();

  return NextResponse.json({ [field]: (updated as any)?.[field] });
}
