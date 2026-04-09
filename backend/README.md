# Sales Dashboard Backend

Первый backend-слой для перехода с JSON на PostgreSQL.

## Что внутри

- `sql/001_init.sql` — начальная схема PostgreSQL.
- `src/server.ts` — Fastify API.
- `src/routes/*` — базовые read-only эндпоинты.
- `../scripts/import_to_postgres.py` — загрузка XML/XLSX/TXT в PostgreSQL.
- `GET /api/dashboard/bootstrap` — API-выход в JSON-формате, совместимом с текущим фронтом.

## Источники данных

- продажи: последний `product - *.xml` из папки `data/`
- поставщики: `SKU-Lieferant.xlsx` как master file
- остатки FBA: текущий `Lagerbestand...txt`

## Локальный запуск

Самый простой способ обновить локальную БД:

```bash
cd /Users/vvlukk/Kode/Dashbord
./scripts/db_refresh.sh
```

Скрипт сам:

- поднимет PostgreSQL в Docker
- дождётся готовности БД
- применит схему
- загрузит продажи, поставщиков и остатки в PostgreSQL

1. Поднять PostgreSQL:

```bash
docker compose -f ../docker-compose.postgres.yml up -d
```

2. Установить зависимости backend:

```bash
cd backend
npm install
```

3. Установить Python-драйвер PostgreSQL:

```bash
python3 -m pip install "psycopg[binary]"
```

4. Создать `.env`:

```bash
cp .env.example .env
```

5. Применить схему:

```bash
cd backend
set -a && source .env && set +a
psql "$DATABASE_URL" -f sql/001_init.sql
```

6. Загрузить данные в PostgreSQL:

```bash
cd ..
set -a && source backend/.env && set +a
python3 scripts/import_to_postgres.py
```

7. Запустить API:

```bash
cd backend
npm run dev
```

8. При желании переключить фронт на БД-источник:

```bash
cd dashboard
VITE_DATA_SOURCE=api VITE_API_BASE_URL=http://localhost:4000 npm run dev
```

## Полезные эндпоинты

- `GET /health`
- `GET /api/dashboard/bootstrap`
- `GET /api/meta`
- `GET /api/imports`
- `GET /api/inventory/latest/suppliers`
- `GET /api/inventory/latest/suppliers/:supplierName`
