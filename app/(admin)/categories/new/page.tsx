import { Header } from "@/components/admin/header";
import { prisma } from "@/lib/db";
import { CategoryForm } from "../category-form";

export const dynamic = "force-dynamic";

export default async function NewCategoryPage() {
  const parentCategories = await prisma.category.findMany({
    where: { lang: "uk", pid: 0 },
    orderBy: { title: "asc" },
  });
  return (
    <>
      <Header title="Нова категорія" />
      <CategoryForm parentCategories={parentCategories} />
    </>
  );
}
