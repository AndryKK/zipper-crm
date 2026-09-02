"use client";

// Shared by /inventory and /inventory/low-stock — both filter out
// never-manually-entered positions (initial_quantity === 0, see
// scripts/add-orders-item-active-column.sql's sibling comment in
// app/api/inventory/route.ts) via the same "Не відображати не введені
// позиції" toggle, persisted under this one key so the preference carries
// over between the two pages instead of resetting per-page.
export const HIDE_UNENTERED_KEY = "inventory-hide-unentered";
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 9, cursor: "pointer", userSelect: "none" }}>
      <span
        onClick={() => onChange(!checked)}
        style={{
          width: 36, height: 21, borderRadius: 999, flexShrink: 0, position: "relative",
          background: checked ? "var(--accent)" : "var(--border)",
          transition: "background 0.15s ease",
        }}
      >
        <span
          style={{
            position: "absolute", top: 2, left: checked ? 17 : 2,
            width: 17, height: 17, borderRadius: "50%", background: "#fff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.3)", transition: "left 0.15s ease",
          }}
        />
      </span>
      <span style={{ fontSize: 13, color: "var(--text)" }}>{label}</span>
    </label>
  );
}
