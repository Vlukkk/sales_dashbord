# Sales Dashboard Deployment

## Repository contents

The repository stores application code, build configuration, and preprocessing scripts.

Raw exports and generated dashboard data are intentionally excluded from Git:

- `*.xml`
- `*.xls`
- `*.xlsx`
- `Lagerbestand*.txt`
- `dashboard/public/data/*.json`

Those files can contain customer and business data. Keep the repository private anyway.

## Local data generation

Place these source files in the repository root:

- `product - 2026-04-06T201032.237.xml`
- `Выгрузка_DE.xlsx`
- `Lagerbestand+f&uuml;r+Versand+durch+Amazon_04-06-2026.txt`

Then run:

```bash
python3 scripts/preprocess.py
```

This generates:

```text
dashboard/public/data/sales.json
dashboard/public/data/products.json
dashboard/public/data/inventory.json
```

## Build

```bash
cd dashboard
npm ci
npm run build
```

The static site is generated in:

```text
dashboard/dist
```

## VPS update flow

```bash
cd /srv/sales_dashbord
./scripts/deploy.sh
```

Nginx serves `/var/www/sales-dashboard` on port `8080` with Basic Auth enabled.

## PostgreSQL server refresh

DB-backed refresh flow is documented separately:

- [docs/server-db-refresh.md](docs/server-db-refresh.md)
- [docs/backend-systemd.md](docs/backend-systemd.md)

Manual fallback:

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
