import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { uploadToR2 } from "@/lib/r2";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await supabaseServer.from("slider").select("*, translationId:translation_id").eq("lang", "uk").order("priority", { ascending: true });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const title = formData.get("title") as string;
  const descr = formData.get("descr") as string;
  const uri = formData.get("uri") as string;
  const priority = parseInt(formData.get("priority") as string) || 0;
  const file = formData.get("img") as File | null;
  const file2 = formData.get("img2") as File | null;

  async function uploadFile(f: File, prefix: string): Promise<string> {
    const filename = `${Date.now()}-${prefix}-${f.name.replace(/[^a-z0-9.]/gi, "_")}`;
    return uploadToR2(`slider/${filename}`, await f.arrayBuffer(), f.type || "image/jpeg");
  }

  const [img, img2] = await Promise.all([
    file && file.size > 0 ? uploadFile(file, "d") : Promise.resolve(undefined),
    file2 && file2.size > 0 ? uploadFile(file2, "m") : Promise.resolve(undefined),
  ]);

  const { data: maxTransRow } = await supabaseServer
    .from("slider")
    .select("translation_id")
    .order("translation_id", { ascending: false })
    .limit(1)
    .single();
  const translationId = ((maxTransRow as any)?.translation_id ?? 0) + 1;

  const { data: langs } = await supabaseServer.from("langs").select("*").eq("active", 1);
  const activeLangs = langs || [];

  const items = await Promise.all(activeLangs.map(async (l: any) => {
    const { data } = await supabaseServer.from("slider").insert({
      translation_id: translationId,
      lang: l.code,
      title, descr, uri, priority, img, img2,
    }).select("*").single();
    return data;
  }));

  return NextResponse.json(items[0], { status: 201 });
}
