import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listPriceLists, generatePriceLists } from "@/lib/price-lists";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const docs = await listPriceLists();
  return NextResponse.json({ docs });
}

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const log = await generatePriceLists();
    return NextResponse.json({ log });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Generation failed" }, { status: 500 });
  }
}
