import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const formData = await req.formData();
  const file = formData.get("img") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const uploadDir = path.join(process.cwd(), "public", "img", "upload-files", "categories");
  await mkdir(uploadDir, { recursive: true });

  const ext = file.name.split(".").pop() ?? "jpg";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const bytes = await file.arrayBuffer();
  await writeFile(path.join(uploadDir, filename), Buffer.from(bytes));

  const updated = await prisma.category.update({
    where: { id: parseInt(id) },
    data: { img: filename },
  });

  return NextResponse.json({ img: updated.img });
}
