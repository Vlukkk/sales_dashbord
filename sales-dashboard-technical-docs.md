# Sales Dashboard — техническая документация

> **Проект:** дашборд для анализа продаж, возвратов, SKU, parent SKU, поставщиков и FBA-остатков
> **Текущий статус:** frontend-only static app на React/Vite, данные генерируются Python-скриптом в JSON
> **Текущий деплой:** VPS Ubuntu 24.04, nginx, Basic Auth, порт `8080`, обновление через Git
> **Будущее развитие:** backend API, PostgreSQL, загрузка XML/XLSX/CSV через UI, экспорт CSV/Excel
> **Дата актуализации:** Апрель 2026

---

## Оглавление

- [1. Текущее состояние проекта](#1-текущее-состояние-проекта)
- [2. Текущая архитектура](#2-текущая-архитектура)
- [3. Источники данных и preprocessing](#3-источники-данных-и-preprocessing)
- [4. Frontend](#4-frontend)
- [5. Текущий деплой на VPS](#5-текущий-деплой-на-vps)
- [6. Безопасность текущей версии](#6-безопасность-текущей-версии)
- [7. Ограничения текущей версии](#7-ограничения-текущей-версии)
- [8. Целевая архитектура с базой данных](#8-целевая-архитектура-с-базой-данных)
- [9. Импорт XML/XLSX/CSV в будущей версии](#9-импорт-xmlxlsxcsv-в-будущей-версии)
- [10. Экспорт CSV/Excel в будущей версии](#10-экспорт-csvexcel-в-будущей-версии)
- [11. Backend API в будущей версии](#11-backend-api-в-будущей-версии)
- [12. Обновление данных и деплой](#12-обновление-данных-и-деплой)
- [13. Дорожная карта](#13-дорожная-карта)
- [14. Глоссарий](#14-глоссарий)

---

## 1. Текущее состояние проекта

### 1.1. Что уже реализовано

Проект сейчас работает как статический React-дашборд без backend API и без базы данных.

Реализовано:

- React/Vite frontend в папке `dashboard`.
- Python preprocessing в `scripts/preprocess.py`.
- Генерация JSON-данных в `dashboard/public/data`.
- Аналитика по текущему фильтрованному срезу таблицы.
- Анализ SKU, parent SKU, supplier и возвратов.
- FBA-остатки из отдельной выгрузки Amazon.
- Фильтры по статусу, каналу, поставщику, parent SKU, SKU, customer group, заказу и периоду.
- Карточка SKU с product-info, продажами, возвратами и FBA-stock.
- Деплой на VPS через Git, nginx и Basic Auth.

### 1.2. Что ещё не реализовано

Пока нет:

- PostgreSQL.
- Backend API.
- Пользовательских ролей и JWT.
- UI-загрузки файлов.
- Автоматического импорта XML/XLSX/CSV в базу данных.
- Истории импортов в базе.
- Экспорта CSV/Excel из интерфейса.
- Автоматических обновлений по расписанию.
- HTTPS для dashboard-порта `8080`.

Эти функции описаны ниже как целевое развитие.

### 1.3. Текущий стек

| Слой | Текущая технология |
|------|--------------------|
| Frontend | React 19, TypeScript, Vite |
| UI | Ant Design |
| Charts/mini визуализации | SVG + часть Nivo-зависимостей в проекте |
| Data preprocessing | Python 3 + `openpyxl` |
| Data storage | JSON-файлы в `dashboard/public/data` |
| Web server | nginx |
| Auth | nginx Basic Auth |
| Deploy | GitHub + shell script + nginx reload |
| VPS | Ubuntu 24.04.3 LTS |

---

## 2. Текущая архитектура

### 2.1. Runtime-схема

```text
[Raw exports on VPS]
  product XML
  catalog XLSX
  FBA stock TXT
        |
        v
[scripts/preprocess.py]
        |
        v
[dashboard/public/data/*.json]
  sales.json
  products.json
  inventory.json
        |
        v
[npm run build]
        |
        v
[dashboard/dist]
        |
        v
[rsync to /var/www/sales-dashboard]
        |
        v
[nginx :8080 + Basic Auth]
        |
        v
[Browser]
```

### 2.2. Репозиторий

GitHub:

```text
https://github.com/Vlukkk/sales_dashbord
```

Основные папки:

```text
.
├── dashboard/                 # React/Vite приложение
├── scripts/                   # preprocessing и deploy-скрипты
├── docs/                      # заметки по деплою и эксплуатации
├── DEPLOY.md                  # краткий deploy flow
├── sales-dashboard-technical-docs.md
└── .gitignore
```

### 2.3. Что исключено из Git

В Git не хранятся исходные выгрузки и сгенерированные JSON, потому что они могут содержать клиентские и бизнес-данные:

```text
*.xml
*.xls
*.xlsx
Lagerbestand*.txt
dashboard/public/data/*.json
dashboard/dist/
dashboard/node_modules/
.env*
.claude/
```

Папка `dashboard/public/data` хранится только через `.gitkeep`.

---

## 3. Источники данных и preprocessing

### 3.1. Текущие входные файлы

Файлы лежат в корне проекта на локальной машине и на VPS:

```text
product - 2026-04-06T201032.237.xml
Выгрузка_DE.xlsx
Lagerbestand+f&uuml;r+Versand+durch+Amazon_04-06-2026.txt
```

Назначение:

| Файл | Назначение |
|------|------------|
| `product - 2026-04-06T201032.237.xml` | Продажи, заказы, статусы, суммы, возвраты |
| `Выгрузка_DE.xlsx` | Каталог товаров, SKU, parent SKU, поставщики, характеристики |
| `Lagerbestand+f&uuml;r+Versand+durch+Amazon_04-06-2026.txt` | FBA-остатки, sellable/unsellable stock |

### 3.2. Выходные JSON-файлы

Команда:

```bash
python3 scripts/preprocess.py
```

Генерирует:

```text
dashboard/public/data/sales.json
dashboard/public/data/products.json
dashboard/public/data/inventory.json
```

На последней проверке:

```text
sales.json      234 sales rows
products.json   2337 products, 70 parent groups, 6 suppliers
inventory.json  1491 FBA SKUs, 700 sellable units
```

### 3.3. Логика `preprocess.py`

`scripts/preprocess.py` делает:

- парсит XML продаж;
- фильтрует `Artikelposition`, начинающиеся с `90`;
- приводит денежные поля к числам;
- приводит даты к ISO-like формату;
- читает XLSX-каталог через `openpyxl`;
- связывает продажи с каталогом по SKU;
- строит parent groups;
- добавляет sibling SKU для parent-групп;
- читает FBA TXT как tab-separated file;
- агрегирует `SELLABLE` и `UNSELLABLE` остатки по SKU;
- пишет JSON в `dashboard/public/data`.

### 3.4. Текущие ограничения preprocessing

- Файлы должны лежать в корне проекта с ожидаемыми именами.
- Нет UI для загрузки новых файлов.
- Нет автоматической проверки схемы файла до запуска.
- Нет истории импортов.
- Нет базы данных и UPSERT.
- Если формат колонок изменится, нужно обновлять `preprocess.py`.

---

## 4. Frontend

### 4.1. Текущая структура

```text
dashboard/src/
├── App.tsx
├── main.tsx
├── index.css
├── components/
│   ├── CompactHero/
│   ├── DashboardSidebar/
│   ├── SalesTable/
│   ├── SelectionWorkbench/
│   ├── SkuInfoCard/
│   └── ...
├── constants/
├── context/
├── hooks/
├── providers/
├── types/
└── utils/
```

### 4.2. Ключевой UX-принцип

Дашборд не является общим BI-экраном. Главная цель — ускорить анализ конкретных позиций.

Принцип:

```text
Фильтр таблицы меняет весь аналитический экран.
```

Если выбран supplier:

- показываются купленные SKU этого поставщика;
- видно количество продаж;
- видно наличие возвратов;
- видно return percentage;
- видно FBA stock.

Если выбран parent SKU:

- показываются child SKU, которые реально продались в этом parent за выбранный период;
- по каждому SKU показываются продажи, units, return %, refunded units, FBA stock.

Если выбран конкретный SKU:

- показывается summary по SKU;
- количество продаж;
- процент возврата;
- FBA stock;
- recent orders;
- контекст по parent SKU.

### 4.3. Основные компоненты

| Компонент | Назначение |
|----------|------------|
| `App.tsx` | Главная сборка layout и передача состояния |
| `DataProvider.tsx` | Загрузка `sales.json`, `products.json`, `inventory.json` |
| `useFilters.ts` | Фильтрация продаж |
| `useDashboardAnalytics.ts` | Расчёт текущего selection lens |
| `DashboardSidebar.tsx` | Компактные фильтры |
| `CompactHero.tsx` | Верхний компактный summary |
| `SalesTable.tsx` | Таблица продаж, источник правды для среза |
| `SelectionWorkbench.tsx` | Основной анализ SKU/parent/supplier |
| `SkuInfoCard.tsx` | Drawer-карточка SKU |
| `analytics.ts` | Производные поля, summary, return %, FBA summary |

### 4.4. Текущая сборка

Локально и на сервере:

```bash
cd dashboard
npm install
npm run build
```

Проверка:

```bash
npm run lint
```

На VPS использовался `npm install`, потому что `npm ci` ругался на несинхронность lock-файла.

---

## 5. Текущий деплой на VPS

### 5.1. Сервер

```text
OS: Ubuntu 24.04.3 LTS
App path: /srv/sales_dashbord
Web root: /var/www/sales-dashboard
Public URL: http://138.124.80.128:8080/
Auth: Basic Auth, user admin
```

### 5.2. Почему порт 8080

На сервере уже были сервисы:

- `22/tcp` — SSH;
- `443/tcp` — `xray`;
- `2096/tcp` — `x-ui`;
- `38164/tcp` — `x-ui`;
- `80/tcp` — nginx site `openclaw` для `server_name 138.124.80.128`.

Поэтому dashboard вынесен на `8080/tcp`, чтобы не ломать существующие сервисы.

### 5.3. nginx-конфигурация

Файл:

```text
/etc/nginx/sites-available/sales-dashboard
```

Конфиг:

```nginx
server {
    listen 8080;
    listen [::]:8080;

    server_name _;

    root /var/www/sales-dashboard;
    index index.html;

    auth_basic "Sales Dashboard";
    auth_basic_user_file /etc/nginx/.sales-dashboard.htpasswd;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /data/ {
        try_files $uri =404;
    }
}
```

### 5.4. Basic Auth

Создание пароля:

```bash
htpasswd -c /etc/nginx/.sales-dashboard.htpasswd admin
```

Смена пароля:

```bash
htpasswd /etc/nginx/.sales-dashboard.htpasswd admin
systemctl reload nginx
```

### 5.5. UFW

Текущая логика правил:

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 2096/tcp
ufw allow 38164/tcp
ufw allow 8080/tcp
ufw --force enable
ufw status numbered
```

Перед изменением firewall всегда проверять текущие порты:

```bash
ss -tulpn
ufw status numbered
```

---

## 6. Безопасность текущей версии

Что есть сейчас:

- nginx Basic Auth на dashboard-порту;
- UFW активен;
- сырьевые файлы и JSON не хранятся в Git;
- dashboard не использует backend secrets;
- доступ к данным закрыт тем же Basic Auth, потому что `/data/*.json` отдаются через nginx.

Ограничения:

- Basic Auth — простой механизм, не полноценная пользовательская система;
- нет HTTPS на `8080`;
- пароль нужно хранить вне документации;
- все пользователи с паролем имеют одинаковый доступ;
- JSON-данные доступны целиком авторизованному пользователю.

Рекомендуемые следующие шаги:

- привязать домен/поддомен;
- перевести dashboard на HTTPS;
- заменить слабые пароли;
- позже перейти на backend-auth с ролями.

---

## 7. Ограничения текущей версии

Текущая версия подходит для MVP и ручного анализа, но не является полноценной data-platform.

Ограничения:

- данные обновляются вручную через загрузку файлов на VPS и запуск preprocessing;
- нет валидации импортируемых файлов в UI;
- нет журнала импортов;
- нет отката импорта;
- нет многопользовательской авторизации;
- нет разграничения прав;
- нет постоянной БД;
- нет API;
- нет scheduled refresh;
- нет экспорта отчётов из UI.

---

## 8. Целевая архитектура с базой данных

### 8.1. Целевая схема

```text
[Browser]
    |
    v
[nginx HTTPS]
    |
    +--> [React static files]
    |
    +--> /api/* -> [Node.js backend]
                    |
                    v
              [PostgreSQL]
                    |
                    v
              [data_imports, sales, returns, skus, inventory]
```

### 8.2. Рекомендуемый стек будущего backend

| Слой | Рекомендация |
|------|--------------|
| Backend | Node.js + Fastify или Express |
| Validation | Zod |
| DB | PostgreSQL 16 |
| DB access | Prisma или Kysely |
| File upload | multipart/form-data |
| Background jobs | BullMQ или простой worker на первом этапе |
| Auth | JWT + httpOnly cookies или server sessions |
| Export | streaming CSV |

### 8.3. ERD целевой БД

```text
suppliers 1 ── N sku_supplier N ── 1 skus
skus      1 ── N sales
skus      1 ── N returns
skus      1 ── N inventory_snapshots
data_imports 1 ── N import_errors
data_imports 1 ── N imported_files
users 1 ── N data_imports
```

### 8.4. Таблица `skus`

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | BIGSERIAL PK | Внутренний ID |
| `sku_code` | TEXT UNIQUE NOT NULL | Seller SKU |
| `vendor_sku` | TEXT | Vendor SKU из каталога |
| `asin` | TEXT | Amazon ASIN, если известен |
| `title` | TEXT | Название товара |
| `parent_sku` | TEXT | Parent SKU из каталога |
| `product_type` | TEXT | Тип товара |
| `status` | TEXT | Статус из каталога |
| `metal_type` | TEXT | Металл |
| `metal_alloy` | TEXT | Проба/сплав |
| `length` | NUMERIC | Длина |
| `width` | NUMERIC | Ширина |
| `weight` | NUMERIC | Вес |
| `raw_attributes` | JSONB | Остальные поля каталога |
| `created_at` | TIMESTAMPTZ | Создано |
| `updated_at` | TIMESTAMPTZ | Обновлено |

### 8.5. Таблица `suppliers`

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | BIGSERIAL PK | Внутренний ID |
| `name` | TEXT UNIQUE NOT NULL | Поставщик |
| `created_at` | TIMESTAMPTZ | Создано |
| `updated_at` | TIMESTAMPTZ | Обновлено |

### 8.6. Таблица `sku_supplier`

| Поле | Тип | Описание |
|------|-----|----------|
| `sku_id` | BIGINT FK | SKU |
| `supplier_id` | BIGINT FK | Поставщик |
| `purchase_price` | NUMERIC | Закупочная цена |
| `currency` | TEXT | Валюта |
| `is_primary` | BOOLEAN | Основной поставщик |

Уникальность:

```sql
UNIQUE (sku_id, supplier_id)
```

### 8.7. Таблица `sales`

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | BIGSERIAL PK | Внутренний ID |
| `order_number` | TEXT | Bestellung # |
| `sku_id` | BIGINT FK | SKU |
| `sku_code` | TEXT | Денормализованный SKU для диагностики |
| `order_status` | TEXT | Status des Auftrags |
| `order_date` | TIMESTAMPTZ | Bestelldatum |
| `customer_group` | TEXT | Kundengruppe |
| `channel` | TEXT | Производный или импортированный канал |
| `country` | TEXT | Land |
| `city` | TEXT | Stadt |
| `qty_ordered` | INT | Qty. Ordered |
| `qty_invoiced` | INT | Qty. Invoiced |
| `qty_shipped` | INT | Qty. Shipped |
| `qty_refunded` | INT | Qty. Refunded |
| `price` | NUMERIC | Preis |
| `total_incl_tax` | NUMERIC | Total Incl. Tax |
| `refunded_incl_tax` | NUMERIC | Refunded Incl. Tax |
| `total_cost` | NUMERIC | Total Cost |
| `total_profit` | NUMERIC | Total Profit |
| `total_margin` | NUMERIC | Total Margin |
| `raw_record` | JSONB | Исходная строка |
| `import_id` | BIGINT FK | Импорт |
| `created_at` | TIMESTAMPTZ | Создано |

Рекомендуемый ключ идемпотентности:

```sql
UNIQUE (order_number, sku_code)
```

Если появятся строки без `order_number`, нужен отдельный `source_row_hash`.

### 8.8. Таблица `returns`

На первом этапе возвраты можно считать из `sales.qty_refunded` и `sales.refunded_incl_tax`.

Отдельная таблица нужна, если появится отдельная выгрузка возвратов:

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | BIGSERIAL PK | Внутренний ID |
| `sale_id` | BIGINT FK NULL | Связь с продажей |
| `sku_id` | BIGINT FK | SKU |
| `return_date` | TIMESTAMPTZ | Дата возврата |
| `reason` | TEXT | Причина |
| `qty` | INT | Количество |
| `refund_amount` | NUMERIC | Сумма |
| `status` | TEXT | Статус |
| `raw_record` | JSONB | Исходная строка |
| `import_id` | BIGINT FK | Импорт |

### 8.9. Таблица `inventory_snapshots`

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | BIGSERIAL PK | Внутренний ID |
| `sku_id` | BIGINT FK | SKU |
| `sku_code` | TEXT | Seller SKU |
| `asin` | TEXT | ASIN |
| `fulfillment_channel_sku` | TEXT | FNSKU |
| `condition_type` | TEXT | Condition |
| `sellable_qty` | INT | SELLABLE |
| `unsellable_qty` | INT | UNSELLABLE |
| `snapshot_date` | DATE | Дата выгрузки |
| `import_id` | BIGINT FK | Импорт |
| `raw_record` | JSONB | Исходная строка |

Уникальность:

```sql
UNIQUE (sku_code, snapshot_date)
```

### 8.10. Таблица `data_imports`

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | BIGSERIAL PK | Внутренний ID |
| `source_type` | TEXT | `sales_xml`, `catalog_xlsx`, `inventory_txt`, `csv`, `manual` |
| `filename` | TEXT | Имя файла |
| `file_hash` | TEXT | SHA-256 |
| `status` | TEXT | `pending`, `processing`, `completed`, `failed`, `rolled_back` |
| `rows_total` | INT | Всего строк |
| `rows_inserted` | INT | Вставлено |
| `rows_updated` | INT | Обновлено |
| `rows_skipped` | INT | Пропущено |
| `error_message` | TEXT | Общая ошибка |
| `imported_by` | BIGINT FK | Пользователь |
| `created_at` | TIMESTAMPTZ | Создано |
| `started_at` | TIMESTAMPTZ | Начато |
| `finished_at` | TIMESTAMPTZ | Завершено |

### 8.11. Таблица `import_errors`

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | BIGSERIAL PK | Внутренний ID |
| `import_id` | BIGINT FK | Импорт |
| `row_number` | INT | Номер строки |
| `sku_code` | TEXT | SKU, если найден |
| `field_name` | TEXT | Поле |
| `message` | TEXT | Ошибка |
| `raw_record` | JSONB | Исходная строка |

### 8.12. Индексы

```sql
CREATE INDEX idx_skus_sku_code ON skus (sku_code);
CREATE INDEX idx_skus_parent_sku ON skus (parent_sku);
CREATE INDEX idx_sales_order_date ON sales (order_date);
CREATE INDEX idx_sales_sku_id ON sales (sku_id);
CREATE INDEX idx_sales_order_status ON sales (order_status);
CREATE INDEX idx_sales_channel ON sales (channel);
CREATE INDEX idx_inventory_snapshot_date ON inventory_snapshots (snapshot_date);
CREATE INDEX idx_inventory_sku_id ON inventory_snapshots (sku_id);
CREATE INDEX idx_data_imports_status ON data_imports (status);
```

---

## 9. Импорт XML/XLSX/CSV в будущей версии

### 9.1. Текущий статус

Сейчас загрузки через UI нет.

Текущий процесс:

```text
Пользователь загружает файлы на сервер через SFTP/Termius
    |
    v
Запускается scripts/preprocess.py
    |
    v
Генерируются JSON-файлы
    |
    v
Пересобирается static frontend
```

### 9.2. Целевой процесс импорта

```text
[Admin загружает XML/XLSX/CSV в UI]
    |
    v
[Backend сохраняет файл во временное хранилище]
    |
    v
[Определение типа файла]
    |
    v
[Preview: первые N строк + распознанный mapping]
    |
    v
[Пользователь подтверждает mapping]
    |
    v
[Validation]
    |
    v
[Transaction в PostgreSQL]
    |
    v
[UPSERT/replace month/snapshot insert]
    |
    v
[data_imports + import_errors]
    |
    v
[Frontend обновляет данные через API]
```

### 9.3. Поддерживаемые типы импорта

| Тип | Формат | Цель |
|-----|--------|------|
| Sales XML | XML Spreadsheet | Продажи, заказы, суммы, возвраты |
| Catalog XLSX | Excel | SKU, parent SKU, поставщики, характеристики |
| Inventory TXT | TSV/TXT | FBA sellable/unsellable остатки |
| Generic CSV | CSV | Будущие выгрузки продаж/возвратов/каталога |

### 9.4. Режимы обновления БД

| Режим | Описание | Применение |
|-------|----------|------------|
| `upsert` | Вставить новые строки, обновить существующие | Продажи по `order_number + sku_code` |
| `replace_period` | Удалить/деактивировать данные периода и загрузить заново | Помесячные отчёты |
| `snapshot` | Добавить снимок на дату без удаления прошлых | FBA inventory |
| `catalog_merge` | Обновить карточки SKU и supplier-связи | Каталог |
| `dry_run` | Только проверить и показать preview/errors | Перед реальным импортом |

### 9.5. Валидация

Минимальные проверки:

- файл имеет поддерживаемый формат;
- обязательные колонки найдены;
- даты парсятся;
- денежные значения парсятся;
- SKU не пустой;
- количество не отрицательное;
- parent SKU корректно сохраняется;
- импорт не дублирует уже загруженный файл по `file_hash`, если режим не разрешает повтор.

### 9.6. Ошибки импорта

Ошибки должны писаться в `import_errors`, а UI должен показывать:

- сколько строк обработано;
- сколько вставлено;
- сколько обновлено;
- сколько пропущено;
- список ошибок с номером строки и исходным значением;
- возможность скачать CSV с ошибками.

### 9.7. Минимальный UI будущей загрузки

Страница `Import`:

- drag-and-drop файла;
- выбор типа файла: `Sales XML`, `Catalog XLSX`, `Inventory TXT`, `CSV`;
- выбор режима: `dry_run`, `upsert`, `replace_period`, `snapshot`;
- preview первых строк;
- mapping колонок для CSV/XLSX;
- кнопка `Validate`;
- кнопка `Import`;
- журнал последних импортов.

---

## 10. Экспорт CSV/Excel в будущей версии

### 10.1. Текущий статус

Сейчас выгрузки CSV/Excel из UI нет.

Пользователь может только смотреть данные в дашборде. JSON лежит на сервере, но это не пользовательский экспорт.

### 10.2. Целевые экспорты

| Export | Описание |
|--------|----------|
| `sales_filtered.csv` | Строки продаж с текущими фильтрами |
| `sku_summary.csv` | SKU summary: orders, units, return %, refunded units, FBA stock |
| `parent_summary.csv` | Parent summary по проданным child SKU |
| `supplier_summary.csv` | Supplier summary |
| `returns.csv` | Возвраты/строки с `qty_refunded > 0` |
| `inventory.csv` | Последний FBA snapshot |
| `import_errors.csv` | Ошибки конкретного импорта |

### 10.3. API для экспорта

```text
GET /api/export/sales.csv
GET /api/export/skus.csv
GET /api/export/parents.csv
GET /api/export/suppliers.csv
GET /api/export/returns.csv
GET /api/export/inventory.csv
GET /api/imports/:id/errors.csv
```

Все endpoints должны принимать те же фильтры, что и экран:

```text
date_from
date_to
sku
parent_sku
supplier
status
channel
customer_group
has_returns
low_stock
```

### 10.4. Требования к CSV

- UTF-8 with BOM опционально для Excel;
- `;` как delimiter для европейского Excel или настройка delimiter;
- даты в ISO и человекочитаемом формате;
- денежные поля как числа, без символа валюты;
- отдельные колонки для `return_rate`, `sellable_qty`, `parent_sku`, `supplier`.

---

## 11. Backend API в будущей версии

### 11.1. Auth

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

На первом этапе можно использовать session cookie. Для командного доступа — отдельные API tokens.

### 11.2. Dashboard data

```text
GET /api/dashboard/summary
GET /api/dashboard/sku-lens
GET /api/dashboard/parent-lens
GET /api/dashboard/supplier-lens
```

### 11.3. Sales

```text
GET /api/sales
GET /api/sales/:id
GET /api/sales/summary
```

### 11.4. SKU

```text
GET /api/skus
GET /api/skus/:sku
GET /api/skus/:sku/sales
GET /api/skus/:sku/returns
GET /api/skus/:sku/inventory
GET /api/parents/:parentSku/children
```

### 11.5. Suppliers

```text
GET /api/suppliers
GET /api/suppliers/:id
GET /api/suppliers/:id/skus
```

### 11.6. Imports

```text
POST /api/imports/upload
POST /api/imports/:id/validate
POST /api/imports/:id/run
GET  /api/imports
GET  /api/imports/:id
GET  /api/imports/:id/errors
```

### 11.7. Exports

```text
GET /api/export/sales.csv
GET /api/export/skus.csv
GET /api/export/parents.csv
GET /api/export/suppliers.csv
GET /api/export/returns.csv
GET /api/export/inventory.csv
```

---

## 12. Обновление данных и деплой

### 12.1. Текущий update flow на VPS

На сервере:

```bash
cd /srv/sales_dashbord
git pull
./scripts/deploy.sh
```

Если скрипт не исполняемый:

```bash
chmod +x scripts/deploy.sh
```

### 12.2. Что делает `scripts/deploy.sh`

```text
git pull --ff-only
ensure .venv
pip install --upgrade openpyxl
python3 scripts/preprocess.py
cd dashboard
npm install
npm run build
rsync dist/ -> /var/www/sales-dashboard/
nginx -t
systemctl reload nginx
```

### 12.3. Ручной update flow

```bash
cd /srv/sales_dashbord
git pull --ff-only
. .venv/bin/activate
python3 scripts/preprocess.py
cd dashboard
npm install
npm run build
rsync -a --delete dist/ /var/www/sales-dashboard/
nginx -t
systemctl reload nginx
```

### 12.4. Smoke tests

Без пароля:

```bash
curl -I http://127.0.0.1:8080/
```

Ожидаемо:

```text
HTTP/1.1 401 Unauthorized
```

С паролем:

```bash
curl -I -u admin:'PASSWORD' http://127.0.0.1:8080/
curl -I -u admin:'PASSWORD' http://127.0.0.1:8080/data/sales.json
curl -I -u admin:'PASSWORD' http://127.0.0.1:8080/data/products.json
curl -I -u admin:'PASSWORD' http://127.0.0.1:8080/data/inventory.json
```

Ожидаемо:

```text
HTTP/1.1 200 OK
```

---

## 13. Дорожная карта

### 13.1. Уже сделано

- [x] React/Vite dashboard.
- [x] Filter-driven SKU/parent/supplier analysis.
- [x] FBA inventory integration.
- [x] Python preprocessing XML/XLSX/TXT -> JSON.
- [x] GitHub repository.
- [x] VPS deployment.
- [x] nginx Basic Auth.
- [x] UFW setup without breaking existing `xray/x-ui/openclaw`.
- [x] Deploy script.

### 13.2. Ближайшие улучшения текущей версии

- [ ] Синхронизировать `package-lock.json`, чтобы на VPS снова работал `npm ci`.
- [ ] Сжать bundle или вынести тяжёлые chart-зависимости в lazy chunks.
- [ ] Добавить кнопку CSV export на frontend из текущих JSON-данных.
- [ ] Добавить версию/дату последнего импорта в UI.
- [ ] Добавить проверку наличия всех JSON при старте приложения.
- [ ] Добавить HTTPS через домен или reverse-proxy за существующей инфраструктурой.

### 13.3. Следующий крупный этап: database MVP

- [ ] Поднять PostgreSQL.
- [ ] Создать миграции для `skus`, `suppliers`, `sales`, `inventory_snapshots`, `data_imports`, `import_errors`.
- [ ] Перенести `preprocess.py`-логику в backend import pipeline или shared parser.
- [ ] Сделать backend read API для dashboard.
- [ ] Сделать upload API для XML/XLSX/TXT/CSV.
- [ ] Сделать импорт с `dry_run`.
- [ ] Сделать журнал импортов.
- [ ] Сделать экспорт CSV.
- [ ] Перевести frontend с JSON fetch на API fetch.

### 13.4. Дальнейшее развитие

- [ ] Роли пользователей: admin/manager/analyst.
- [ ] Планировщик импортов.
- [ ] Интеграция Amazon API.
- [ ] Автоматические anomaly alerts по возвратам и low stock.
- [ ] Бэкапы PostgreSQL.
- [ ] OpenAPI/Swagger документация.

---

## 14. Глоссарий

| Термин | Определение |
|--------|-------------|
| SKU | Stock Keeping Unit, уникальный артикул товара |
| Parent SKU | Родительский SKU, объединяющий вариации товара |
| FBA | Fulfillment by Amazon |
| Sellable | Доступный к продаже FBA-остаток |
| Unsellable | Непригодный к продаже FBA-остаток |
| Return % | В текущем MVP считается как `refundedUnits / orderedUnits * 100` |
| Basic Auth | Простая HTTP-авторизация на уровне nginx |
| UPSERT | Insert or update |
| Snapshot | Снимок состояния на конкретную дату, например inventory |
| Dry run | Проверка импорта без записи в БД |
| Web root | Папка, из которой nginx отдаёт static build |
