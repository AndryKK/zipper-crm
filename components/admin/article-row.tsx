"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ArticleRow({ article, variant = "row" }: { article: any; variant?: "row" | "card" }) {
  const router = useRouter();

  const handleDelete = async () => {
    if (!confirm("Видалити?")) return;
    await fetch(`/api/articles/${article.id}`, { method: "DELETE" });
    router.refresh();
  };

  const actions = (
    <>
      <Link href={`/articles/${article.id}`} className="btn-ghost" style={{ padding: "5px 8px" }}>
        <Pencil size={13} />
      </Link>
      <button
        className="btn-ghost"
        style={{ padding: "5px 8px", color: "var(--danger)" }}
        onClick={handleDelete}
        type="button"
      >
        <Trash2 size={13} />
      </button>
    </>
  );

  if (variant === "card") {
    return (
      <div className="crm-card" style={{ padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {article.img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={article.img} alt="" style={{ height: 44, width: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
          ) : (
            <div style={{ height: 44, width: 44, borderRadius: 8, background: "var(--bg)", flexShrink: 0 }} />
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 600, overflowWrap: "break-word" }}>{article.title}</div>
            {article.uri && (
              <div className="font-mono" style={{ fontSize: 11.5, color: "var(--text-muted)", overflowWrap: "break-word" }}>
                {article.uri}
              </div>
            )}
          </div>
        </div>
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)",
          }}
        >
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{formatDate(article.data)}</span>
          <div style={{ display: "flex", gap: 4 }}>{actions}</div>
        </div>
      </div>
    );
  }

  return (
    <tr>
      <td>
        {article.img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={article.img} alt="" style={{ height: 40, width: 40, borderRadius: 6, objectFit: "cover" }} />
        ) : (
          <div style={{ height: 40, width: 40, borderRadius: 6, background: "var(--bg)" }} />
        )}
      </td>
      <td style={{ fontWeight: 500 }}>{article.title}</td>
      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{article.uri}</td>
      <td>{formatDate(article.data)}</td>
      <td style={{ textAlign: "right" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>{actions}</div>
      </td>
    </tr>
  );
}
