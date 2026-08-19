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

// Search-as-you-type city/warehouse lookups for the manual TTN form (used
// when parseNpAddress can't make sense of a free-text delivery address —
// e.g. a postomat name with an operator label NP itself adds, like
// `Поштомат "Нова Пошта" №25029`) — lets a manager pick the real
// city/warehouse straight from Nova Poshta instead of fixing the address
// text first.
export interface NpCityOption { ref: string; description: string; }
export async function npSearchCities(apiKey: string, q: string, limit = 10): Promise<NpCityOption[]> {
  if (!q.trim()) return [];
  const r = await npCall(apiKey, "Address", "getCities", { FindByString: q.trim(), Limit: limit });
  if (!r.success) return [];
  return (r.data ?? []).map((c: { Ref: string; Description: string }) => ({ ref: c.Ref, description: c.Description }));
}

export interface NpWarehouseOption {
  ref: string;
  description: string;
  number: string;
  isPostomat: boolean;
  // Only populated by npSearchAddress below (a plain city-scoped search
  // already knows its own city from the caller, so npSearchWarehouses
  // itself doesn't need these) — carried per-result since a combined
  // search spans several candidate cities at once.
  cityRef?: string;
  cityDescription?: string;
}
export async function npSearchWarehouses(apiKey: string, cityRef: string, q: string, limit = 20): Promise<NpWarehouseOption[]> {
  const r = await npCall(apiKey, "Address", "getWarehouses", { CityRef: cityRef, FindByString: q.trim() || undefined, Limit: limit });
  if (!r.success) return [];
  return (r.data ?? []).map((w: { Ref: string; Description: string; Number: string; CategoryOfWarehouse: string; CityDescription?: string }) => ({
    ref: w.Ref,
    description: w.Description,
    number: w.Number,
    isPostomat: w.CategoryOfWarehouse === "Postomat",
    cityRef,
    cityDescription: w.CityDescription,
  }));
}

// Combined "one field" city+warehouse search — see the client picker
// (components/admin/np-address-picker.tsx) that uses this for the order
// page's delivery-address field. Nova Poshta has no single call that
// searches warehouses by "city name + warehouse text" together — confirmed
// live against the real API: getCities itself already rejects a combined
// query like "Рівне Відділення №5" (0 matches — it wants just the city
// name), so feeding the whole query straight into getWarehouses never even
// gets a city to scope by. This instead auto-splits the typed text into a
// city part and a "rest" part by trying progressively shorter word-prefixes
// of the query against getCities — from the whole string down to just the
// first word — and taking the longest prefix that actually matches a real
// city. Whatever's left over after that prefix is the warehouse search
// text, scoped to that city via CityRef (this is exactly the two-field
// flow the manual-TTN picker already uses, just auto-detecting the split
// point instead of asking the admin to pick the city first).
//
// Each result's `formatted` field is the exact string
// parseNpAddress()/lib/nova-poshta.ts's own regex expects:
// "{City} — {Відділення|Поштомат} №{N}...: {address}" — built from NP's
// own CityDescription + Description fields (Description never repeats the
// city name itself, confirmed against the live API), so it's never
// hand-assembled from fragments that could drift out of the format the
// rest of this app's TTN/parsing code relies on.
export interface NpAddressOption extends NpWarehouseOption {
  formatted: string;
}
export async function npSearchAddress(apiKey: string, q: string, cityLimit = 3, warehousesPerCity = 6): Promise<NpAddressOption[]> {
  const words = q.trim().split(/\s+/).filter(Boolean);
  if (!words.length || q.trim().length < 2) return [];

  let cities: NpCityOption[] = [];
  let remainder = "";
  for (let i = words.length; i >= 1; i--) {
    const candidate = words.slice(0, i).join(" ");
    if (candidate.length < 2) continue;
    // eslint-disable-next-line no-await-in-loop
    cities = await npSearchCities(apiKey, candidate, cityLimit);
    if (cities.length) {
      remainder = words.slice(i).join(" ");
      break;
    }
  }
  if (!cities.length) return [];

  const perCity = await Promise.all(
    cities.map((city) => npSearchWarehouses(apiKey, city.ref, remainder, warehousesPerCity))
  );

  return perCity.flat().map((w) => ({
    ...w,
    formatted: `${w.cityDescription ?? ""} — ${w.description}`.trim(),
  }));
}

