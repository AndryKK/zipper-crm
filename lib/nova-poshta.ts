const NP_API = "https://api.novaposhta.ua/v2.0/json/";

async function npCall(apiKey: string, model: string, method: string, props: object) {
  const res = await fetch(NP_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, modelName: model, calledMethod: method, methodProperties: props }),
  });
  if (!res.ok) throw new Error(`NP HTTP ${res.status}`);
  return res.json();
}

export async function npFindCityRef(apiKey: string, cityName: string): Promise<string | null> {
  const r = await npCall(apiKey, "Address", "getCities", { FindByString: cityName.trim(), Limit: 3 });
  return r.success && r.data?.length ? r.data[0].Ref : null;
}

export async function npFindWarehouseRef(apiKey: string, cityRef: string, warehouseNum: number): Promise<string | null> {
  const r = await npCall(apiKey, "Address", "getWarehouses", { CityRef: cityRef, WarehouseId: String(warehouseNum) });
  return r.success && r.data?.length ? r.data[0].Ref : null;
}

// Parses "Дніпро — Відділення №31 (до 30 кг): вул. Робоча, 89"
export function parseNpAddress(addr: string): { city: string; warehouseNum: number } | null {
  const m = addr.match(/^(.+?)\s*[—–-]+\s*(?:Відділення|Поштомат|відділення)\s*№\s*(\d+)/i);
  if (!m) return null;
  return { city: m[1].trim(), warehouseNum: parseInt(m[2]) };
}

export interface NpTtnParams {
  apiKey: string;
  senderRef: string;
  senderContactRef: string;
  senderCityRef: string;
  senderWarehouseRef: string;
  senderPhone: string;
  recipientName: string;
  recipientPhone: string;
  recipientCityRef: string;
  recipientWarehouseRef: string;
  weight: number;
  cost: number;
  description: string;
}

export interface NpStatus {
  status: string;
  statusCode: string;
  isDelivered: boolean;
}

// Nova Poshta has no push webhook for arbitrary API keys — this is a
// poll-on-demand check of a single TTN's current status, used both by the
// daily cron (app/api/cron/sync-ttn-status) and a manual "check now" button.
export async function npGetStatus(apiKey: string, ttn: string, phone?: string): Promise<NpStatus | null> {
  const r = await npCall(apiKey, "TrackingDocument", "getStatusDocuments", {
    Documents: [{ DocumentNumber: ttn, Phone: phone ? phone.replace(/\D/g, "") : undefined }],
  });
  if (!r.success || !r.data?.length) return null;
  const d = r.data[0];
  const status = d.Status ?? "";
  // StatusCode 9 = "Отримано" per NP's documented codes, but we also match
  // on the status text itself since code mappings have historically shifted.
  const isDelivered = d.StatusCode === "9" || /отримано|видано/i.test(status);
  return { status, statusCode: d.StatusCode ?? "", isDelivered };
}

export async function npCreateTtn(p: NpTtnParams): Promise<{ ttn: string } | { error: string }> {
  const today = new Date();
  const date = `${String(today.getDate()).padStart(2, "0")}.${String(today.getMonth() + 1).padStart(2, "0")}.${today.getFullYear()}`;

  const parts = p.recipientName.trim().split(/\s+/);
  const recRes = await npCall(p.apiKey, "Counterparty", "save", {
    FirstName: parts[1] ?? parts[0] ?? "",
    MiddleName: parts[2] ?? "",
    LastName: parts[0] ?? "",
    Phone: p.recipientPhone.replace(/\D/g, ""),
    CounterpartyType: "PrivatePerson",
    CounterpartyProperty: "Recipient",
  });
  if (!recRes.success) return { error: recRes.errors?.join(", ") ?? "Counterparty error" };

  const recipientRef = recRes.data?.[0]?.Ref;
  const contactRef = recRes.data?.[0]?.ContactPerson?.data?.[0]?.Ref;
  if (!recipientRef || !contactRef) return { error: "Не отримано ref отримувача" };

  const docRes = await npCall(p.apiKey, "InternetDocument", "save", {
    PayerType: "Sender",
    PaymentMethod: "Cash",
    DateTime: date,
    CargoType: "Cargo",
    VolumeGeneral: "0.001",
    Weight: String(Math.max(0.1, p.weight)),
    ServiceType: "WarehouseWarehouse",
    SeatsAmount: "1",
    Description: p.description || "Товари",
    Cost: String(Math.max(1, Math.round(p.cost))),
    CitySender: p.senderCityRef,
    Sender: p.senderRef,
    SenderAddress: p.senderWarehouseRef,
    ContactSender: p.senderContactRef,
    SendersPhone: p.senderPhone.replace(/\D/g, ""),
    CityRecipient: p.recipientCityRef,
    Recipient: recipientRef,
    RecipientAddress: p.recipientWarehouseRef,
    ContactRecipient: contactRef,
    RecipientsPhone: p.recipientPhone.replace(/\D/g, ""),
  });

  if (!docRes.success) return { error: docRes.errors?.join(", ") ?? "TTN error" };
  const ttn = docRes.data?.[0]?.IntDocNumber;
  if (!ttn) return { error: "Порожня відповідь TTN" };
  return { ttn };
}
