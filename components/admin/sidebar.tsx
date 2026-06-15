"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Package, FolderTree, ShoppingCart, Users,
  FileText, Newspaper, Image, Settings, Filter, UserCog,
  Ruler, DollarSign, Globe, MessageSquare, Briefcase, Star,
  FileSpreadsheet, ChevronDown, LogOut, Zap,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useState, Fragment } from "react";
import { CatalogNav, type CatalogRoot } from "./catalog-nav";

const navGroups = [
  {
    label: "Головне",
    items: [
      { href: "/", label: "Дашборд", icon: LayoutDashboard },
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
      { href: "/price", label: "Прайс (імпорт/експорт)", icon: FileSpreadsheet },
    ],
  },
];

export function Sidebar({ catalogRoots }: { catalogRoots?: CatalogRoot[] }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<string[]>([]);

  const toggleGroup = (label: string) => {
    setCollapsed((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-gray-50 fixed left-0 top-0 z-30">
      <div className="flex items-center gap-2 border-b px-4 py-4 bg-white">
        <Zap className="h-6 w-6 text-blue-600" />
        <span className="font-bold text-lg">Zipper CRM</span>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {navGroups.map((group) => {
          const isCollapsed = collapsed.includes(group.label);
          return (
            <div key={group.label} className="mb-1">
              <button
                onClick={() => toggleGroup(group.label)}
                className="flex w-full items-center justify-between px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-700"
              >
                {group.label}
                <ChevronDown className={cn("h-3 w-3 transition-transform", isCollapsed && "-rotate-90")} />
              </button>
              {!isCollapsed && (
                <div>
                  {group.items.map(({ href, label, icon: Icon }) => {
                    const active = pathname === href || (href !== "/" && pathname.startsWith(href));
                    return (
                      <Fragment key={href}>
                        <Link
                          href={href}
                          className={cn(
                            "flex items-center gap-3 px-4 py-2 text-sm transition-colors",
                            active
                              ? "bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-600"
                              : "text-gray-700 hover:bg-gray-100"
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          {label}
                        </Link>
                        {href === "/products" && catalogRoots && catalogRoots.length > 0 && (
                          <CatalogNav roots={catalogRoots} />
                        )}
                      </Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t p-4">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex w-full items-center gap-2 text-sm text-gray-600 hover:text-red-600 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Вийти
        </button>
      </div>
    </aside>
  );
}
