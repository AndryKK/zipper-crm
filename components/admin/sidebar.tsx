"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  LayoutDashboard, Package, FolderTree, ShoppingCart, Users,
  FileText, Newspaper, Image, Settings, Filter, UserCog,
  PackageCheck, DollarSign, Globe, MessageSquare, Briefcase, Star,
  FileSpreadsheet, ChevronDown, LogOut, Zap, Warehouse, Boxes,
  TrendingUp, RotateCcw, Menu, X, AlertTriangle,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useState, useEffect, Fragment as F } from "react";
import { CatalogNav, type CatalogRoot } from "./catalog-nav";
import { BusyOverlay } from "./busy-overlay";
import { isPathAllowed } from "@/lib/roles";
import { maybeCheckTtnStatus } from "@/lib/ttn-heartbeat-client";

const navGroups = [
  {
    label: "Головне",
    items: [
      { href: "/", label: "Дашборд", icon: LayoutDashboard },
    ],
  },
  {
    label: "Продажі",
    items: [
      { href: "/orders", label: "Замовлення", icon: ShoppingCart },
      { href: "/returns", label: "Повернення", icon: RotateCcw },
      { href: "/top-sales", label: "Топ продажів", icon: TrendingUp },
    ],
  },
  {
    label: "Каталог",
    items: [
      { href: "/products", label: "Товари", icon: Package },
      { href: "/categories", label: "Категорії", icon: FolderTree },
      { href: "/filters", label: "Фільтри", icon: Filter },
      { href: "/measures", label: "Статус товару", icon: PackageCheck },
    ],
  },
  {
    label: "Склад",
    items: [
      { href: "/warehouses", label: "Склади", icon: Warehouse },
      { href: "/inventory", label: "Залишки", icon: Boxes },
      { href: "/inventory/low-stock", label: "Під мінімумом", icon: AlertTriangle },
    ],
  },
  {
    label: "Клієнти",
    items: [
      { href: "/users", label: "Клієнти", icon: Users },
      { href: "/user-categories", label: "Ранги клієнтів", icon: Star },
    ],
  },
  {
    label: "Контент",
    items: [
      { href: "/articles", label: "Статті", icon: FileText },
      { href: "/news", label: "Новини", icon: Newspaper },
      { href: "/slider", label: "Слайдер", icon: Image },
      { href: "/services", label: "Послуги", icon: Briefcase },
      { href: "/managers", label: "Менеджери", icon: UserCog },
    ],
  },
  {
    label: "Система",
    items: [
      { href: "/settings", label: "Налаштування", icon: Settings },
      { href: "/custom-strings", label: "Тексти UI", icon: MessageSquare },
      { href: "/langs", label: "Мови", icon: Globe },
      { href: "/currency", label: "Валюти", icon: DollarSign },
      { href: "/adm-users", label: "Адміністратори", icon: UserCog },
      { href: "/price", label: "Прайс", icon: FileSpreadsheet },
    ],
  },
];

type SidebarCounts = { newOrders: number; awaitingShipment: number; newReturns: number };

// Small colored pill next to a nav item — green "+N" (new, last 7 days),
// blue "N" (awaiting shipment), red "+N" (new/unprocessed returns). Only
// rendered when the count is actually > 0, so a quiet week doesn't clutter
// the sidebar with "+0" badges everywhere.
function NavBadge({ count, color, prefix }: { count: number; color: string; prefix?: string }) {
  if (!count) return null;
  return (
    <span
      style={{
        fontSize: 10.5, fontWeight: 700, lineHeight: 1, padding: "2px 6px",
        borderRadius: 999, background: `${color}22`, color, flexShrink: 0,
      }}
    >
      {prefix}{count}
    </span>
  );
}

