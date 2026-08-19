import { Header } from "@/components/admin/header";
import { supabaseServer } from "@/lib/supabase";
import { ProductForm } from "../product-form";
import { getFiltersWithChildren } from "@/lib/filters";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const [
    { data: categories },
    { data: measures },
    { data: langs },
  ] = await Promise.all([
    // Only id/pid/title/translationId are read by ProductForm's category
    // picker/cascade — this page is force-dynamic and re-fetches every
    // category on every "new product" visit, so trimming away seo_*/descr/
    // text/img etc. cuts real egress.
    supabaseServer.from("categories").select("id, pid, title, translationId:translation_id").eq("lang", "uk").order("title", { ascending: true }),
    supabaseServer.from("measures").select("*").eq("lang", "uk").order("title", { ascending: true }),
    supabaseServer.from("langs").select("*").eq("active", 1).order("priority", { ascending: true }),
  ]);

  const filtersWithChildren = await getFiltersWithChildren();

  return (
    <>
      <Header title="Новий товар" />
      <ProductForm
        categories={(categories || []) as any[]}
        measures={(measures || []) as any[]}
        filters={filtersWithChildren}
        langs={(langs || []) as any[]}
        mode="create"
      />
    </>
  );
}
