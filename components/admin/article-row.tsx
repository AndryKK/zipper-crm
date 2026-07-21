"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/utils";

export function ArticleRow({ article }: { article: any }) {
  const router = useRouter();

  const handleDelete = async () => {
    if (!confirm("Видалити?")) return;
    await fetch(`/api/articles/${article.id}`, { method: "DELETE" });
    router.refresh();
  };

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
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
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
        </div>
      </td>
    </tr>
  );
}
