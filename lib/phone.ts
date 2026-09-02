// Guards against garbage in users.phone (seen live: literal "1") before
// trusting it over orders.phone — used wherever the account's own number is
// preferred as the actual client's phone over the order's (possibly a
// shipping recipient's) phone field.
export function looksLikePhone(v: string | null | undefined): v is string {
  return !!v && v.replace(/\D/g, "").length >= 9;
}