// Parses "Дніпро — Відділення №31 (до 30 кг): вул. Робоча, 89". isPostomat
// matters downstream: postomats are release-on-full-payment-only (Nova
// Poshta doesn't support cash-on-delivery there) and want per-parcel
// dimensions (OptionsSeat) rather than the flat Weight a regular warehouse
// shipment uses.
export function parseNpAddress(addr: string): { city: string; warehouseNum: number; isPostomat: boolean } | null {
  // Between the "Відділення"/"Поштомат" keyword and the "№" there can be
  // extra text — postomats in particular often carry an operator label NP
  // itself adds, e.g. `Рівне — Поштомат "Нова Пошта" №25029: вул. Миру, 16
  // (Мінімаркет М)`. [^№]* tolerates any of that instead of requiring the
  // number to follow immediately (real bug: it didn't, on exactly this
  // shape of address, so TTN creation errored with "не вдалося
  // розпарсити адресу" for every postomat with a labeled name).
  const m = addr.match(/^(.+?)\s*[—–-]+\s*(Відділення|Поштомат)[^№]*№\s*(\d+)/i);
  if (!m) return null;
  return { city: m[1].trim(), warehouseNum: parseInt(m[3]), isPostomat: /поштомат/i.test(m[2]) };
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
  // Накладений платіж: adds BackwardDeliveryData so the recipient pays this
  // amount in cash on pickup instead of it being collected upfront. Nova
  // Poshta does not support this for postomat deliveries (parcel lockers
  // only release once fully prepaid) — never set this alongside `seat`.
  codAmount?: number;
  // Postomat shipments need per-parcel dimensions (OptionsSeat) instead of
  // just the flat Weight a regular warehouse-to-warehouse shipment uses.
  seat?: { weight: number; length: number; width: number; height: number };
}

export interface NpStatus {
  status: string;
  statusCode: string;
  isDelivered: boolean;
  // TTN exists in NP's system but the sender never actually handed the
  // parcel over (no scan at a branch/courier pickup yet) — this CRM already
  // marked the order "Відправлено" once the TTN was created, which is wrong
  // if NP itself says nothing has physically shipped.
  notHandedOver: boolean;
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
  // StatusCode 1 = "Відправник самостійно створив цю накладну, але ще не
  // надав до відправки" — matched on text too, same reasoning as above.
  const notHandedOver = d.StatusCode === "1" || /не надав(?:о)? до відправки|не передал.*к отправке/i.test(status);
  return { status, statusCode: d.StatusCode ?? "", isDelivered, notHandedOver };
}

// Nova Poshta rejects DateTime values it considers "in the past" relative
// to its own clock, which runs on Kyiv time. Deriving the date from the
// server's local timezone (UTC on Vercel) is wrong for part of the day —
// whenever it's already past midnight in Kyiv but not yet in UTC, that
// gives yesterday's date and every TTN creation fails with "DateTime
// cannot be less then now". Always compute the date in Europe/Kyiv.
function kyivDateString(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    day: "2-digit", month: "2-digit", year: "numeric",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")}`;
}

export async function npCreateTtn(p: NpTtnParams): Promise<{ ttn: string } | { error: string }> {
  const date = kyivDateString();

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

  const docProps: Record<string, unknown> = {
    // Recipient pays the Nova Poshta delivery fee itself (separate from
    // BackwardDeliveryData below, which is about who pays for the goods).
    PayerType: "Recipient",
    PaymentMethod: "Cash",
    DateTime: date,
    CargoType: "Cargo",
    VolumeGeneral: "0.001",
    Weight: String(Math.max(0.1, p.seat?.weight ?? p.weight)),
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
  };

  if (p.codAmount) {
    docProps.BackwardDeliveryData = [
      { PayerType: "Recipient", CargoType: "Money", RedeliveryString: String(Math.max(1, Math.round(p.codAmount))) },
    ];
  }

  if (p.seat) {
    docProps.OptionsSeat = [
      {
        weight: p.seat.weight,
        volumetricLength: p.seat.length,
        volumetricWidth: p.seat.width,
        volumetricHeight: p.seat.height,
      },
    ];
  }

  const docRes = await npCall(p.apiKey, "InternetDocument", "save", docProps);

  if (!docRes.success) return { error: docRes.errors?.join(", ") ?? "TTN error" };
  const ttn = docRes.data?.[0]?.IntDocNumber;
  if (!ttn) return { error: "Порожня відповідь TTN" };
  return { ttn };
}

// Cancels a TTN. We only ever store the human-readable IntDocNumber, but
// InternetDocument/delete needs the document's internal Ref — so this
// looks the Ref up by IntDocNumber first via getDocumentList, then deletes
// it. Nova Poshta only allows this before the parcel is physically
// scanned in at a branch; after that the call fails and cancellation has
// to happen through their own support/cabinet instead.
export async function npDeleteTtn(apiKey: string, intDocNumber: string): Promise<{ ok: true } | { error: string }> {
  const listRes = await npCall(apiKey, "InternetDocument", "getDocumentList", { IntDocNumber: intDocNumber });
  if (!listRes.success || !listRes.data?.length) {
    return { error: `ТТН ${intDocNumber} не знайдено в Новій Пошті (можливо, вже скасовано або прийнято у відправлення)` };
  }

  const ref = listRes.data[0].Ref;
  const delRes = await npCall(apiKey, "InternetDocument", "delete", { DocumentRefs: ref });
  if (!delRes.success) return { error: delRes.errors?.join(", ") ?? "Не вдалося скасувати ТТН" };
  return { ok: true };
}
