import { supabaseServer } from "@/lib/supabase";
import { formatDate } from "@/lib/utils";

const PIPELINE = [
  { status: "В роботі",    label: "Опрацювання",  sublabel: "Рахунок надіслано",    color: "#d97706" },
  { status: "Оплачено",    label: "Оплата",        sublabel: "Оплату підтверджено",  color: "#2563eb" },
  { status: "Відправлено", label: "Відправлено",   sublabel: "Посилка у дорозі",     color: "#7c3aed" },
  { status: "Отримано",    label: "Отримано",      sublabel: "Доставлено",           color: "#0891b2" },
  { status: "Завершено",   label: "Завершено",     sublabel: "Замовлення закрито",   color: "#059669" },
];

export default async function TrackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orderId = parseInt(id);

  if (isNaN(orderId)) return <NotFound />;

  const [{ data: order }, { data: items }] = await Promise.all([
    supabaseServer
      .from("orders")
      .select("id, status, person, addr_delivery, ttn, doc_field_1, date, phone")
      .eq("id", orderId)
      .single(),
    supabaseServer
      .from("orders_item")
      .select("id, product, quantity, price, type")
      .eq("oid", orderId),
  ]);

  if (!order) return <NotFound />;

  const step  = PIPELINE.findIndex((p) => p.status === order.status);
  const total = (items ?? []).reduce(
    (s: number, i: { price: number; quantity: number }) => s + i.price * i.quantity, 0
  );
  const isCancelled = order.status === "Скасовано";

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: "system-ui, -apple-system, sans-serif", padding: "32px 16px" }}>
      <div style={{ maxWidth: 620, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Header */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 6, letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: 600 }}>
            Статус замовлення
          </div>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, color: "#0f172a" }}>
            #{orderId}
          </h1>
          {order.person && (
            <div style={{ marginTop: 4, color: "#64748b", fontSize: 14 }}>{order.person}</div>
          )}
          <div style={{ marginTop: 4, color: "#94a3b8", fontSize: 13 }}>{formatDate(order.date)}</div>
        </div>

        {/* Pipeline */}
        <div style={{ background: "#fff", borderRadius: 18, padding: "28px 20px 22px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
          {isCancelled ? (
            <div style={{ textAlign: "center", padding: "16px 0", color: "#dc2626", fontWeight: 600, fontSize: 16 }}>
              ✕ Замовлення скасовано
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "flex-start" }}>
                {PIPELINE.map((p, i) => {
                  const isDone   = step > i;
                  const isActive = step === i;
                  const isFuture = step < i;

                  const circleStyle: React.CSSProperties = {
                    width: 42, height: 42, borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 700, fontSize: 16,
                    background:   isDone || isActive ? p.color : "#fff",
                    border:       isFuture ? "2px dashed #cbd5e1" : `2px solid ${p.color}`,
                    color:        isDone || isActive ? "#fff" : "#94a3b8",
                    boxShadow:    isActive ? `0 0 0 5px ${p.color}28` : "none",
                    flexShrink:   0,
                    transition:   "all 0.3s",
                  };

                  return (
                    <div key={p.status} style={{ display: "flex", alignItems: "flex-start", flex: i < PIPELINE.length - 1 ? "1 1 0" : "0 0 auto" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={circleStyle}>
                          {isDone ? "✓" : i + 1}
                        </div>
                        <div style={{
                          marginTop: 8, textAlign: "center", fontSize: 11,
                          fontWeight: isActive ? 700 : isDone ? 600 : 400,
                          color: isFuture ? "#94a3b8" : "#1e293b",
                          lineHeight: 1.3, width: 70,
                        }}>{p.label}</div>
                        <div style={{ fontSize: 10, color: "#94a3b8", textAlign: "center", width: 70, lineHeight: 1.25, marginTop: 2 }}>
                          {p.sublabel}
                        </div>
                      </div>
                      {i < PIPELINE.length - 1 && (
                        <div style={{
                          flex: 1, height: 3, marginTop: 19, borderRadius: 2, marginLeft: 4, marginRight: 4,
                          background: isDone ? p.color : "#e2e8f0",
                          transition: "background 0.4s",
                        }} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Current status description */}
              {step >= 0 && (
                <div style={{
                  marginTop: 20, padding: "10px 16px", borderRadius: 10,
                  background: `${PIPELINE[step].color}15`,
                  color: PIPELINE[step].color,
                  fontSize: 13, fontWeight: 600, textAlign: "center",
                }}>
                  {step === 0 && "Замовлення в роботі — очікується оплата"}
                  {step === 1 && "Оплату підтверджено — готується до відправки"}
                  {step === 2 && "Посилка у дорозі"}
                  {step === 3 && "Посилка доставлена до відділення"}
                  {step === 4 && "Замовлення успішно виконано"}
                </div>
              )}
            </>
          )}
        </div>

        {/* TTN tracking */}
        {order.ttn && (
          <div style={{ background: "#fff", borderRadius: 14, padding: "16px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 8 }}>
              Нова Пошта — ТТН
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "monospace", fontSize: 17, fontWeight: 700, color: "#1e293b" }}>
                {order.ttn}
              </span>
              <a
                href={`https://novaposhta.ua/tracking/?cargo_number=${order.ttn}`}
                target="_blank" rel="noreferrer"
                style={{
                  padding: "6px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: "#7c3aed", color: "#fff", textDecoration: "none",
                  display: "inline-block",
                }}
              >
                Відстежити
              </a>
            </div>
          </div>
        )}

        {/* Order details */}
        <div style={{ background: "#fff", borderRadius: 14, padding: "16px 0", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
          <div style={{ padding: "0 20px 12px", fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
            Товари
          </div>
          {(items ?? []).map((item: { id: number; product: number; type: string | null; price: number; quantity: number }) => (
            <div key={item.id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 20px", borderTop: "1px solid #f1f5f9",
              fontSize: 14,
            }}>
              <div style={{ color: "#1e293b" }}>
                Товар #{item.product}
                {item.type && <span style={{ color: "#94a3b8", marginLeft: 6, fontSize: 12 }}>{item.type}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, color: "#64748b" }}>
                <span>{item.quantity} шт</span>
                <span style={{ fontWeight: 600, color: "#1e293b", minWidth: 80, textAlign: "right" }}>
                  {(item.price * item.quantity).toFixed(2)} грн
                </span>
              </div>
            </div>
          ))}
          <div style={{
            display: "flex", justifyContent: "space-between",
            padding: "12px 20px 0", borderTop: "2px solid #f1f5f9",
            fontWeight: 700, fontSize: 16, color: "#1e293b",
          }}>
            <span>Разом</span>
            <span>{total.toFixed(2)} грн</span>
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", fontSize: 12, color: "#94a3b8", paddingBottom: 16 }}>
          Якщо у вас є питання — зв'яжіться з нами
        </div>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", background: "#f1f5f9" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🔍</div>
        <h1 style={{ margin: "0 0 8px", color: "#1e293b" }}>Замовлення не знайдено</h1>
        <p style={{ color: "#64748b" }}>Перевірте правильність посилання</p>
      </div>
    </div>
  );
}
