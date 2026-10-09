import { randomBytes } from "crypto";

// Shared by the public "forgot password" self-service flow
// (app/api/users/forgot-password) and the CRM admin's manual "Змінити
// пароль" action (app/api/users/[id]/reset-password) — both generate a
// fresh random password the same way; a customer's real password can
// never be recovered (bcrypt-hashed, one-way), so both flows are really
// "give me/them a new one," just triggered differently (self-service by
// email vs an admin resetting it and relaying it by phone/Viber/etc).
const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; // no 0/O/1/l/I ambiguity

export function generatePassword(length = 10): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += PASSWORD_CHARS[bytes[i] % PASSWORD_CHARS.length];
  return out;
}
