import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const q = searchParams.get("q") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = 30;

  const where = {
    ...(status !== null && status !== "" && { status }),
    ...(q && {
      OR: [
        { person: { contains: q } },
        { phone: { contains: q } },
        { login: { contains: q } },
      ],
    }),
  };

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { items: true },
    }),
    prisma.order.count({ where }),
  ]);

  return NextResponse.json({ items, total });
}
