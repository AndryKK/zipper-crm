import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const productId = parseInt(id);
  const formData = await req.formData();
  const files = formData.getAll("files") as File[];
  const gallery = formData.get("gallery") === "2";

  const uploadDir = path.join(process.cwd(), "public", "img", "upload-files", "products");
  await mkdir(uploadDir, { recursive: true });

  const created = [];
  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const filename = `${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, "_")}`;
    await writeFile(path.join(uploadDir, filename), buffer);

    const photo = gallery
      ? await prisma.productPhoto2.create({ data: { pid: productId, img: filename } })
      : await prisma.productPhoto.create({ data: { pid: productId, img: filename } });
    created.push(photo);
  }

  return NextResponse.json(created);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { photoId, gallery } = await req.json();

  if (gallery) {
    await prisma.productPhoto2.delete({ where: { id: photoId } });
  } else {
    await prisma.productPhoto.delete({ where: { id: photoId } });
  }

  return NextResponse.json({ success: true });
}
