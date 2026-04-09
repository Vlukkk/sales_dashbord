# Server Database Refresh

## Цель

На сервере есть две отдельные линии обновления:

- `git pull` обновляет код
- `db_refresh_server.sh` обновляет PostgreSQL из raw-файлов

БД не обновляется от Git сама по себе. Для обновления БД нужно положить новые raw-файлы и запустить refresh script.

## Server Raw Data Layout

Рекомендуемая структура на VPS:

```text
/srv/sales_dashbord/
  raw/
    sales/
      product - 2026-04-09T211630.093.xml
    master/
      Выгрузка_DE.xlsx
      SKU-Lieferant.xlsx
    inventory/
      Lagerbestand+f&uuml;r+Versand+durch+Amazon_04-06-2026.txt
```

Где что хранить:

- `raw/sales/` — sales XML файлы
- `raw/master/Выгрузка_DE.xlsx` — product catalog
- `raw/master/SKU-Lieferant.xlsx` — supplier master file
- `raw/inventory/` — FBA inventory snapshots

## Важное правило по продажам

Текущий безопасный режим:

- script берёт только **последний** `product - *.xml` из `raw/sales/`

Это означает:

- если ты скачал новый полный XML, положи его в `raw/sales/`
- старые overlapping XML лучше убрать из `raw/sales/`, чтобы не было путаницы

Пока мы **не делаем** merge нескольких sales XML в историю. Для этого нужен отдельный staging/import flow.

## One-Time Server Bootstrap

Один раз на сервере нужно:

1. Иметь установленный Docker с Compose
2. Иметь репозиторий в `/srv/sales_dashbord`
3. Иметь Python 3 и возможность создать `.venv`

## Update Code

Когда в Git появились изменения кода:

```bash
cd /srv/sales_dashbord
git pull --ff-only origin main
```

## Put New Files

После того как скачал новые данные:

1. Sales XML положить в:

```text
/srv/sales_dashbord/raw/sales/
```

2. Если обновился supplier master, заменить:

```text
/srv/sales_dashbord/raw/master/SKU-Lieferant.xlsx
```

3. Если обновился product catalog, заменить:

```text
/srv/sales_dashbord/raw/master/Выгрузка_DE.xlsx
```

4. Новый FBA inventory snapshot положить в:

```text
/srv/sales_dashbord/raw/inventory/
```

## One Command To Refresh Database

После `git pull` и загрузки raw-файлов:

```bash
cd /srv/sales_dashbord
./scripts/db_refresh_server.sh
```

Что делает script:

- создаёт ожидаемые raw directories
- валидирует, что нужные файлы существуют
- поднимает PostgreSQL container
- ждёт готовности БД
- применяет schema migrations
- импортирует sales, catalog, suppliers и inventory в PostgreSQL
- печатает контрольные counts

## Что происходит после refresh

Если backend уже работает и читает PostgreSQL:

- новые данные становятся доступны сразу после успешного импорта
- backend не нужно перезапускать только из-за новых данных

Если после `git pull` менялся сам backend-код, тогда backend-service нужно перезапустить отдельно.

## Daily Working Flow

Обычный рабочий цикл:

1. Скачать новые raw-файлы
2. Закинуть их на сервер в `raw/...`
3. Выполнить:

```bash
cd /srv/sales_dashbord
git pull --ff-only origin main
./scripts/db_refresh_server.sh
```

## What The Script Uses

`db_refresh_server.sh` использует:

- `raw/sales/` как источник продаж
- `raw/master/` как master data
- `raw/inventory/` как snapshots

Внутри Python-слоя это прокидывается через env vars:

- `SALES_DATA_DIR`
- `MASTER_DATA_DIR`
- `INVENTORY_DATA_DIR`

Поэтому код больше не жёстко привязан к файлам в корне проекта.
