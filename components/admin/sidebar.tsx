"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Package, FolderTree, ShoppingCart, Users,
  FileText, Newspaper, Image, Settings, Filter, UserCog,
  Ruler, DollarSign, Globe, MessageSquare, Briefcase, Star,
  FileSpreadsheet, ChevronDown, LogOut, Zap, Warehouse, Boxes,
  TrendingUp,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useState, Fragment as F } from "react";
import { CatalogNav, type CatalogRoot } from "./catalog-nav";

const navGroups = [
  {
    label: "Головне",
    items: [
      { href: "/", label: "Дашборд", icon: LayoutDashboard },
      { href: "/top-sales", label: "Топ продажів", icon: TrendingUp },
    ],
  },
  {
    label: "Каталог",
    items: [
      { href: "/products", label: "Товари", icon: Package },
      { href: "/categories", label: "Категорії", icon: FolderTree },
      { href: "/filters", label: "Фільтри", icon: Filter },
      { href: "/measures", label: "Одиниці виміру", icon: Ruler },
    ],
  },
  {
    label: "Склад",
    items: [
      { href: "/warehouses", label: "Склади", icon: Warehouse },
      { href: "/inventory", label: "Залишки", icon: Boxes },
    ],
  },
  {
    label: "Продажі",
    items: [
      { href: "/orders", label: "Замовлення", icon: ShoppingCart },
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

export function Sidebar({ catalogRoots }: { catalogRoots?: CatalogRoot[] }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<string[]>(["Контент", "Система"]);
  const [catalogNavOpen, setCatalogNavOpen] = useState(false);

  const toggleGroup = (label: string) => {
    setCollapsed((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="crm-sidebar">
      {/* Logo */}
      <div className="crm-sidebar-logo">
        <div className="crm-sidebar-logo-icon">
          <Zap size={16} color="#fff" />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>Zipper</div>
          <div style={{ fontSize: 10.5, fontWeight: 500, opacity: 0.5 }}>CRM</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "8px 0", overflowY: "auto" }}>
        {navGroups.map((group) => {
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
                            onClick={() => setCatalogNavOpen((v) => !v)}
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
                            className={cn("crm-sidebar-item", active && "crm-sidebar-item--active")}
                          >
                            <Icon size={15} style={{ flexShrink: 0 }} />
                            <span>{label}</span>
                          </Link>
                        )}
                        {hasCatalogDropdown && catalogNavOpen && (
                          <CatalogNav roots={catalogRoots!} />
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
  );
}
