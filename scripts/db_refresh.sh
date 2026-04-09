#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$APP_DIR/backend"
COMPOSE_FILE="$APP_DIR/docker-compose.postgres.yml"
CONTAINER_NAME="${POSTGRES_CONTAINER_NAME:-sales-dashboard-postgres}"
DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/sales_dashboard}"

cd "$APP_DIR"

echo "==> Ensure Docker is available"
docker info >/dev/null

echo "==> Ensure backend env file"
if [ ! -f "$BACKEND_DIR/.env" ]; then
  cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
fi

echo "==> Start PostgreSQL container"
docker compose -f "$COMPOSE_FILE" up -d

echo "==> Wait for PostgreSQL readiness"
until docker exec "$CONTAINER_NAME" pg_isready -U postgres -d sales_dashboard >/dev/null 2>&1; do
  sleep 1
done

echo "==> Apply database schema"
docker exec -i "$CONTAINER_NAME" psql -U postgres -d sales_dashboard < "$BACKEND_DIR/sql/001_init.sql"

echo "==> Import business data into PostgreSQL"
DATABASE_URL="$DATABASE_URL" python3 "$APP_DIR/scripts/import_to_postgres.py"

echo "==> Verify critical counts"
docker exec -i "$CONTAINER_NAME" psql -U postgres -d sales_dashboard -c "
select count(*) as sales_rows from sales;
select count(*) as skus from skus;
select count(*) as suppliers from suppliers;
select max(snapshot_date) as latest_snapshot from inventory_snapshots;
"

echo "==> Done"
echo "Database URL: $DATABASE_URL"
echo "Next step: cd $BACKEND_DIR && npm run dev"
