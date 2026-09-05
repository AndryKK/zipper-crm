"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { User, ChevronRight, ArrowLeft } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

interface HeaderProps {
  // ReactNode (not just string) so a caller can show different content per
  // breakpoint — e.g. the order page shows just "#20820" on a phone and
  // "Замовлення #20820" from `sm` up, via its own responsive spans.
  title: React.ReactNode;
  subtitle?: string;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  // Renders a "← Назад..." link to the left of the title, in the header bar
  // itself — for a page reached from exactly one place (e.g. an order's
  // Viber-messages page, only ever opened from that order), rather than a
  // whole breadcrumb trail. Was previously its own row below the header on
  // that page; moved up here on request so it sits next to the title.
  backHref?: string;
  backLabel?: string;
}

export function Header({ title, subtitle, actions, breadcrumbs, backHref, backLabel = "Назад" }: HeaderProps) {
  const { data: session } = useSession();

  return (
    <header
      // Left padding is a Tailwind class, not part of the inline shorthand,
      // specifically so it can be wider on phone/tablet — the fixed
      // hamburger button in Sidebar.tsx (top:14,left:14, ~38px wide) sits
      // in this same top-left corner below `lg`, and would otherwise
      // overlap the title text.
      className="pl-16 lg:pl-7"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingTop: 14,
        paddingRight: 28,
        paddingBottom: 14,
        background: "var(--bg-card)",
        borderBottom: "1px solid var(--border)",
        position: "sticky",
        top: 0,
        zIndex: 20,
        gap: 16,
        flexShrink: 0,
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 12 }}>
        {backHref && (
          <Link
            href={backHref}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
            style={{ cursor: "pointer", flexShrink: 0 }}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{backLabel}</span>
          </Link>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginBottom: 4,
              fontSize: 11.5,
              color: "var(--text-muted)",
            }}
          >
            {breadcrumbs.map((b, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {i > 0 && <ChevronRight size={10} />}
                {b.href ? (
                  <a href={b.href} style={{ color: "var(--accent)", textDecoration: "none" }}>
                    {b.label}
                  </a>
                ) : (
                  <span>{b.label}</span>
                )}
              </span>
            ))}
          </div>
        )}
        {/* Single line + ellipsis, not wrap — on a narrow phone with a
            wide actions/theme/user cluster on the right, a long title had
            almost no width left and wrapped to 3 cramped lines that
            visually ran into the actions next to it (measured live: 76px
            wide for "Замовлення #20807" on a 375px screen). Truncating
            keeps the header a predictable single-line height everywhere;
            the full title is still on the page below in every case here. */}
        <h1
          className="text-[15px] sm:text-[18px]"
          style={{
            fontWeight: 700,
            color: "var(--text)",
            lineHeight: 1.2,
            margin: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "2px 0 0" }}>
            {subtitle}
          </p>
        )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {actions && <div style={{ display: "flex", gap: 8 }}>{actions}</div>}

        <ThemeToggle />

        {/* Name text and horizontal padding drop below `sm` — on the
            narrowest phones (iPhone SE etc.), this pill plus the theme
            toggle plus any page actions left almost no room for the page
            title, forcing it into an aggressively wrapped, near-1-char-wide
            column (measured live: an 84px-tall 3-line wrap for
            "Замовлення #20807" on a 375px screen). The avatar alone is
            enough to show "you're logged in" at a glance on mobile. */}
        <div
          className="px-1.5 sm:px-3"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            paddingTop: 6,
            paddingBottom: 6,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12.5,
            color: "var(--text-muted)",
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <User size={12} color="#fff" />
          </div>
          <span className="hidden sm:inline" style={{ fontWeight: 500 }}>{session?.user?.name ?? "Адмін"}</span>
        </div>
      </div>
    </header>
  );
}
