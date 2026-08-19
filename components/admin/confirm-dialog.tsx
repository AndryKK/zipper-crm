"use client";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
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

// Built on Radix's AlertDialog primitive — NOT a plain createPortal(...,
// document.body) div, which was the previous fix and still wasn't enough
// (confirmed by report: the "Прибрати з замовлення" confirm, opened from
// *inside* the stock-check popup — itself a Radix Dialog — was still
// unclickable/hidden after that fix shipped). A portal alone gets the
// element to the right place in the DOM and gives it the right paint
// order, but Radix's Dialog also runs a focus-trap/dismissable-layer that
// only knows about *other Radix layers* — a foreign div isn't one, so the
// outer Dialog kept intercepting pointer events meant for it regardless of
// z-index. AlertDialog shares Dialog's own layer registry, so nesting one
// inside the other is Radix's own supported, tested pattern instead of
// something being fought against with z-index numbers.
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
    <AlertDialogPrimitive.Root open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay
          style={{
            position: "fixed", inset: 0, zIndex: 10000,
            background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <AlertDialogPrimitive.Content
            // Same opt-out as components/ui/dialog.tsx's DialogContent —
            // when subMessage is omitted there's no Description element
            // below for Radix to wire up, and it otherwise logs a "Missing
            // Description" warning on every open. Omitted (left to Radix's
            // own default wiring) whenever a real Description does exist.
            {...(!subMessage ? { "aria-describedby": undefined } : {})}
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
              <AlertDialogPrimitive.Title asChild>
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", margin: 0, lineHeight: 1.45 }}>
                  {message}
                </p>
              </AlertDialogPrimitive.Title>
            </div>
            {subMessage && (
              <AlertDialogPrimitive.Description asChild>
                <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 20px", paddingLeft: 32, lineHeight: 1.5 }}>
                  {subMessage}
                </p>
              </AlertDialogPrimitive.Description>
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
          </AlertDialogPrimitive.Content>
        </AlertDialogPrimitive.Overlay>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