export function Sidebar({ catalogRoots, counts }: { catalogRoots?: CatalogRoot[]; counts?: SidebarCounts }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  // While the session is still resolving (status "loading"), don't filter
  // yet — isPathAllowed treats a missing role as "deny" (see lib/roles.ts),
  // which would otherwise flash a near-empty sidebar for a split second on
  // every load, even for superadmins.
  const visibleNavGroups = status === "loading"
    ? navGroups
    : navGroups
        .map((group) => ({
          ...group,
          items: group.items.filter(
            // "Адміністратори" (/adm-users) isn't a business-data page a
            // restricted role should ever see, even though it's not gated
            // via isPathAllowed's prefix list (there's no /adm-users-only
            // role) — it's superadmin-only by its own page/API logic, so
            // just hide the nav link outside superadmin.
            ({ href }) => isPathAllowed(role, href) && (href !== "/adm-users" || role === "superadmin")
          ),
        }))
        .filter((group) => group.items.length > 0);
  const [isNavigating, startNavigation] = useTransition();
  const [collapsed, setCollapsed] = useState<string[]>(["Контент", "Система"]);
  const [catalogNavOpen, setCatalogNavOpen] = useState(false);
  // Below `lg` (tablet/phone) the sidebar is an off-canvas drawer — fixed
  // position but translated fully off-screen until opened, so it never
  // reserves layout space (see the `main` margin in app/(admin)/layout.tsx,
  // which is 0 below `lg` for the same reason). At `lg` and up this state
  // is ignored entirely (CSS `lg:translate-x-0` always wins) and it's back
  // to the classic always-visible sidebar that pushes content over.
  const [mobileOpen, setMobileOpen] = useState(false);

  // Covers a direct/deep-link page open (e.g. an order URL pasted or
  // bookmarked) that never goes through navigate() below — see
  // lib/ttn-heartbeat-client.ts for the actual once-per-hour gating.
  useEffect(() => {
    maybeCheckTtnStatus();
  }, []);

  const toggleGroup = (label: string) => {
    setCollapsed((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  // Wrapping router.push in a transition gives us isNavigating for as long
  // as the destination page takes to render — Next.js doesn't otherwise
  // expose a "navigation in progress" signal, and without one nothing
  // stopped a manager from clicking elsewhere while a heavier page (e.g.
  // Товари, Замовлення) was still loading.
  //
  // router.refresh() alongside push is deliberate: shared layouts (this
  // Sidebar lives in app/(admin)/layout.tsx) are NOT refetched by Next's
  // client Router Cache on a plain soft navigation — only the page segment
  // that actually changed is. Without this, the badge counts (see
  // getSidebarCounts, tag "sidebar-counts") stayed frozen at whatever they
  // were on the last full page load no matter how many times an order/
  // return got processed elsewhere, since revalidateTag only invalidates
  // the *server* cache — nothing tells the already-mounted client layout to
  // ask for it again. This doesn't cost extra Supabase egress: refresh()
  // re-runs the layout's React Server render, but getSidebarCounts/
  // getSidebarCategories are still unstable_cache-backed underneath, so
  // Supabase is only actually hit when their cache is genuinely stale or
  // tag-invalidated — refresh() just makes sure that check happens.
  function navigate(href: string) {
    setMobileOpen(false);
    // Compared against pathname+search, not just pathname — usePathname()
    // excludes the query string, so "/products" and "/products?cat=0" both
    // read as "/products" here. Comparing against pathname alone meant
    // clicking "— всі товари" (href="/products") while already on
    // "/products?cat=0" silently no-opped: href === pathname was true, so
    // this returned before ever calling router.push, and the only way back
    // to the bare URL was to navigate elsewhere first.
    const currentUrl = searchParams.size ? `${pathname}?${searchParams.toString()}` : pathname;
    maybeCheckTtnStatus();
    if (href === currentUrl) return;
    startNavigation(() => {
      router.push(href);
      router.refresh();
    });
  }

  // Only intercept plain left-clicks — ctrl/cmd/shift/middle-click must
  // still open in a new tab/window like a normal link.
  function handleLinkClick(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    navigate(href);
  }

  return (
    <>
      {/* Mobile/tablet-only hamburger to open the drawer — only rendered
          while closed, since it sits in the same top-left corner the open
          drawer's own logo/close-button row occupies (see below); showing
          both at once would overlap. */}
      {!mobileOpen && (
        <button
          onClick={() => setMobileOpen(true)}
          // display must come from the className, not the inline style
          // below — an inline `display` always wins over a class-based
          // rule (including this one's own `lg:hidden`), which is exactly
          // why this stayed visible on desktop until now: the old inline
          // display:flex silently overrode lg:hidden's display:none.
          className="lg:hidden flex items-center justify-center"
          aria-label="Відкрити меню"
          style={{
            position: "fixed", top: 14, left: 14, zIndex: 60,
            width: 38, height: 38, borderRadius: 10,
            background: "var(--bg-card)", border: "1px solid var(--border)",
            color: "var(--text)", cursor: "pointer", boxShadow: "var(--shadow-card)",
          }}
        >
          <Menu size={18} />
        </button>
      )}

      {/* Backdrop — tap outside the open drawer to close it. */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="lg:hidden"
          style={{ position: "fixed", inset: 0, zIndex: 39, background: "rgba(0,0,0,0.5)" }}
        />
      )}

      <aside
        className={cn(
          "crm-sidebar transition-transform duration-200 ease-out lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
      {/* Logo */}
      <div className="crm-sidebar-logo">
        <div className="crm-sidebar-logo-icon">
          <Zap size={16} color="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>Zipper</div>
          <div style={{ fontSize: 10.5, fontWeight: 500, opacity: 0.5 }}>CRM</div>
        </div>
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden"
          aria-label="Закрити меню"
          style={{ background: "none", border: "none", color: "var(--text-sidebar)", cursor: "pointer", padding: 4 }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "8px 0", overflowY: "auto" }}>
        {visibleNavGroups.map((group) => {
          const isCollapsed = collapsed.includes(group.label);
          return (
            <div key={group.label} style={{ marginBottom: 2 }}>
              <button
                onClick={() => toggleGroup(group.label)}
                className="crm-sidebar-group-btn"
              >
                <span>{group.label}</span>
                <ChevronDown
                  size={10}
                  style={{
                    transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                    transition: "transform 0.2s",
                    flexShrink: 0,
                  }}
                />
              </button>

              {!isCollapsed && (
                <div>
                  {group.items.map(({ href, label, icon: Icon }) => {
                    const active = isActive(href);
                    const hasCatalogDropdown = href === "/products" && catalogRoots && catalogRoots.length > 0;
                    return (
                      <F key={href}>
                        {hasCatalogDropdown ? (
                          <Link
                            href={href}
                            onClick={(e) => {
                              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                              e.preventDefault();
                              setCatalogNavOpen((v) => !v);
                              navigate(href);
                            }}
                            className={cn("crm-sidebar-item", active && "crm-sidebar-item--active")}
                          >
                            <Icon size={15} style={{ flexShrink: 0 }} />
                            <span style={{ flex: 1 }}>{label}</span>
                            <ChevronDown
                              size={12}
                              style={{
                                flexShrink: 0,
                                transform: catalogNavOpen ? "rotate(0deg)" : "rotate(-90deg)",
                                transition: "transform 0.2s",
                                color: catalogNavOpen ? "#a5b4fc" : "rgba(148,163,184,0.45)",
                              }}
                            />
                          </Link>
                        ) : (
                          <Link
                            href={href}
                            onClick={(e) => handleLinkClick(e, href)}
                            className={cn("crm-sidebar-item", active && "crm-sidebar-item--active")}
                          >
                            <Icon size={15} style={{ flexShrink: 0 }} />
                            <span style={{ flex: 1 }}>{label}</span>
                            {href === "/orders" && counts && (
                              <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                                <NavBadge count={counts.newOrders} color="#22c55e" prefix="+" />
                                <NavBadge count={counts.awaitingShipment} color="#3b82f6" />
                              </span>
                            )}
                            {href === "/returns" && counts && (
                              <NavBadge count={counts.newReturns} color="#ef4444" prefix="+" />
                            )}
                          </Link>
                        )}
                        {hasCatalogDropdown && catalogNavOpen && (
                          <CatalogNav roots={catalogRoots!} onNavigate={navigate} />
                        )}
                      </F>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="crm-sidebar-footer">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="crm-sidebar-item crm-sidebar-item--logout"
          style={{ width: "100%", background: "none", border: "none", cursor: "pointer" }}
        >
          <LogOut size={15} />
          <span>Вийти</span>
        </button>
      </div>

      </aside>

      {/* Rendered as a sibling of <aside>, not inside it — the sidebar
          carries a CSS transform (the slide-in/out drawer classes above),
          and any transform on an ancestor creates a new containing block
          for position:fixed descendants, which silently confined this to
          the sidebar's own 248px-wide box instead of the full viewport. */}
      {isNavigating && <BusyOverlay />}
    </>
  );
}
