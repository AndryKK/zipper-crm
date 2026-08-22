// Frontend-only heuristic for catching common email typos (popular-provider
// domain misspellings, stray whitespace, disallowed characters) before an
// order confirmation/invoice email is sent to a bad address. Never applies a
// fix on its own — callers must only use `suggestion` after an explicit user
// click (see the "виправити допущену помилку" button in orders/[id]/page.tsx).

const KNOWN_DOMAINS = [
  "gmail.com", "ukr.net", "i.ua", "meta.ua", "outlook.com", "hotmail.com",
  "yahoo.com", "icloud.com", "bigmir.net", "email.ua", "ex.ua", "mail.ru",
  "bk.ru", "list.ru", "inbox.ru", "rambler.ru", "protonmail.com", "gmx.com",
  "live.com", "msn.com", "aol.com", "zoho.com", "yandex.ua", "yandex.ru",
];

// Only mappings that are never themselves valid TLDs, so a fix never
// clobbers a legitimately different (if unusual) domain.
const TLD_FIXES: [RegExp, string][] = [
  [/\.con$/, ".com"],
  [/\.ocm$/, ".com"],
  [/\.comm$/, ".com"],
];

const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

// Optimal string alignment distance — plain Levenshtein plus adjacent-
// transposition as a single edit, since "gmial.com"-style letter swaps are
// the single most common domain typo and plain Levenshtein scores them as
// distance 2 (delete + insert), missing them at a distance-1 threshold.
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[m][n];
}

export interface EmailCheckResult {
  hasError: boolean;
  reason: string | null;
  suggestion: string | null;
}

const NO_ERROR: EmailCheckResult = { hasError: false, reason: null, suggestion: null };

export function checkEmailForMistakes(raw: string): EmailCheckResult {
  const original = raw ?? "";
  if (!original.trim()) return NO_ERROR;

  // 1. Whitespace anywhere in the address (leading/trailing/internal) —
  // an email can never legitimately contain one.
  if (/\s/.test(original)) {
    const stripped = original.replace(/\s+/g, "");
    if (EMAIL_RE.test(stripped)) {
      return { hasError: true, reason: "В адресі є зайві пробіли", suggestion: stripped };
    }
  }

  const trimmed = original.trim();
  const atCount = (trimmed.match(/@/g) || []).length;

  // 2. Disallowed characters — strip them and see if what's left validates.
  if (!EMAIL_RE.test(trimmed) && atCount === 1) {
    const [local, domain] = trimmed.split("@");
    const cleanLocal = local.replace(/[^A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]/g, "");
    const cleanDomain = domain
      .replace(/[^A-Za-z0-9.-]/g, "")
      .replace(/\.{2,}/g, ".")
      .replace(/^\.+|\.+$/g, "");
    const candidate = `${cleanLocal}@${cleanDomain}`;
    if (candidate !== trimmed && EMAIL_RE.test(candidate)) {
      return { hasError: true, reason: "В адресі є неприпустимі символи", suggestion: candidate };
    }
  }

  if (atCount !== 1) return NO_ERROR;

  const [local, domainRaw] = trimmed.split("@");
  const domain = domainRaw.toLowerCase();

  // 3. Doubled-up TLD typos ("gmail.con", "gmail.comm", ...).
  for (const [re, fix] of TLD_FIXES) {
    if (re.test(domain)) {
      const fixedDomain = domain.replace(re, fix);
      const candidate = `${local}@${fixedDomain}`;
      if (fixedDomain !== domain && EMAIL_RE.test(candidate)) {
        return { hasError: true, reason: `Схоже, домен "${domain}" містить помилку`, suggestion: candidate };
      }
    }
  }

  // 4. Stray double dot in the domain ("gmail..com").
  if (domain.includes("..")) {
    const fixedDomain = domain.replace(/\.{2,}/g, ".");
    return { hasError: true, reason: "В домені є зайва крапка", suggestion: `${local}@${fixedDomain}` };
  }

  // 5. One-letter-off from a well-known provider domain — the classic
  // "gmial.com" / "gmail.co" / "gnail.com" slip.
  if (!KNOWN_DOMAINS.includes(domain)) {
    let best: { domain: string; dist: number } | null = null;
    for (const known of KNOWN_DOMAINS) {
      const dist = levenshtein(domain, known);
      if (dist === 1 && (!best || dist < best.dist)) best = { domain: known, dist };
    }
    if (best) {
      return {
        hasError: true,
        reason: `Можливо, малось на увазі "${best.domain}"`,
        suggestion: `${local}@${best.domain}`,
      };
    }
  }

  return NO_ERROR;
}
