# Підключення CRM до нового/іншого Supabase-проєкту

Чекліст того, що НЕ переноситься автоматично, якщо цей застосунок колись
підключать до іншого Supabase-проєкту (клон, міграція, staging-копія тощо).
`scripts/clone-to-new-supabase.mjs` переносить лише **дані**, а нижче —
все, що існує на рівні схеми/розширень бази і його треба відтворити окремо.

## 1. Схема таблиць

```
npx prisma db push
```
Створює таблиці за `prisma/schema.prisma` у новому проєкті — цільові
таблиці мають вже існувати ДО запуску `clone-to-new-supabase.mjs` (скрипт
копіювання даних цього вимагає).

## 2. Дані

```
OLD_DATABASE_URL=... NEW_DATABASE_URL=... node scripts/clone-to-new-supabase.mjs
```
Переносить рядки таблиця-за-таблицею, включно з `settings` (реквізити
постачальників, Nova Poshta refs і т.д. — переїдуть як є).

## 3. Автосписання/повернення складу — [`docs/setup-inventory-sync.sql`](./setup-inventory-sync.sql)

Це **не частина схеми Prisma** і не переноситься кроками 1-2 — окремий
ручний SQL-скрипт, який треба виконати в SQL Editor нового проєкту:
- додає колонки `oid`/`product`/`warehouse_id`/`qty`/`restocked` до
  `orders_returns` (якщо крок 1 вже створив цю таблицю з базовою схемою —
  цей скрипт лише дороблює її);
- вмикає розширення `pg_net`;
- створює 2 функції + 2 тригери (`trg_inventory_sync_items`,
  `trg_inventory_sync_orders`), які шлють HTTP-запит на
  `/api/webhooks/inventory-sync` при зміні `orders_item`/`orders`.

**Перед запуском у новому проєкті обов'язково замінити** в тексті скрипта:
- URL вебхука — якщо застосунок задеплоєний на іншому домені, а не
  `zipper-crm.vercel.app`;
- `<YOUR_WEBHOOK_SECRET>` — на актуальний `INVENTORY_WEBHOOK_SECRET`.

Детальніше про сам механізм — [`docs/setup-inventory-sync.md`](./setup-inventory-sync.md).

## 4. Змінні середовища

Оновити в `.env` (локально) і в Vercel → Settings → Environment Variables
(прод) під новий проєкт:
- `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`
- `INVENTORY_WEBHOOK_SECRET` — можна лишити те саме значення або згенерувати
  нове (тоді не забути так само оновити його в SQL-функціях, крок 3).

## 5. Перевірка

Те саме, що в кінці [`docs/setup-inventory-sync.md`](./setup-inventory-sync.md#як-перевірити-що-спрацювало) —
змінити кількість товару в будь-якому замовленні і перевірити, що залишок
на складі оновився.
