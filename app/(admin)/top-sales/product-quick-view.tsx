"use client";

import { useState } from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getImgUrl } from "@/lib/utils";
import { Eye, EyeOff, ExternalLink } from "lucide-react";

type Product = {
  id: number;
  title: string;
  pcode: string | null;
  img: string | null;
  price: number | null;
  price_sale: number | null;
  active: number | null;
} | undefined;

export function ProductQuickView({
  product,
  quantity,
  revenue,
  rank,
  children,
}: {
  product: Product;
  quantity: number;
  revenue: number;
  rank: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (!product) return <tr>{children}</tr>;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <tr onClick={() => setOpen(true)} style={{ cursor: "pointer" }}>
        {children}
      </tr>
      <DialogContent style={{ maxWidth: 480 }}>
        <DialogHeader>
          <DialogTitle>Товар #{rank}</DialogTitle>
        </DialogHeader>

        <div style={{ display: "flex", gap: 16 }}>
          {product.img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={getImgUrl(product.img, "products")}
              alt={product.title}
              style={{ width: 120, height: 120, borderRadius: 10, objectFit: "cover", flexShrink: 0, background: "var(--bg)" }}
            />
          ) : (
            <div
              style={{
                width: 120,
                height: 120,
                borderRadius: 10,
                flexShrink: 0,
                background: "var(--bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-muted)",
                fontSize: 12,
              }}
            >
              Немає фото
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{product.title}</div>

            {product.pcode && (
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", fontFamily: "monospace", marginBottom: 8 }}>
                Артикул: {product.pcode}
              </div>
            )}

            <div style={{ marginBottom: 8 }}>
              {product.active === 1 ? (
                <Badge variant="success"><Eye className="h-3 w-3 mr-1" />Активний</Badge>
              ) : (
                <Badge variant="secondary"><EyeOff className="h-3 w-3 mr-1" />Прихований</Badge>
              )}
            </div>

            <div style={{ fontSize: 13, marginBottom: 4 }}>
              {product.price_sale ? (
                <span>
                  <span style={{ color: "var(--success)", fontWeight: 700 }}>
                    {Number(product.price_sale).toFixed(2)} ₴
                  </span>{" "}
                  <span style={{ textDecoration: "line-through", color: "var(--text-muted)", fontSize: 12 }}>
                    {Number(product.price ?? 0).toFixed(2)} ₴
                  </span>
                </span>
              ) : (
                <span style={{ fontWeight: 700 }}>{Number(product.price ?? 0).toFixed(2)} ₴</span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 8, padding: "12px 0", borderTop: "1px solid var(--border)" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Продано</div>
            <div style={{ fontWeight: 700, fontFamily: "monospace" }}>{quantity}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Виручка</div>
            <div style={{ fontWeight: 700, fontFamily: "monospace", color: "var(--success)" }}>
              {revenue.toLocaleString("uk-UA")} ₴
            </div>
          </div>
        </div>

        <Button asChild style={{ width: "100%" }}>
          <Link href={`/products/${product.id}`}>
            <ExternalLink className="h-4 w-4" />
            Відкрити картку товару
          </Link>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
