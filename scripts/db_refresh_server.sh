#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/sales_dashbord}"
BACKEND_DIR="$APP_DIR/backend"
COMPOSE_FILE="${COMPOSE_FILE:-$APP_DIR/docker-compose.postgres.yml}"
CONTAINER_NAME="${POSTGRES_CONTAINER_NAME:-sales-dashboard-postgres}"
RAW_DATA_DIR="${RAW_DATA_DIR:-$APP_DIR/raw}"
SALES_DATA_DIR="${SALES_DATA_DIR:-$RAW_DATA_DIR/sales}"
MASTER_DATA_DIR="${MASTER_DATA_DIR:-$RAW_DATA_DIR/master}"
INVENTORY_DATA_DIR="${INVENTORY_DATA_DIR:-$RAW_DATA_DIR/inventory}"
VENV_DIR="${VENV_DIR:-$APP_DIR/.venv}"
DATABASE_URL="${DATABASE_URL:-}"

cd "$APP_DIR"

if [ -z "$DATABASE_URL" ] && [ -f "$BACKEND_DIR/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  . "$BACKEND_DIR/.env"
  set +a
  DATABASE_URL="${DATABASE_URL:-}"
fi

DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/sales_dashboard}"

echo "==> Ensure raw data directories"
mkdir -p "$SALES_DATA_DIR" "$MASTER_DATA_DIR" "$INVENTORY_DATA_DIR"
echo "Sales data dir: $SALES_DATA_DIR"
echo "Master data dir: $MASTER_DATA_DIR"
echo "Inventory data dir: $INVENTORY_DATA_DIR"

echo "==> Validate required source files"
RAW_DATA_DIR="$RAW_DATA_DIR" \
SALES_DATA_DIR="$SALES_DATA_DIR" \
MASTER_DATA_DIR="$MASTER_DATA_DIR" \
INVENTORY_DATA_DIR="$INVENTORY_DATA_DIR" \
python3 - <<'PY'
from pathlib import Path
import sys

try:
    from scripts.preprocess import SALES_XML, CATALOG_XLSX, LIEFERANT_XLSX, INVENTORY_TXT
except Exception as exc:  # pragma: no cover - bash entrypoint validation
    print(f"Source validation failed: {exc}", file=sys.stderr)
    sys.exit(1)

for label, path in (
    ("Sales source", SALES_XML),
    ("Catalog source", CATALOG_XLSX),
    ("Lieferanten source", LIEFERANT_XLSX),
    ("Inventory source", INVENTORY_TXT),
):
    print(f"{label}: {path}")
    if not Path(path).exists():
        print(f"Missing required file: {path}", file=sys.stderr)
        sys.exit(1)
PY

echo "==> Ensure Python environment"
if [ ! -d "$VENV_DIR" ]; then
  python3 -m venv "$VENV_DIR"
fi

# shellcheck source=/dev/null
. "$VENV_DIR/bin/activate"
pip install --quiet --upgrade pip
pip install --quiet --upgrade openpyxl "psycopg[binary]"

echo "==> Ensure Docker is available"
docker info >/dev/null

echo "==> Start PostgreSQL container"
docker compose -f "$COMPOSE_FILE" up -d

echo "==> Wait for PostgreSQL readiness"
until docker exec "$CONTAINER_NAME" pg_isready -U postgres -d sales_dashboard >/dev/null 2>&1; do
  sleep 1
done

echo "==> Apply database schema"
DATABASE_URL="$DATABASE_URL" python3 "$APP_DIR/scripts/apply_postgres_schema.py"

echo "==> Import business data into PostgreSQL"
RAW_DATA_DIR="$RAW_DATA_DIR" \
SALES_DATA_DIR="$SALES_DATA_DIR" \
MASTER_DATA_DIR="$MASTER_DATA_DIR" \
INVENTORY_DATA_DIR="$INVENTORY_DATA_DIR" \
DATABASE_URL="$DATABASE_URL" \
python3 "$APP_DIR/scripts/import_to_postgres.py"

echo "==> Verify critical counts"
DATABASE_URL="$DATABASE_URL" python3 - <<'PY'
import os
import psycopg

queries = [
    ("sales_rows", "select count(*) from sales"),
    ("skus", "select count(*) from skus"),
    ("suppliers", "select count(*) from suppliers"),
    ("latest_snapshot", "select max(snapshot_date)::text from inventory_snapshots"),
]

with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
    with conn.cursor() as cur:
        for label, query in queries:
            cur.execute(query)
            value = cur.fetchone()[0]
            print(f"{label}: {value}")
PY

echo "==> Done"
echo "Database URL: $DATABASE_URL"
echo "Refresh command: $APP_DIR/scripts/db_refresh_server.sh"
