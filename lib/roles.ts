// Role-based access control — read this before touching page/route access
// anywhere in the CRM. A role lives in adm_users.role (see
// scripts/add-adm-users-role-column.sql) and rides along on the session's
// JWT (see lib/auth.config.ts's jwt/session callbacks), so both proxy.ts
// (server-side page/API gating) and the Sidebar (client-side nav
// filtering) read it from the same place.

export const ROLES = {
  SUPERADMIN: "superadmin",
  WAREHOUSE_ADMIN: "warehouse_admin",
  INVENTORY_ADMIN: "inventory_admin",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Суперадмін",
  warehouse_admin: "Адміністратор складу",
  inventory_admin: "Адміністратор переобліку",
};

// Path prefixes (page AND matching /api/ routes together, since a page and
// the data it fetches always share a name here — /orders the page needs
// /api/orders the route) each non-superadmin role may reach, beyond "/"
// (the dashboard), which every logged-in role can always see regardless of
// role — see isPathAllowed below.
const ROLE_ALLOWED_PREFIXES: Record<string, string[]> = {
  [ROLES.WAREHOUSE_ADMIN]: ["/orders", "/api/orders", "/returns", "/api/returns", "/products", "/api/products"],
  [ROLES.INVENTORY_ADMIN]: ["/warehouses", "/api/warehouses", "/inventory", "/api/inventory", "/products", "/api/products"],
};

// Login that can never have its own role changed by anyone (including
// other superadmins) — the always-works fallback account so a mistake
// elsewhere in this system (e.g. every other superadmin's role edited by
// accident) can never fully lock everyone out of /adm-users.
export const PROTECTED_LOGIN = "avian";

export function isPathAllowed(role: string | null | undefined, pathname: string): boolean {
  if (role === ROLES.SUPERADMIN) return true;
  if (pathname === "/") return true;
  // A missing role means either a logged-out visitor (handled earlier in
  // proxy.ts, never reaches here) or a session JWT minted before this
  // role system existed — deny by default rather than treat it as
  // unrestricted access. The fix for a real user hitting this is to log
  // out and back in so the JWT picks up their current role.
  if (!role) return false;
  const prefixes = ROLE_ALLOWED_PREFIXES[role];
  if (!prefixes) return false; // unrecognized role — deny by default, not allow
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
