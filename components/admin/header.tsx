"use client";

import { useSession } from "next-auth/react";
import { User, ChevronRight } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
}

export function Header({ title, subtitle, actions, breadcrumbs }: HeaderProps) {
  const { data: session } = useSession();

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 28px",
        background: "var(--bg-card)",
        borderBottom: "1px solid var(--border)",
        position: "sticky",
        top: 0,
        zIndex: 20,
        gap: 16,
        flexShrink: 0,
      }}
    >
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
        <h1
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "var(--text)",
            lineHeight: 1.2,
            margin: 0,
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

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {actions && <div style={{ display: "flex", gap: 8 }}>{actions}</div>}

        <ThemeToggle />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
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
            }}
          >
            <User size={12} color="#fff" />
          </div>
          <span style={{ fontWeight: 500 }}>{session?.user?.name ?? "Адмін"}</span>
        </div>
      </div>
    </header>
  );
}
