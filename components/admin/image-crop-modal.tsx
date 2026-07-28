"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";

const OUTPUT_SIZE = 300;
const DISPLAY_MAX = 440;

interface Props {
  file: File;
  onCancel: () => void;
  onConfirm: (thumbBlob: Blob) => void;
  // Shown in the modal title so a multi-file gallery upload can tell the
  // admin which photo (of how many) they're currently placing the crop on.
  label?: string;
}

// Manual square crop-frame picker: drag to move, drag the corner handle to
// resize (kept 1:1 so the output is always exactly a square, matching the
// 300x300 thumbnail the storefront's product cards actually use). Runs
// entirely client-side via <canvas> — no server-side image library needed,
// the same PutObject call already used for uploads just gets a second,
// smaller Blob alongside the untouched original.
export function ImageCropModal({ file, onCancel, onConfirm, label }: Props) {
  const imgUrl = useMemo(() => URL.createObjectURL(file), [file]);
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [display, setDisplay] = useState({ width: 0, height: 0 });
  // Selection box in DISPLAY pixel space (top-left corner + side length).
  const [box, setBox] = useState({ x: 0, y: 0, size: 0 });
  const [processing, setProcessing] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ mode: "move" | "resize"; startX: number; startY: number; box: typeof box } | null>(null);

  useEffect(() => () => URL.revokeObjectURL(imgUrl), [imgUrl]);

  function onImgLoad() {
    const el = imgRef.current;
    if (!el) return;
    const nW = el.naturalWidth, nH = el.naturalHeight;
    const scale = Math.min(1, DISPLAY_MAX / Math.max(nW, nH));
    const dW = Math.round(nW * scale), dH = Math.round(nH * scale);
    setNatural({ width: nW, height: nH });
    setDisplay({ width: dW, height: dH });
    const size = Math.min(dW, dH);
    setBox({ x: (dW - size) / 2, y: (dH - size) / 2, size });
  }

  function clampBox(next: { x: number; y: number; size: number }) {
    const size = Math.max(24, Math.min(next.size, display.width, display.height));
    const x = Math.max(0, Math.min(next.x, display.width - size));
    const y = Math.max(0, Math.min(next.y, display.height - size));
    return { x, y, size };
  }

  function startDrag(mode: "move" | "resize", e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, box };
  }

  function onDrag(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (d.mode === "move") {
      setBox(clampBox({ x: d.box.x + dx, y: d.box.y + dy, size: d.box.size }));
    } else {
      // Resize from the bottom-right handle — grow/shrink by the larger of
      // the two axis deltas so the box always stays square underneath the
      // cursor instead of stretching.
      const delta = Math.max(dx, dy);
      setBox(clampBox({ x: d.box.x, y: d.box.y, size: d.box.size + delta }));
    }
  }

  function endDrag() {
    dragRef.current = null;
  }

  async function confirm() {
    if (!imgRef.current || !natural.width) return;
    setProcessing(true);
    try {
      const scale = natural.width / display.width;
      const sx = box.x * scale;
      const sy = box.y * scale;
      const ssize = box.size * scale;

      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(imgRef.current, sx, sy, ssize, ssize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
      if (blob) onConfirm(blob);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 14, padding: "22px 26px", width: "fit-content", maxWidth: "95vw", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--text)" }}>
            Обрізати фото для картки{label ? ` — ${label}` : ""}
          </h3>
          <button type="button" onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
            <X size={18} />
          </button>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 14px" }}>
          Перетягніть рамку, щоб обрати область — вона буде обрізана й зменшена до {OUTPUT_SIZE}×{OUTPUT_SIZE}px для картки товару. Повний оригінал зберігається окремо, без обрізки.
        </p>

        {imgUrl && (
          <div
            style={{ position: "relative", width: display.width || undefined, height: display.height || undefined, userSelect: "none", touchAction: "none", background: "var(--bg-secondary)", borderRadius: 8, overflow: "hidden" }}
            onPointerMove={onDrag}
            onPointerUp={endDrag}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={imgUrl}
              alt=""
              onLoad={onImgLoad}
              draggable={false}
              style={{ display: "block", width: display.width || "auto", height: display.height || "auto", maxWidth: DISPLAY_MAX }}
            />
            {display.width > 0 && (
              <>
                {/* Dim everything outside the selection */}
                <div style={{ position: "absolute", inset: 0, boxShadow: `0 0 0 9999px rgba(0,0,0,0.5)`, clipPath: `inset(0)`, pointerEvents: "none" }} />
                <div
                  onPointerDown={(e) => startDrag("move", e)}
                  style={{
                    position: "absolute", left: box.x, top: box.y, width: box.size, height: box.size,
                    border: "2px solid #fff", boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
                    cursor: "move", boxSizing: "border-box",
                  }}
                >
                  <div
                    onPointerDown={(e) => startDrag("resize", e)}
                    style={{
                      position: "absolute", right: -7, bottom: -7, width: 16, height: 16,
                      borderRadius: "50%", background: "#fff", border: "2px solid #6366f1",
                      cursor: "nwse-resize",
                    }}
                  />
                </div>
              </>
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button
            type="button" onClick={onCancel}
            style={{ fontSize: 13, padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", cursor: "pointer" }}
          >
            Скасувати
          </button>
          <button
            type="button" onClick={confirm} disabled={processing || !display.width}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              fontSize: 13, padding: "8px 18px", borderRadius: 8, border: "none",
              background: "#6366f1", color: "#fff", fontWeight: 600,
              cursor: processing ? "wait" : "pointer", opacity: processing || !display.width ? 0.7 : 1,
            }}
          >
            {processing && <Loader2 size={14} className="animate-spin" />}
            Зберегти фото
          </button>
        </div>
      </div>
    </div>
  );
}
