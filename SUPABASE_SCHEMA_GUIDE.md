# Supabase Schema Guide — Zipper CRM

Детальний довідник по структурі бази даних для використання AI-агентами.

---

## Зміст

1. [Підключення та конфігурація](#підключення-та-конфігурація)
2. [Таблиця `products` — Товари](#таблиця-products--товари)
3. [Таблиця `categories` — Категорії](#таблиця-categories--категорії)
4. [Таблиця `products_categories` — Зв'язок товар↔категорія](#таблиця-products_categories--звязок-товаркатегорія)
5. [Таблиця `products_photos` / `products_photos2` — Галерея](#таблиця-products_photos--products_photos2--галерея)
6. [Таблиця `products_chars` — Характеристики товару](#таблиця-products_chars--характеристики-товару)
7. [Таблиця `products_colors` — Кольори-варіанти](#таблиця-products_colors--кольори-варіанти)
8. [Таблиця `all_filters` — Групи фільтрів](#таблиця-all_filters--групи-фільтрів)
9. [Таблиця `all_filters_filters` — Значення фільтрів](#таблиця-all_filters_filters--значення-фільтрів)
10. [Побудова URL зображень (Cloudflare R2)](#побудова-url-зображень-cloudflare-r2)
11. [Мультимовність та translationId](#мультимовність-та-translationid)
12. [Приклади запитів Supabase JS SDK](#приклади-запитів-supabase-js-sdk)
13. [Всі таблиці системи (повний список)](#всі-таблиці-системи-повний-список)

---

## Підключення та конфігурація

```
Supabase Project URL: https://ncjcqfqcmsjsqhxjkqxh.supabase.co
Supabase Anon Key:    NEXT_PUBLIC_SUPABASE_ANON_KEY (з .env)
Service Role Key:     SUPABASE_SERVICE_ROLE_KEY (з .env, тільки server-side)
```

Клієнт у коді: `@/lib/supabase` → `supabaseServer`

---

## Таблиця `products` — Товари

### Всі поля

| Поле в БД         | Alias у JS (select)  | Тип        | Опис |
|-------------------|----------------------|------------|------|
| `id`              | `id`                 | integer    | Первинний ключ, автоінкремент |
| `translation_id`  | `translationId`      | integer    | ID групи перекладів — однаковий для `uk` та `ru` версій одного товару |
| `lang`            | `lang`               | text       | Мова запису: `'uk'` або `'ru'` |
| `pid`             | `pid`                | integer    | ID батьківського запису (для варіантів / подібних товарів) |
| `filter_id`       | `filterId`           | integer    | ID групи фільтрів з таблиці `all_filters` (прив'язує товар до набору фільтрів) |
| `pcode`           | `pcode`              | text       | Артикул / код товару |
| `uri`             | `uri`                | text       | URL-slug (унікальний ідентифікатор для ЧПУ-посилань) |
| `img`             | `img`                | text       | URL головного зображення (повне посилання на Cloudflare R2) |
| `img2`            | `img2`               | text       | URL другого зображення (hover-фото) |
| `title`           | `title`              | text       | Назва товару |
| `main_title`      | `main_title`         | text       | Альтернативна/основна назва (H1) |
| `heading`         | `heading`            | text       | Підзаголовок або тег |
| `package`         | `package`            | text       | Пакування / одиниця поставки |
| `price`           | `price`              | numeric    | Роздрібна ціна |
| `price_sale`      | `price_sale`         | numeric    | Ціна зі знижкою / акційна ціна |
| `price2n`         | `price2n`            | numeric    | Ціна гурт (від якої кількості) |
| `price2`          | `price2`             | numeric    | Гуртова ціна (рівень 2) |
| `price3n`         | `price3n`            | numeric    | Ціна гурт 2 (від якої кількості) |
| `price3`          | `price3`             | numeric    | Гуртова ціна (рівень 3) |
| `label_action`    | `labelAction`        | text       | Лейбл-мітка: `'new'`, `'sale'`, `'hit'` тощо |
| `text`            | `text`               | text       | Короткий опис (preview) |
| `priority`        | `priority`           | integer    | Пріоритет сортування (менше = вище) |
| `popular`         | `popular`            | integer    | Популярний товар: `1` = так |
| `measure`         | `measure`            | text       | Одиниця виміру (шт, м, рулон…) |
| `minquantity`     | `minquantity`        | integer    | Мінімальна кількість для замовлення |
| `descr`           | `descr`              | text       | Повний опис (HTML) |
| `seo_title`       | `seoTitle`           | text       | SEO Title |
| `seo_key`         | `seoKey`             | text       | SEO Keywords |
| `seo_descr`       | `seoDescr`           | text       | SEO Description |
| `active`          | `active`             | integer    | Активність: `1` = активний, `0` = прихований |

### Select-запит з усіма alias

```typescript
supabaseServer
  .from("products")
  .select("*, labelAction:label_action, translationId:translation_id, seoTitle:seo_title, seoKey:seo_key, seoDescr:seo_descr")
  .eq("lang", "uk")
```

### Поля керування (адмін)

| Поле         | Значення     | Дія |
|-------------|-------------|-----|
| `active`    | `1` / `0`   | Показувати / приховувати товар |
| `popular`   | `1` / `0`   | Відображати у блоці "Популярні" |
| `priority`  | число       | Порядок в каталозі (ASC = спочатку менші) |
| `label_action` | `'new'`, `'sale'`, `'hit'`, `''` | Лейбл на картці товару |

### Порядок сортування за замовчуванням

```typescript
.order("priority", { ascending: true })
.order("id", { ascending: false })
```

---

## Таблиця `categories` — Категорії

### Всі поля

| Поле в БД        | Alias у JS        | Тип     | Опис |
|------------------|-------------------|---------|------|
| `id`             | `id`              | integer | Первинний ключ |
| `translation_id` | `translationId`   | integer | Група перекладів (uk/ru версії однієї категорії) |
| `lang`           | `lang`            | text    | Мова: `'uk'` або `'ru'` |
| `pid`            | `pid`             | integer | ID батьківської категорії. `0` = коренева категорія (без батька) |
| `title`          | `title`           | text    | Назва категорії |
| `uri`            | `uri`             | text    | URL-slug категорії |
| `img`            | `img`             | text    | URL зображення (Cloudflare R2) |
| `img2`           | `img2`            | text    | URL другого зображення (hover) |
| `discount`       | `discount`        | numeric | Відсоток знижки для відображення |
| `ndiscount`      | `ndiscount`       | numeric | Числова знижка |
| `visibility`     | `visibility`      | integer | Видимість: `1` = видима |
| `priority`       | `priority`        | integer | Пріоритет сортування |
| `descr`          | `descr`           | text    | Короткий опис |
| `text`           | `text`            | text    | Повний текст (HTML) |
| `seo_title`      | `seoTitle`        | text    | SEO Title |
| `seo_key`        | `seoKey`          | text    | SEO Keywords |
| `seo_descr`      | `seoDescr`        | text    | SEO Description |
| `image_new_shop` | `image_new_shop`  | text    | URL зображення для нового магазину (повне посилання на Cloudflare R2) |

### Ієрархія категорій (дерево)

```
pid = 0           → Коренева категорія (наприклад: "Блискавки", "Фурнітура")
pid = <id>        → Підкатегорія (наприклад: "Спіральні блискавки", "Металеві блискавки")
```

Приклад дерева:
```
Блискавки (pid=0, id=1)
├── Спіральні (pid=1, id=5)
├── Металеві (pid=1, id=6)
└── Потайні (pid=1, id=7)
Фурнітура (pid=0, id=2)
├── Бігунки (pid=2, id=8)
└── Замки (pid=2, id=9)
```

### Запит категорій

```typescript
// Всі кореневі категорії
supabaseServer.from("categories").select("*").eq("lang", "uk").eq("pid", 0).order("priority")

// Підкатегорії конкретної категорії
supabaseServer.from("categories").select("*").eq("lang", "uk").eq("pid", parentId)
```

---

## Таблиця `products_categories` — Зв'язок товар↔категорія

Таблиця зв'язків (many-to-many).

| Поле  | Тип     | Опис |
|-------|---------|------|
| `id`  | integer | Первинний ключ |
| `pid` | integer | ID товару (`products.id`) |
| `cid` | integer | ID категорії (`categories.id`) |

### Приклад запиту

```typescript
// Категорії конкретного товару
supabaseServer.from("products_categories").select("*").eq("pid", productId)

// Товари в конкретній категорії
supabaseServer.from("products_categories").select("*").eq("cid", categoryId)
```

---

## Таблиця `products_photos` / `products_photos2` — Галерея

Дві окремі таблиці для двох галерей товару.

| Поле       | Тип     | Опис |
|------------|---------|------|
| `id`       | integer | Первинний ключ |
| `pid`      | integer | ID товару (`products.id`) |
| `img`      | text    | URL зображення (Cloudflare R2) |
| `priority` | integer | Порядок відображення |

`products_photos` — основна галерея  
`products_photos2` — додаткова галерея (наприклад, технічні фото)

### Запит

```typescript
supabaseServer
  .from("products_photos")
  .select("*")
  .eq("pid", productId)
  .order("priority", { ascending: true })
```

---

## Таблиця `products_chars` — Характеристики товару

| Поле    | Тип     | Опис |
|---------|---------|------|
| `id`    | integer | Первинний ключ |
| `lang`  | text    | Мова |
| `pid`   | integer | ID товару (`products.id`) |
| `chid`  | integer | ID характеристики (тип: наприклад 1=Тип, 2=Ширина) |
| `title` | text    | Значення характеристики |

Характеристики товару зберігаються як пари `chid` (назва характеристики) + `title` (значення).

---

## Таблиця `products_colors` — Кольори-варіанти

Пов'язані товари (інші кольори / варіанти того самого товару).

| Поле  | Тип     | Опис |
|-------|---------|------|
| `id`  | integer | Первинний ключ |
| `pid` | integer | ID поточного товару |
| `cid` | integer | ID пов'язаного товару (інший колір) |

---

## Таблиця `all_filters` — Групи фільтрів

Визначає **типи фільтрів** (групи), наприклад "Колір тасьми", "Тип", "Довжина (см)".

| Поле            | Тип     | Опис |
|-----------------|---------|------|
| `id`            | integer | Первинний ключ |
| `translationId` | integer | Група перекладів (uk/ru) |
| `pid`           | integer | Завжди `0` (не використовується для ієрархії) |
| `lang`          | text    | Мова: `'uk'` або `'ru'` |
| `uri`           | text    | URL-slug фільтра |
| `img`           | text    | Зображення фільтра (рідко використовується) |
| `title`         | text    | Назва групи фільтрів |
| `descr`         | text    | Опис |
| `priority`      | integer | Порядок відображення |

### Наявні групи фільтрів (uk, translationId)

| translationId | uk title               | ru title             | uri (uk)          |
|--------------|------------------------|----------------------|-------------------|
| 1            | Колір тасьми           | Цвет тесьмы          | `kolir-tasmi`     |
| 2            | Колір ланки            | Цвет звена           | `cvet-zvena`      |
| 3            | Тип                    | Тип                  | `tip`             |
| 4            | Тип роз'єму            | Тип разъема          | `tip-razema`      |
| 5            | Кількість бігунків     | Кол-во бегунков      | `kol-vo-begunkov` |
| 6            | Довжина (см)           | Длина (см)           | `dovzhina-sm`     |
| 7            | Тип                    | Тип                  | `tip`             |
| 8            | Колір металу           | Цвет металла         | `kolir-metalu`    |
| 9            | Вид                    | Вид                  | `vid`             |
| 21           | Ширина                 | Ширина               | `shirina`         |

---

## Таблиця `all_filters_filters` — Значення фільтрів

Конкретні **значення** всередині кожної групи фільтрів.

| Поле            | Тип     | Опис |
|-----------------|---------|------|
| `id`            | integer | Первинний ключ |
| `translationId` | integer | Група перекладів (uk/ru) |
| `pid`           | integer | ID батьківського фільтра (`all_filters.id`) |
| `lang`          | text    | Мова |
| `title`         | text    | Назва значення |
| `uri`           | text    | URL-slug значення |
| `priority`      | integer | Порядок |

### Значення по групах (приклади)

**Колір тасьми (pid=1 для ru / pid=12 для uk):**
- С580 чорний, 519(171) червоний, 117 синій, С150 зелений, С501 білий, С848 бурштиновий, С570 коричневий, С572 бежевий, С577 сірий, С578 темно-сірий, Silver, GOLD, камуфляж, джинс, хакі, темний хакі, індиго, бірюза, м'ята, охра, персик, пудра, малина, лосось, лагуна, голубий (електрик), вишня, бордовий, баклажан, жовтий, яблуко, сирень...

**Колір ланки (pid=2 для ru / pid=13 для uk):**
- GOLD, GOLD ROSE, SILVER, BLACK SILVER, RED GOLD, антик (бронза, оксид), нікель, хром, темний нікель, різнокольорові зубці, сірий, жовте золото, металізоване напилення

**Тип (pid=3 для ru / pid=14 для uk):**
- 3, 4, 5, 6, 7, 8, 10 (типорозміри блискавок)

**Тип роз'єму (pid=4 для ru / pid=15 для uk):**
- розємна, нерозємна

**Кількість бігунків (pid=5 для ru / pid=16 для uk):**
- 1, 2

**Довжина, см (pid=6 для ru / pid=17 для uk):**
- 10, 12, 14, 18, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 110, 120, 140, 160

**Колір металу (pid=8 для ru / pid=19 для uk):**
- (ті самі що й Колір ланки)

### Запит фільтрів

```typescript
// Отримати всі групи фільтрів
const { data: filters } = await supabaseServer
  .from("all_filters")
  .select("*, translationId:translation_id")
  .eq("lang", "uk")
  .order("priority", { ascending: true });

// Отримати значення для вибраних груп
const { data: filterValues } = await supabaseServer
  .from("all_filters_filters")
  .select("*, translationId:translation_id, filterId:filter_id")
  .in("pid", filterGroupIds)
  .eq("lang", "uk")
  .order("priority", { ascending: true });
```

---

## Побудова URL зображень (Cloudflare R2)

### Базова URL

```
NEXT_PUBLIC_R2_PUBLIC_URL = https://pub-332d2905ae4f48b5878d35d9fdb63ef1.r2.dev
```

### Структура папок у R2 Bucket (`zipper`)

| Папка в R2    | Що зберігається                              |
|---------------|---------------------------------------------|
| `categories/` | Зображення категорій                        |
| `products/`   | Головні фото товарів                        |
| `products2/`  | Другорядні фото товарів                     |
| `slider/`     | Зображення для слайдера головної сторінки   |
| `news/`       | Зображення новин                            |

### Ім'я файлу

```
{timestamp}-{prefix}-{sanitized-original-name}.jpg
```

Приклад: `1718000000123-main-photo_1.jpg`

### Повна URL зображення

```
https://pub-332d2905ae4f48b5878d35d9fdb63ef1.r2.dev/products/1718000000123-main-photo_1.jpg
```

### Як URL зберігається в БД

Поля `img`, `img2` у таблицях `products`, `categories`, `slider`, `news` та поле `img` у `products_photos`/`products_photos2` — зберігають **повний URL** (не відносний шлях).

```sql
-- Приклад значення поля img у products:
-- https://pub-332d2905ae4f48b5878d35d9fdb63ef1.r2.dev/products/1718000000123-main.jpg
```

### Як завантажити зображення (API)

```
POST /api/products/{id}/photos     → завантаження в products_photos
POST /api/categories/{id}/image    → завантаження в categories.img
```

---

## Мультимовність та translationId

Більшість таблиць підтримують дві мови: `'uk'` (українська) та `'ru'` (російська).

### Принцип роботи

- При створенні запису він дублюється для всіх активних мов (`langs` таблиця)
- Обидва записи отримують однаковий `translation_id`
- `lang` поле визначає мову конкретного запису

```typescript
// Отримати активні мови
const { data: langs } = await supabaseServer.from("langs").select("*").eq("active", 1);
// langs = [{ code: "uk", ... }, { code: "ru", ... }]
```

### Таблиця `langs`

| Поле     | Опис |
|----------|------|
| `id`     | Первинний ключ |
| `code`   | Код мови: `'uk'`, `'ru'` |
| `title`  | Назва мови |
| `active` | `1` = активна |

### Групування перекладів

```typescript
// Знайти пов'язаний переклад товару
supabaseServer
  .from("products")
  .select("*")
  .eq("translation_id", someTranslationId)
// Повертає 2 записи: uk та ru версії
```

---

## Приклади запитів Supabase JS SDK

### Отримати список товарів з пагінацією та пошуком

```typescript
const page = 1;
const limit = 50;
const lang = "uk";
const searchQuery = "блискавка";

const { data, count } = await supabaseServer
  .from("products")
  .select("*, labelAction:label_action, translationId:translation_id, seoTitle:seo_title, seoKey:seo_key, seoDescr:seo_descr", { count: "exact" })
  .eq("lang", lang)
  .or(`title.ilike.%${searchQuery}%,pcode.ilike.%${searchQuery}%,uri.ilike.%${searchQuery}%`)
  .order("priority", { ascending: true })
  .order("id", { ascending: false })
  .range((page - 1) * limit, page * limit - 1);
```

### Отримати один товар з усіма зв'язками

```typescript
const pid = 123;

const [{ data: product }, { data: categories }, { data: photos }, { data: photos2 }, { data: chars }] =
  await Promise.all([
    supabaseServer
      .from("products")
      .select("*, labelAction:label_action, translationId:translation_id, seoTitle:seo_title, seoKey:seo_key, seoDescr:seo_descr")
      .eq("id", pid)
      .single(),
    supabaseServer.from("products_categories").select("*").eq("pid", pid),
    supabaseServer.from("products_photos").select("*").eq("pid", pid).order("priority"),
    supabaseServer.from("products_photos2").select("*").eq("pid", pid).order("priority"),
    supabaseServer.from("products_chars").select("*").eq("pid", pid).order("priority"),
  ]);

const fullProduct = { ...product, categories, photos, photos2, chars };
```

### Отримати товари категорії

```typescript
// 1. Знайти IDs товарів у категорії
const { data: links } = await supabaseServer
  .from("products_categories")
  .select("pid")
  .eq("cid", categoryId);

const productIds = links?.map(l => l.pid) ?? [];

// 2. Отримати товари за IDs
const { data: products } = await supabaseServer
  .from("products")
  .select("*, labelAction:label_action, translationId:translation_id")
  .in("id", productIds)
  .eq("lang", "uk")
  .eq("active", 1)
  .order("priority");
```

### Отримати дерево категорій

```typescript
// Кореневі категорії
const { data: rootCats } = await supabaseServer
  .from("categories")
  .select("*, translationId:translation_id, seoTitle:seo_title, seoKey:seo_key, seoDescr:seo_descr")
  .eq("lang", "uk")
  .eq("pid", 0)
  .order("priority");

// Підкатегорії для конкретної кореневої
const { data: subCats } = await supabaseServer
  .from("categories")
  .select("*")
  .eq("lang", "uk")
  .eq("pid", rootCatId)
  .order("priority");
```

### Фільтри — повна структура

```typescript
// Отримати всі групи + їх значення одночасно
const { data: filterGroups } = await supabaseServer
  .from("all_filters")
  .select("*, translationId:translation_id")
  .eq("lang", "uk")
  .order("priority");

const groupIds = filterGroups?.map(f => f.id) ?? [];

const { data: filterValues } = await supabaseServer
  .from("all_filters_filters")
  .select("*, translationId:translation_id")
  .in("pid", groupIds)
  .eq("lang", "uk")
  .order("priority");

// Зібрати дерево
const filtersTree = filterGroups?.map(group => ({
  ...group,
  values: filterValues?.filter(v => v.pid === group.id) ?? [],
}));
```

### Фільтрація товарів за filterId

```typescript
// Зв'язок товару з групою фільтрів через поле filter_id у products
const { data: products } = await supabaseServer
  .from("products")
  .select("*")
  .eq("lang", "uk")
  .eq("filter_id", filterGroupId);
```

---

## Всі таблиці системи (повний список)

### Товари та каталог

| Таблиця               | Призначення |
|----------------------|-------------|
| `products`           | Основна таблиця товарів |
| `categories`         | Категорії та підкатегорії |
| `products_categories`| Зв'язок many-to-many: товар↔категорія |
| `products_photos`    | Основна галерея зображень товару |
| `products_photos2`   | Додаткова галерея зображень товару |
| `products_chars`     | Характеристики товару (ключ-значення) |
| `products_colors`    | Пов'язані товари (варіанти кольорів) |
| `products_together`  | Товари, що купують разом |

### Фільтри

| Таблиця               | Призначення |
|----------------------|-------------|
| `all_filters`        | Групи фільтрів (Колір тасьми, Тип, Довжина…) |
| `all_filters_filters`| Значення фільтрів |
| `all_filters_items`  | Прив'язка значень фільтрів до товарів |

### Контент

| Таблиця        | Призначення |
|---------------|-------------|
| `articles`    | Статті блогу |
| `articles_photos` | Фото статей |
| `news`        | Новини |
| `news_photos` | Фото новин |
| `services`    | Послуги |
| `managers`    | Менеджери |
| `slider`      | Слайдер головної сторінки |
| `gallery`     | Галерея |
| `docs`        | Документи |
| `footer`      | Контент футера |

### Користувачі та адміністрування

| Таблиця                | Призначення |
|-----------------------|-------------|
| `users`               | Клієнти / покупці |
| `adm_users`           | Адміністратори / менеджери CRM |
| `adm_login_fails`     | Лог невдалих входів адміна |
| `users_categories`    | Категорії, доступні конкретному користувачу |
| `users_recover_password` | Запити на відновлення пароля |

### Замовлення та склад

| Таблиця          | Призначення |
|-----------------|-------------|
| `orders`        | Замовлення клієнтів |
| `orders_item`   | Позиції замовлення |
| `orders_returns`| Повернення |
| `cart`          | Кошик |
| `warehouses`    | Склади |
| `inventory`     | Залишки товарів на складах |

### Конфігурація системи

| Таблиця          | Призначення |
|-----------------|-------------|
| `langs`         | Активні мови (`uk`, `ru`) |
| `currency`      | Курси валют |
| `settings`      | Налаштування сайту |
| `settings_text` | Текстові налаштування |
| `custom_strings`| Локалізовані рядки UI |
| `measures`      | Одиниці виміру |
| `measures_real` | Реальні одиниці виміру |
| `socials`       | Соціальні мережі |
| `core`          | Ключові бізнес-налаштування |

---

## Швидка шпаргалка для AI-агента

```
ПИТАННЯ: "які товари у категорії X?"
→ products_categories (cid = X) → products (id IN [...], lang='uk')

ПИТАННЯ: "всі фото товару Y?"
→ products_photos (pid = Y) + products_photos2 (pid = Y)

ПИТАННЯ: "характеристики товару Y?"
→ products_chars (pid = Y)

ПИТАННЯ: "підкатегорії категорії X?"
→ categories (pid = X, lang='uk')

ПИТАННЯ: "що таке filter_id у продукті?"
→ ID групи фільтрів з таблиці all_filters

ПИТАННЯ: "як отримати URL зображення?"
→ Поле img/img2 вже містить повний URL. Нічого конкатенувати не потрібно.
→ Базова URL: https://pub-332d2905ae4f48b5878d35d9fdb63ef1.r2.dev

ПИТАННЯ: "де шукати ua/ru версію товару?"
→ products WHERE translation_id = X (знайдеш обидві мови)

ПИТАННЯ: "активні товари тільки?"
→ .eq("active", 1)

ПАРАМЕТРИ ПОШУКУ (GET /api/products):
  ?lang=uk        — мова (uk або ru)
  ?q=блискавка    — пошук по title, pcode, uri
  ?page=1         — сторінка
  ?limit=50       — кількість на сторінку
```
