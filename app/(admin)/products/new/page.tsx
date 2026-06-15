import { Header } from "@/components/admin/header";
import { prisma } from "@/lib/db";
import { ProductForm } from "../product-form";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const [categories, measures, filters, langs] = await Promise.all([
    prisma.category.findMany({ where: { lang: "uk" }, orderBy: { title: "asc" } }),
    prisma.measure.findMany({ where: { lang: "uk" }, orderBy: { title: "asc" } }),
    prisma.allFilter.findMany({
      where: { lang: "uk" },
      include: { filters: { where: { lang: "uk" }, orderBy: { priority: "asc" } } },
      orderBy: { priority: "asc" },
    }),
    prisma.lang.findMany({ where: { active: 1 }, orderBy: { priority: "asc" } }),
  ]);

  return (
    <>
      <Header title="Новий товар" />
      <ProductForm
        categories={categories}
        measures={measures}
        filters={filters}
        langs={langs}
        mode="create"
      />
    </>
  );
}
