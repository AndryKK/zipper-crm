import { Suspense } from "react";
import { OrdersPageClient } from "./orders-page-client";

// A real server-component export — see orders-page-client.tsx's top-of-file
// comment for why this couldn't just live in that "use client" file. This
// is what actually keeps /orders off the client-side Router Cache's
// 5-minute "static" staleTime (Next classified it "○ Static" without this),
// so a manager who just edited an order's price sees the fresh total the
// moment they navigate back here instead of a stale cached render.
export const dynamic = "force-dynamic";

export default function OrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrdersPageClient />
    </Suspense>
  );
}
