import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { Header } from "@/components/admin/header";
import { NewsForm } from "../news-form";

export default async function EditNewsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const news = await prisma.news.findUnique({ where: { id: parseInt(id) } });
  if (!news) notFound();
  return (
    <>
      <Header title={news.title} />
      <NewsForm news={news} />
    </>
  );
}
