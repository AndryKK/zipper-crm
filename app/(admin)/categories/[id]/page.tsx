import { Header } from "@/components/admin/header";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { CategoryForm } from "../category-form";

export const dynamic = "force-dynamic";

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === "new";

  const [category, allCategories] = await Promise.all([
    isNew ? null : prisma.category.findUnique({ where: { id: parseInt(id) } }),
    prisma.category.findMany({ where: { lang: "uk", pid: 0 }, orderBy: { title: "asc" } }),
  ]);

  if (!isNew && !category) notFound();

  return (
    <>
      <Header title={isNew ? "Нова категорія" : `Редагувати: ${category!.title}`} />
      <CategoryForm category={category} parentCategories={allCategories} />
    </>
  );
}
