import { Header } from "@/components/admin/header";
import { ServiceForm } from "../service-form";

export default function NewServicePage() {
  return (
    <>
      <Header title="Нова послуга" />
      <ServiceForm />
    </>
  );
}
