import { ArrowUpRight, ArrowDownRight } from "lucide-react";

/* Pure Server Component — hover via CSS .crm-stat-card:hover (no JS handlers) */
export function StatCard({
  icon: Icon,
  label,
  value,
  gradient,
  trend,
  sub,
  href,
}: {
  icon: React.FC<{ size?: number; color?: string }>;
  label: string;
  value: string;
  gradient: string;
  trend: { label: string; up: boolean } | null;
  sub: string;
  href?: string;
}) {
  const inner = (
    <div className="crm-card crm-stat-card animate-fade-in" style={{ padding: "20px", position: "relative", overflow: "hidden" }}>
      {/* Background circle */}
      <div
        className={`${gradient} stat-card-bg`}
        style={{
          position: "absolute",
          top: -12,
          right: -12,
          width: 72,
          height: 72,
          borderRadius: "50%",
          opacity: 0.12,
          pointerEvents: "none",
          transition: "transform 0.5s ease, opacity 0.4s ease",
        }}
      />
      {/* Icon badge */}
      <div
        className={`${gradient} stat-card-icon`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 40,
          height: 40,
          borderRadius: 10,
          marginBottom: 12,
          transition: "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        <Icon size={18} color="#fff" />
      </div>

      <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <div
        className="stat-card-value"
        style={{
          fontSize: 26,
          fontWeight: 800,
          color: "var(--text)",
          lineHeight: 1,
          letterSpacing: "-0.02em",
          transition: "transform 0.3s ease",
        }}
      >
        {value}
      </div>
      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
        {trend ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              fontSize: 11.5,
              fontWeight: 600,
              color: trend.up ? "#10b981" : "#ef4444",
            }}
          >
            {trend.up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {trend.label}
          </span>
        ) : (
          <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{sub}</span>
        )}
      </div>
    </div>
  );
  if (href) {
    return (
      <a href={href} style={{ textDecoration: "none", display: "block" }}>
        {inner}
      </a>
    );
  }
  return inner;
}
