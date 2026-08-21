"use client";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function WarehouseRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  // /warehouses used to have its own embedded, non-mobile-adapted
  // per-warehouse inventory tab at ?tab=<id> — replaced by linking
  // straight to /inventory (which already has a real mobile layout), so
  // this legacy /warehouses/<id> link now lands there instead.
  useEffect(() => { router.replace(`/inventory?warehouse_id=${id}`); }, [id, router]);
  return null;
}
