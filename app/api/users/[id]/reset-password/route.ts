import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { generatePassword } from "@/lib/passwords";

// Admin-triggered password reset — "Змінити пароль" on /users (see
// users-table.tsx). A customer's real existing password can never be
// recovered (bcrypt-hashed, one-way — see app/api/users/forgot-password's
// own doc comment), so this generates a brand-new one, saves its hash, and
// returns the PLAINTEXT once in this response for the admin to relay to
// the client themselves (phone/Viber/etc.) — unlike forgot-password, this
// never emails anyone; the admin is the one delivering it. Nothing else
// ever stores or re-serves this plaintext — once this response is shown,
// it's gone for good, same as if the customer had reset it themselves.
//
// Gated the same way the /users page itself already is — proxy.ts only
// allows /api/users/* through for superadmin (see lib/roles.ts's
// ROLE_ALLOWED_PREFIXES, which has no /users entry for the other roles),
// so no extra role check is needed here: whichever roles can reach this
// page at all is exactly who this button is for.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const userId = parseInt(id);
  if (!Number.isFinite(userId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const { data: user } = await supabaseServer.from("users").select("id, login").eq("id", userId).maybeSingle();
  if (!user) return NextResponse.json({ error: "Клієнта не знайдено" }, { status: 404 });

  const newPassword = generatePassword();
  const hash = await bcrypt.hash(newPassword, 10);
  const { error } = await supabaseServer.from("users").update({ password: hash }).eq("id", userId);
  if (error) return NextResponse.json({ error: "Не вдалося оновити пароль" }, { status: 500 });

  return NextResponse.json({ password: newPassword });
}
