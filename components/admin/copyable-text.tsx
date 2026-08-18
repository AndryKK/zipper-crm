"use client";
import { toast } from "sonner";

// Click-to-copy for short identifiers (артикул, ttn, etc.) — a generic
// wrapper so any table cell can get this behavior without each page
// re-implementing its own clipboard/toast logic.
export function CopyableText({
  value,
  className,
  style,
}: {
  value: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Скопійовано!");
    } catch {
      toast.error("Не вдалося скопіювати");
    }
  }

  return (
    <span onClick={copy} className={className} style={{ cursor: "pointer", ...style }} title="Копіювати">
      {value}
    </span>
  );
}
