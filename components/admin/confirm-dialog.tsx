"use client";
import { AlertTriangle, Trash2 } from "lucide-react";

interface ConfirmDialogProps {
  message: string;
  subMessage?: string;
  destructive?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  message,
  subMessage,
  destructive,
  confirmLabel = "Підтвердити",
  cancelLabel = "Скасувати",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        style={{
          background: "var(--bg)", border: "1px solid var(--border)",
          borderRadius: 14, padding: "24px 28px", width: 420,
          boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
        }}
      >
        <div style={{ display: "flex", gap: 12, marginBottom: subMessage ? 10 : 20 }}>
          {destructive ? (
            <Trash2 size={20} style={{ color: "#ef4444", flexShrink: 0, marginTop: 2 }} />
          ) : (
            <AlertTriangle size={20} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 2 }} />
          )}
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", margin: 0, lineHeight: 1.45 }}>
            {message}
          </p>
        </div>
        {subMessage && (
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 20px", paddingLeft: 32, lineHeight: 1.5 }}>
            {subMessage}
          </p>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              fontSize: 13, padding: "8px 20px", borderRadius: 8,
              border: "1px solid var(--border)", background: "var(--bg)",
              color: "var(--text)", cursor: "pointer",
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => { onConfirm(); onCancel(); }}
            style={{
              fontSize: 13, padding: "8px 20px", borderRadius: 8, border: "none",
              background: destructive ? "#ef4444" : "#6366f1",
              color: "#fff", cursor: "pointer", fontWeight: 600,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
