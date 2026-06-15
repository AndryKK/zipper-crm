import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await prisma.slider.findMany({ where: { lang: "uk" }, orderBy: { priority: "asc" } }));
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

  let img: string | undefined;
  let img2: string | undefined;

  const uploadDir = path.join(process.cwd(), "public", "img", "upload-files", "slider");
  await mkdir(uploadDir, { recursive: true });

  if (file && file.size > 0) {
    const buf = Buffer.from(await file.arrayBuffer());
    img = `${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, "_")}`;
    await writeFile(path.join(uploadDir, img), buf);
  }
  if (file2 && file2.size > 0) {
    const buf = Buffer.from(await file2.arrayBuffer());
    img2 = `${Date.now()}-m-${file2.name.replace(/[^a-z0-9.]/gi, "_")}`;
    await writeFile(path.join(uploadDir, img2), buf);
  }

  const maxT = await prisma.slider.aggregate({ _max: { translationId: true } });
  const translationId = (maxT._max.translationId ?? 0) + 1;
  const langs = await prisma.lang.findMany({ where: { active: 1 } });

  const items = await Promise.all(langs.map((l) => prisma.slider.create({
    data: { translationId, lang: l.code, title, descr, uri, priority, img, img2 },
  })));

  return NextResponse.json(items[0], { status: 201 });
}
