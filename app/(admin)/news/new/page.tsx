import { Header } from "@/components/admin/header";
import { NewsForm } from "../news-form";

export default function NewNewsPage() {
  return (
    <>
      <Header title="Нова новина" />
      <NewsForm />
    </>
  );
}
