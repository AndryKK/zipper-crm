import { Header } from "@/components/admin/header";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { ProductForm } from "../product-form";

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [product, categories, measures, filters, langs] = await Promise.all([
    prisma.product.findUnique({
      where: { id: parseInt(id) },
      include: {
        categories: true,
        photos: { orderBy: { priority: "asc" } },
        photos2: { orderBy: { priority: "asc" } },
        chars: { orderBy: { priority: "asc" } },
        colors: { include: { productWith: { select: { id: true, title: true, img: true } } } },
        together: { include: { productWith: { select: { id: true, title: true, img: true } } } },
      },
    }),
    prisma.category.findMany({ where: { lang: "uk" }, orderBy: { title: "asc" } }),
    prisma.measure.findMany({ where: { lang: "uk" }, orderBy: { title: "asc" } }),
    prisma.allFilter.findMany({
      where: { lang: "uk" },
      include: { filters: { where: { lang: "uk" }, orderBy: { priority: "asc" } } },
      orderBy: { priority: "asc" },
    }),
    prisma.lang.findMany({ where: { active: 1 }, orderBy: { priority: "asc" } }),
  ]);

  if (!product) notFound();

  return (
    <>
      <Header title={`Редагувати: ${product.title}`} />
      <ProductForm
        product={product}
        categories={categories}
        measures={measures}
        filters={filters}
        langs={langs}
        mode="edit"
      />
    </>
  );
}
