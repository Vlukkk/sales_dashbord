# Sales Dashboard — Техническая документация

> **Проект:** Дашборд аналитики продаж  
> **Стек:** Node.js + React + PostgreSQL + Nginx + Docker  
> **Инфраструктура:** Собственный VPS-сервер  
> **Пользователи:** Команда 2–10 человек  
> **Дата:** Апрель 2026

---

## Оглавление

- [Этап 0. Обзор проекта](#этап-0-обзор-проекта)
- [Этап 1. Инфраструктура и безопасность](#этап-1-инфраструктура-и-безопасность)
- [Этап 2. База данных](#этап-2-база-данных)
- [Этап 3. Механизм загрузки данных](#этап-3-механизм-загрузки-данных)
- [Этап 4. Backend — REST API](#этап-4-backend--rest-api)
- [Этап 5. Frontend — React-приложение](#этап-5-frontend--react-приложение)
- [Этап 6. Развёртывание на VPS](#этап-6-развёртывание-на-vps)
- [Этап 7. Резервное копирование и мониторинг](#этап-7-резервное-копирование-и-мониторинг)
- [Этап 8. Дорожная карта](#этап-8-дорожная-карта)
- [Глоссарий](#глоссарий)
- [Рекомендуемые нотации для документации](#рекомендуемые-нотации-для-документации)

---

## Этап 0. Обзор проекта

### Цели системы

Веб-дашборд для аналитики продаж с доступом из любой точки мира через интернет. Система агрегирует данные из нескольких источников (Amazon Seller Board, Excel-файлы, другие источники) и предоставляет визуальную аналитику по продажам, возвратам и поставщикам.

### Ключевые требования

- **Доступность:** Веб-интерфейс, доступный по HTTPS из любой точки
- **Безопасность:** Авторизация, шифрование, защита от атак
- **Источники данных:** Amazon Seller Board, Excel-файлы, другие источники
- **Связь данных:** Через SKU (артикул). SKU может иметь parent (цепочка: длина, вес и т.д.)
- **Основные сущности:** Продажи, возвраты, поставщики, SKU
- **Функции пользователей:** Просмотр данных, фильтрация, выгрузка отчётов
- **Загрузка данных:** Ручная — выгрузка на компьютер → загрузка на сервер через скрипт/интерфейс

### Стек технологий

| Слой | Технология |
|------|-----------|
| Frontend | React |
| Backend | Node.js (Express) |
| База данных | PostgreSQL |
| Веб-сервер / Reverse proxy | Nginx |
| Контейнеризация | Docker + Docker Compose |
| Сервер | Собственный VPS |

---

## Этап 1. Инфраструктура и безопасность

### 1.1. Схема развёртывания

```
[Интернет]
    │
    ▼
[Nginx] ── HTTPS/TLS (Let's Encrypt)
    │
    ├── /api/*  →  [Node.js Backend :3000]
    │                    │
    │                    ▼
    │              [PostgreSQL :5432]
    │
    └── /*      →  [React Static Files]
```

### 1.2. Сетевая безопасность

- **Firewall (UFW/iptables):** Открыты только порты 80, 443, SSH (с нестандартным портом)
- **Fail2ban:** Защита от brute-force атак на SSH и HTTP
- **HTTPS/TLS:** Let's Encrypt сертификат через Certbot, автообновление
- **Docker network:** Изоляция контейнеров, PostgreSQL недоступен извне

### 1.3. Аутентификация и авторизация

- **JWT токены** в httpOnly cookies (не в localStorage)
- Refresh-токены с ротацией
- Время жизни access-токена: 15 минут
- Время жизни refresh-токена: 7 дней

### 1.4. Роли пользователей

| Роль | Права |
|------|-------|
| **Admin** | Управление пользователями, загрузка данных, полный доступ |
| **Manager** | Просмотр всех данных, фильтры, выгрузка отчётов |
| **Analyst** | Просмотр ограниченного набора данных |

### 1.5. Задачи этапа

- [ ] Арендовать / настроить VPS (минимум 2 CPU, 4 GB RAM, 40 GB SSD)
- [ ] Установить Docker и Docker Compose
- [ ] Настроить UFW: открыть 80, 443, SSH
- [ ] Установить и настроить Fail2ban
- [ ] Настроить Nginx с HTTPS (Let's Encrypt)
- [ ] Настроить SSH: ключи, отключить пароль, нестандартный порт

---

## Этап 2. База данных

### 2.1. Схема таблиц (ERD — Crow's Foot нотация)

```
┌─────────────┐       ┌──────────────────┐       ┌──────────────┐
│  suppliers   │       │   sku_supplier   │       │     skus     │
├─────────────┤       ├──────────────────┤       ├──────────────┤
│ id (PK)     │──1:N──│ supplier_id (FK) │       │ id (PK)      │
│ name        │       │ sku_id (FK)      │──N:1──│ sku_code     │
│ contact     │       │ unit_cost        │       │ title        │
│ country     │       │ currency         │       │ parent_sku   │
│ notes       │       │ lead_time_days   │       │ category     │
│ created_at  │       └──────────────────┘       │ weight       │
└─────────────┘                                  │ length       │
                                                 │ width        │
                                                 │ height       │
                                                 │ status       │
                                                 │ created_at   │
                                                 └──────┬───────┘
                                                        │
                                           ┌────────────┼────────────┐
                                           │ 1:N                1:N  │
                                           ▼                         ▼
                                   ┌──────────────┐         ┌──────────────┐
                                   │    sales     │         │   returns    │
                                   ├──────────────┤         ├──────────────┤
                                   │ id (PK)      │         │ id (PK)      │
                                   │ sku_id (FK)  │         │ sku_id (FK)  │
                                   │ sale_date    │         │ sale_id (FK) │
                                   │ channel      │         │ return_date  │
                                   │ marketplace  │         │ reason       │
                                   │ quantity     │         │ quantity     │
                                   │ revenue      │         │ refund_amount│
                                   │ currency     │         │ status       │
                                   │ fees         │         │ created_at   │
                                   │ net_revenue  │         └──────────────┘
                                   │ source_file  │
                                   │ created_at   │
                                   └──────────────┘

                                   ┌──────────────┐
                                   │ data_imports  │
                                   ├──────────────┤
                                   │ id (PK)      │
                                   │ filename     │
                                   │ source_type  │
                                   │ rows_total   │
                                   │ rows_inserted│
                                   │ rows_updated │
                                   │ rows_skipped │
                                   │ status       │
                                   │ imported_by  │
                                   │ started_at   │
                                   │ finished_at  │
                                   └──────────────┘
```

### 2.2. Таблица `skus`

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | SERIAL PK | Внутренний ID |
| `sku_code` | VARCHAR(100) UNIQUE NOT NULL | Артикул — **главный ключ связи** |
| `title` | VARCHAR(500) | Название товара |
| `parent_sku_id` | INT FK → skus.id | Родительский SKU (для вариаций) |
| `category` | VARCHAR(200) | Категория |
| `weight` | DECIMAL(10,3) | Вес (кг) |
| `length`, `width`, `height` | DECIMAL(10,2) | Габариты (см) |
| `status` | ENUM('active','inactive','discontinued') | Статус |
| `created_at` | TIMESTAMP | Дата создания записи |

> **Важно:** `parent_sku_id` — self-reference. Позволяет строить цепочки SKU (parent → child) для группировки вариаций товара.

### 2.3. Таблица `sales`

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | SERIAL PK | Внутренний ID |
| `sku_id` | INT FK → skus.id NOT NULL | Ссылка на товар |
| `sale_date` | DATE NOT NULL | Дата продажи |
| `channel` | VARCHAR(50) | Канал (Amazon, Website и т.д.) |
| `marketplace` | VARCHAR(50) | Маркетплейс (US, UK, DE и т.д.) |
| `quantity` | INT | Количество |
| `revenue` | DECIMAL(12,2) | Выручка |
| `currency` | VARCHAR(3) | Валюта |
| `fees` | DECIMAL(12,2) | Комиссии |
| `net_revenue` | DECIMAL(12,2) | Чистая выручка |
| `source_file` | VARCHAR(500) | Из какого файла загружено |
| `created_at` | TIMESTAMP | Дата создания записи |

### 2.4. Таблица `returns`

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | SERIAL PK | Внутренний ID |
| `sku_id` | INT FK → skus.id | Ссылка на товар |
| `sale_id` | INT FK → sales.id | Ссылка на оригинальную продажу (опционально) |
| `return_date` | DATE | Дата возврата |
| `reason` | VARCHAR(200) | Причина |
| `quantity` | INT | Количество |
| `refund_amount` | DECIMAL(12,2) | Сумма возврата |
| `status` | ENUM('pending','completed','rejected') | Статус |
| `created_at` | TIMESTAMP | Дата создания записи |

### 2.5. Таблица `suppliers`

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | SERIAL PK | Внутренний ID |
| `name` | VARCHAR(300) NOT NULL | Название поставщика |
| `contact` | VARCHAR(500) | Контактная информация |
| `country` | VARCHAR(100) | Страна |
| `notes` | TEXT | Заметки |
| `created_at` | TIMESTAMP | Дата создания записи |

### 2.6. Таблица `sku_supplier` (связь N:M)

| Поле | Тип | Описание |
|------|-----|----------|
| `sku_id` | INT FK → skus.id | Ссылка на товар |
| `supplier_id` | INT FK → suppliers.id | Ссылка на поставщика |
| `unit_cost` | DECIMAL(10,2) | Себестоимость за единицу |
| `currency` | VARCHAR(3) | Валюта закупки |
| `lead_time_days` | INT | Срок поставки в днях |

### 2.7. Таблица `data_imports` (журнал загрузок)

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | SERIAL PK | Внутренний ID |
| `filename` | VARCHAR(500) | Имя загруженного файла |
| `source_type` | ENUM('amazon_sb','excel','csv','other') | Тип источника |
| `rows_total` | INT | Всего строк в файле |
| `rows_inserted` | INT | Вставлено новых |
| `rows_updated` | INT | Обновлено |
| `rows_skipped` | INT | Пропущено (дубликаты/ошибки) |
| `status` | ENUM('processing','completed','failed') | Статус импорта |
| `imported_by` | INT FK → users.id | Кто загрузил |
| `started_at` | TIMESTAMP | Начало импорта |
| `finished_at` | TIMESTAMP | Окончание импорта |

### 2.8. Индексы

```sql
CREATE INDEX idx_sales_sku_id ON sales(sku_id);
CREATE INDEX idx_sales_date ON sales(sale_date);
CREATE INDEX idx_sales_channel ON sales(channel);
CREATE INDEX idx_returns_sku_id ON returns(sku_id);
CREATE INDEX idx_returns_date ON returns(return_date);
CREATE INDEX idx_skus_parent ON skus(parent_sku_id);
CREATE INDEX idx_skus_code ON skus(sku_code);
```

### 2.9. Задачи этапа

- [ ] Установить PostgreSQL (через Docker)
- [ ] Создать базу данных и пользователя
- [ ] Выполнить SQL-миграции: создать все таблицы
- [ ] Создать индексы
- [ ] Заполнить тестовыми данными для проверки

---

## Этап 3. Механизм загрузки данных

### 3.1. Общий процесс

```
[Пользователь выгружает файлы]     Amazon SB / Excel / CSV
         │
         ▼
[Загрузка на сервер]                POST /api/import/upload
         │
         ▼
[Парсинг файла]                     Определение формата и маппинг колонок
         │
         ▼
[Валидация строк]                   Проверка обязательных полей, форматов
         │
         ▼
[UPSERT / Append в БД]             Обработка дубликатов
         │
         ▼
[Журнал импорта]                    Запись в data_imports
         │
         ▼
[Уведомление]                       Статус: успех / ошибки
```

### 3.2. Режимы загрузки

| Режим | Поведение | Когда использовать |
|-------|-----------|-------------------|
| **UPSERT** | Если запись с таким ключом есть — обновить, нет — вставить | Помесячные отчёты Amazon SB |
| **Append** | Всегда вставлять новые записи | Разовые выгрузки из новых источников |

### 3.3. Обработка дубликатов

Уникальность записи продажи определяется составным ключом:

```
(sku_code + sale_date + channel + marketplace)
```

При UPSERT — если такая комбинация уже есть, обновляются числовые поля (quantity, revenue, fees).

### 3.4. Маппинг источников данных

#### Amazon Seller Board
```
Колонка в файле        →    Поле в БД
─────────────────────────────────────────
SKU / ASIN             →    skus.sku_code
Date                   →    sales.sale_date
Units Ordered          →    sales.quantity
Product Sales          →    sales.revenue
Selling Fees           →    sales.fees
Net Revenue            →    sales.net_revenue
Marketplace            →    sales.marketplace
```

#### Excel / CSV
```
Маппинг настраивается при первой загрузке.
Пользователь сопоставляет колонки файла с полями БД.
Конфигурация маппинга сохраняется для повторного использования.
```

### 3.5. Помесячная загрузка — правило хранения

- При загрузке данных за месяц (например, Март 2026) — данные за этот месяц перезаписываются (UPSERT)
- Исторические данные за прошлые месяцы не затрагиваются
- Каждая загрузка фиксируется в таблице `data_imports`

### 3.6. Задачи этапа

- [ ] Реализовать эндпоинт загрузки файлов (`multer`)
- [ ] Написать парсеры: Amazon SB, Excel (xlsx), CSV
- [ ] Реализовать маппинг колонок (конфигурируемый)
- [ ] Реализовать UPSERT-логику
- [ ] Реализовать журнал импорта с подсчётом строк
- [ ] Написать UI-страницу для загрузки файлов
- [ ] Тестирование на реальных файлах

---

## Этап 4. Backend — REST API

### 4.1. Аутентификация

| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/api/auth/login` | Вход, получение JWT |
| POST | `/api/auth/refresh` | Обновление токена |
| POST | `/api/auth/logout` | Выход |
| GET | `/api/auth/me` | Текущий пользователь |

### 4.2. SKU

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/skus` | Список SKU с фильтрами и пагинацией |
| GET | `/api/skus/:id` | Детали SKU |
| GET | `/api/skus/:id/children` | Дочерние SKU |
| POST | `/api/skus` | Создать SKU (Admin) |
| PUT | `/api/skus/:id` | Обновить SKU (Admin) |

### 4.3. Продажи

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/sales` | Список продаж с фильтрами |
| GET | `/api/sales/summary` | Агрегаты: по дням, месяцам, каналам |
| GET | `/api/sales/top-skus` | Топ SKU по выручке |
| GET | `/api/sales/by-channel` | Продажи в разрезе каналов |
| GET | `/api/sales/by-marketplace` | Продажи в разрезе маркетплейсов |

### 4.4. Возвраты

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/returns` | Список возвратов с фильтрами |
| GET | `/api/returns/summary` | Агрегаты: процент возвратов, причины |
| GET | `/api/returns/by-reason` | Группировка по причинам |

### 4.5. Поставщики

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/suppliers` | Список поставщиков |
| GET | `/api/suppliers/:id` | Детали поставщика |
| GET | `/api/suppliers/:id/skus` | SKU этого поставщика |
| POST | `/api/suppliers` | Создать поставщика (Admin) |

### 4.6. Импорт данных

| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/api/import/upload` | Загрузка файла |
| GET | `/api/import/history` | История импортов |
| GET | `/api/import/:id/status` | Статус конкретного импорта |

### 4.7. Экспорт

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/export/sales` | Выгрузка продаж (CSV/Excel) |
| GET | `/api/export/returns` | Выгрузка возвратов (CSV/Excel) |

### 4.8. Общие параметры фильтрации

```
?date_from=2026-01-01
?date_to=2026-03-31
?sku_code=ABC123
?channel=amazon
?marketplace=US
?page=1
?limit=50
?sort_by=revenue
?sort_order=desc
```

### 4.9. Задачи этапа

- [ ] Инициализировать проект Node.js (Express)
- [ ] Настроить подключение к PostgreSQL (pg / knex / prisma)
- [ ] Реализовать JWT-аутентификацию и middleware
- [ ] Реализовать CRUD для каждой сущности
- [ ] Реализовать агрегатные эндпоинты (summary, top-skus)
- [ ] Реализовать экспорт в CSV/Excel
- [ ] Валидация входных данных (Joi / Zod)
- [ ] Обработка ошибок (централизованный error handler)
- [ ] Тестирование API (Postman / Jest)

---

## Этап 5. Frontend — React-приложение

### 5.1. Структура страниц

```
src/
├── pages/
│   ├── Login.jsx              — Страница входа
│   ├── Dashboard.jsx          — Главный дашборд (графики и метрики)
│   ├── Sales.jsx              — Таблица продаж с фильтрами
│   ├── Returns.jsx            — Таблица возвратов
│   ├── SKUs.jsx               — Каталог SKU (с иерархией parent/child)
│   ├── Suppliers.jsx          — Список поставщиков
│   ├── Import.jsx             — Загрузка файлов
│   └── Settings.jsx           — Управление пользователями (Admin)
├── components/
│   ├── charts/                — Компоненты графиков
│   ├── tables/                — Таблицы с сортировкой и пагинацией
│   ├── filters/               — Панели фильтрации
│   └── layout/                — Header, Sidebar, Layout
├── hooks/                     — Кастомные хуки (useAuth, useFetch)
├── services/                  — API-клиент (axios)
└── utils/                     — Форматирование, хелперы
```

### 5.2. Ключевые метрики на дашборде

- **Продажи по дням / месяцам** — линейный график
- **Топ SKU по выручке** — горизонтальная столбчатая диаграмма
- **Продажи по каналам** — круговая диаграмма
- **Процент возвратов** — карточка с трендом
- **Чистая выручка** — KPI-карточка
- **Маржа по поставщикам** — таблица

### 5.3. Библиотеки

| Библиотека | Назначение |
|-----------|-----------|
| React Router | Роутинг |
| Recharts / Chart.js | Графики |
| Ant Design / MUI | UI-компоненты |
| Axios | HTTP-запросы |
| React Query (TanStack) | Кэширование и управление запросами |
| Day.js | Работа с датами |

### 5.4. Задачи этапа

- [ ] Создать React-проект (Vite)
- [ ] Настроить роутинг и Layout
- [ ] Реализовать страницу Login + интеграция с JWT
- [ ] Реализовать главный Dashboard с графиками
- [ ] Реализовать страницу Sales (таблица + фильтры)
- [ ] Реализовать страницу Returns
- [ ] Реализовать страницу SKUs с иерархией
- [ ] Реализовать страницу Import (загрузка файлов)
- [ ] Реализовать экспорт данных (кнопка скачивания)
- [ ] Адаптивная вёрстка
- [ ] Тестирование UI

---

## Этап 6. Развёртывание на VPS

### 6.1. Требования к серверу

| Параметр | Минимум | Рекомендуется |
|----------|---------|---------------|
| CPU | 2 ядра | 4 ядра |
| RAM | 4 GB | 8 GB |
| Диск | 40 GB SSD | 80 GB SSD |
| ОС | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |

### 6.2. Docker Compose (структура)

```yaml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d
      - ./certbot/www:/var/www/certbot
      - ./certbot/conf:/etc/letsencrypt
      - ./frontend/build:/usr/share/nginx/html
    depends_on:
      - backend
    restart: always

  backend:
    build: ./backend
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=sales_dashboard
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${DB_PASSWORD}
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - postgres
    restart: always

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=sales_dashboard
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: always
    # НЕ пробрасываем порт наружу — доступ только из Docker-сети

volumes:
  pgdata:
```

### 6.3. Чеклист первого запуска

- [ ] Клонировать репозиторий на VPS
- [ ] Создать `.env` файл с секретами
- [ ] `docker compose up -d --build`
- [ ] Настроить SSL: `certbot certonly --webroot`
- [ ] Проверить доступ по HTTPS
- [ ] Создать первого пользователя (Admin) через CLI-скрипт
- [ ] Загрузить первый файл с данными
- [ ] Проверить отображение на дашборде

### 6.4. Задачи этапа

- [ ] Написать Dockerfile для backend
- [ ] Написать docker-compose.yml
- [ ] Настроить Nginx конфигурацию
- [ ] Настроить SSL (Let's Encrypt + Certbot)
- [ ] Настроить CI/CD (опционально: GitHub Actions → SSH deploy)
- [ ] Провести smoke-тестирование на сервере

---

## Этап 7. Резервное копирование и мониторинг

### 7.1. Резервное копирование БД

```bash
# Ежедневный бэкап через cron
0 3 * * * docker exec postgres pg_dump -U $DB_USER sales_dashboard | gzip > /backups/db_$(date +\%Y\%m\%d).sql.gz

# Хранить последние 30 бэкапов
find /backups -name "db_*.sql.gz" -mtime +30 -delete
```

- Дополнительно: копирование бэкапов в облако (S3 / Backblaze / Google Cloud Storage)
- Тестировать восстановление из бэкапа ежемесячно

### 7.2. Мониторинг

- **Логи контейнеров:** `docker compose logs -f`
- **Uptime-мониторинг:** UptimeRobot / Healthchecks.io (бесплатно)
- **Health-эндпоинт:** `GET /api/health` — проверка статуса backend и БД
- **Дисковое пространство:** Алерт при заполнении > 80%

### 7.3. Задачи этапа

- [ ] Настроить cron для бэкапов
- [ ] Настроить копирование бэкапов в облако
- [ ] Реализовать `/api/health` эндпоинт
- [ ] Подключить внешний мониторинг (UptimeRobot)
- [ ] Документировать процедуру восстановления из бэкапа

---

## Этап 8. Дорожная карта

### Фаза 1 — MVP (4–6 недель)

| Неделя | Задачи |
|--------|--------|
| 1–2 | Инфраструктура: VPS, Docker, PostgreSQL, Nginx, HTTPS |
| 2–3 | Backend: API аутентификации, CRUD для SKU/Sales/Returns |
| 3–4 | Импорт данных: парсеры Amazon SB и Excel, UPSERT |
| 4–5 | Frontend: Dashboard, таблицы, фильтры |
| 5–6 | Тестирование, деплой, загрузка реальных данных |

### Фаза 2 — Улучшения (после MVP)

- Автоматический маппинг новых форматов файлов
- Расширенная аналитика: маржа, ROI по SKU
- Уведомления (email) при аномалиях в данных
- Интеграция с Amazon API (автозагрузка вместо ручной)
- Мультивалютность и конвертация

### Фаза 3 — Масштабирование

- Кэширование (Redis) для тяжёлых агрегатов
- Планировщик задач (cron/Bull) для автообновления
- Экспорт отчётов в PDF
- Расширение ролей и прав доступа

---

## Глоссарий

| Термин | Определение |
|--------|-------------|
| **SKU** | Stock Keeping Unit — уникальный артикул товара |
| **Parent SKU** | Родительский артикул, объединяющий вариации товара |
| **UPSERT** | INSERT + UPDATE: вставить если нет, обновить если есть |
| **Amazon SB** | Amazon Seller Board — панель продавца Amazon |
| **JWT** | JSON Web Token — токен авторизации |
| **VPS** | Virtual Private Server — виртуальный выделенный сервер |
| **Reverse Proxy** | Nginx принимает запросы и перенаправляет к нужному сервису |

---

## Рекомендуемые нотации для документации

Для дальнейшего развития документации проекта рекомендуются следующие нотации:

| Нотация | Применение в проекте |
|---------|---------------------|
| **C4 Model** | Общая архитектура: Context → Container → Component → Code |
| **Crow's Foot ERD** | Схема базы данных (уже используется выше) |
| **OpenAPI / Swagger** | Описание REST API в YAML — автогенерация документации |
| **BPMN / Flowchart** | Процесс загрузки файлов, бизнес-логика |
| **Docs as Code** | Документация в Markdown рядом с кодом в репозитории |
