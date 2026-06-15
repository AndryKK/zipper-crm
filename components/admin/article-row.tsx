"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import type { Article } from "@/app/generated/prisma";
import { formatDate } from "@/lib/utils";

type ArticleRowProps = {
  article: Article;
};

export function ArticleRow({ article }: ArticleRowProps) {
  const router = useRouter();

  const handleDelete = async () => {
    if (!confirm("Видалити?")) return;
    await fetch(`/api/articles/${article.id}`, { method: "DELETE" });
    router.refresh();
  };

  return (
    <tr key={article.id} className="border-t hover:bg-gray-50">
      <td className="px-4 py-2.5">
        {article.img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/img/upload-files/articles/${article.img}`} alt="" className="h-10 w-10 rounded object-cover" />
        ) : (
          <div className="h-10 w-10 rounded bg-gray-100" />
        )}
      </td>
      <td className="px-4 py-2.5 font-medium">{article.title}</td>
      <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{article.uri}</td>
      <td className="px-4 py-2.5 text-gray-500">{formatDate(article.data)}</td>
      <td className="px-4 py-2.5">
        <div className="flex justify-end gap-1">
          <Link href={`/articles/${article.id}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <button
            className="inline-flex items-center justify-center h-8 w-8 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50"
            onClick={handleDelete}
            type="button"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}
