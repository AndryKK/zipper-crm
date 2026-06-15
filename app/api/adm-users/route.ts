import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const users = await prisma.admUser.findMany({ select: { id: true, login: true, status: true } });
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { login, password } = await req.json();
  if (!login || !password) return NextResponse.json({ error: "Логін та пароль обов'язкові" }, { status: 400 });
  const existing = await prisma.admUser.findUnique({ where: { login } });
  if (existing) return NextResponse.json({ error: "Логін вже зайнятий" }, { status: 409 });
  const pass = await bcrypt.hash(password, 10);
  const user = await prisma.admUser.create({ data: { login, pass }, select: { id: true, login: true, status: true } });
  return NextResponse.json(user, { status: 201 });
}
