"use client";
import { useState, useRef, useEffect } from "react";
import { Languages, Loader2, CheckCircle2, XCircle, X } from "lucide-react";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";

type Status = "idle" | "running" | "done" | "error";

interface Progress {
  translated: number;
  total: number;
  errors: number;
  message?: string;
}

export function TranslateButton() {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState<Progress>({ translated: 0, total: 0, errors: 0 });
  const [showModal, setShowModal] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);

  useEffect(() => {
    // Перевірити наявність API ключа
    fetch("/api/translate-descriptions")
      .then((r) => r.json())
      .then((d) => setHasKey(d.hasKey))
      .catch(() => setHasKey(false));
  }, []);

  async function startTranslation() {
    setStatus("running");
    setProgress({ translated: 0, total: 0, errors: 0 });
    setShowModal(true);

    try {
      const res = await fetch("/api/translate-descriptions", { method: "POST" });
      if (!res.body) throw new Error("Немає тіла відповіді");

      const reader = res.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          if (!part.startsWith("data:")) continue;
          try {
            const data = JSON.parse(part.slice(5).trim());

            if (data.type === "start") {
              setProgress({ translated: 0, total: data.total, errors: 0 });
            } else if (data.type === "progress") {
              setProgress({ translated: data.translated, total: data.total, errors: data.errors });
            } else if (data.type === "done") {
              setProgress({ translated: data.translated, total: data.total, errors: data.errors });
              setStatus("done");
            } else if (data.type === "error") {
              setProgress((p) => ({ ...p, message: data.message }));
              setStatus("error");
            }
          } catch {}
        }
      }
    } catch (e: any) {
      setProgress((p) => ({ ...p, message: e?.message }));
      setStatus("error");
    }
  }

  function stop() {
    readerRef.current?.cancel();
    setStatus("idle");
    setShowModal(false);
  }

  if (hasKey === null) return null;

  const pct = progress.total > 0 ? Math.round((progress.translated / progress.total) * 100) : 0;

  return (
    <>
      <button
        onClick={() => (status === "running" ? setShowModal(true) : setShowConfirm(true))}
        disabled={!hasKey || status === "running"}
        title={!hasKey ? "OPENAI_API_KEY не налаштований у .env.local" : "Перекласти повні описи товарів (UK) з російської на українську"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 16px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: hasKey ? "var(--bg)" : "var(--bg-secondary)",
          color: hasKey ? "var(--text)" : "var(--text-muted)",
          cursor: hasKey && status !== "running" ? "pointer" : "not-allowed",
          fontSize: 13,
          fontWeight: 500,
          transition: "all 0.15s",
          opacity: !hasKey ? 0.6 : 1,
        }}
      >
        {status === "running" ? (
          <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
        ) : status === "done" ? (
          <CheckCircle2 size={15} style={{ color: "#10b981" }} />
        ) : status === "error" ? (
          <XCircle size={15} style={{ color: "#ef4444" }} />
        ) : (
          <Languages size={15} />
        )}
        {status === "running"
          ? `Переклад... ${progress.translated}/${progress.total}`
          : status === "done"
          ? `Перекладено ${progress.translated} товарів`
          : status === "error"
          ? "Помилка перекладу"
          : "Перекласти описи (RU→UA)"}
      </button>

      {/* Modal progress overlay */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: "var(--bg, #fff)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "28px 32px",
              minWidth: 360,
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {status === "running" ? (
                  <Loader2 size={20} style={{ color: "#6366f1", animation: "spin 1s linear infinite" }} />
                ) : status === "done" ? (
                  <CheckCircle2 size={20} style={{ color: "#10b981" }} />
                ) : (
                  <XCircle size={20} style={{ color: "#ef4444" }} />
                )}
                <span style={{ fontWeight: 700, fontSize: 16 }}>
                  {status === "running" ? "Переклад триває..." : status === "done" ? "Переклад завершено" : "Помилка"}
                </span>
              </div>
              <button
                onClick={stop}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4 }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Progress bar */}
            {progress.total > 0 && (
              <>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6, color: "var(--text-muted)" }}>
                    <span>{progress.translated} з {progress.total} товарів</span>
                    <span>{pct}%</span>
                  </div>
                  <div style={{ height: 8, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${pct}%`,
                        background: status === "done" ? "#10b981" : "#6366f1",
                        borderRadius: 4,
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                </div>
                {progress.errors > 0 && (
                  <p style={{ fontSize: 12, color: "#ef4444", margin: "8px 0 0" }}>
                    Помилок: {progress.errors}
                  </p>
                )}
              </>
            )}

            {progress.message && (
              <p style={{ fontSize: 13, color: status === "error" ? "#ef4444" : "var(--text-muted)", marginTop: 10, wordBreak: "break-word" }}>
                {progress.message}
              </p>
            )}

            {(status === "done" || status === "error") && (
              <button
                onClick={() => { setShowModal(false); if (status === "done") setStatus("idle"); }}
                style={{
                  marginTop: 16,
                  width: "100%",
                  padding: "8px 0",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--bg-secondary)",
                  color: "var(--text)",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                Закрити
              </button>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {showConfirm && (
        <ConfirmDialog
          message="Перекласти описи ВСІХ товарів (RU→UA)?"
          subMessage="Буде перекладено Повний опис та Короткий опис усіх товарів lang=uk (включаючи кольорові варіанти). Дія перезапише поточні тексти в базі."
          confirmLabel="Перекласти"
          onConfirm={startTranslation}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}
