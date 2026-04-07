#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/sales_dashbord}"
DASHBOARD_DIR="$APP_DIR/dashboard"
WEB_ROOT="${WEB_ROOT:-/var/www/sales-dashboard}"
VENV_DIR="$APP_DIR/.venv"

cd "$APP_DIR"

echo "==> Pull latest code"
git pull --ff-only

echo "==> Ensure Python environment"
if [ ! -d "$VENV_DIR" ]; then
  python3 -m venv "$VENV_DIR"
fi

# shellcheck source=/dev/null
. "$VENV_DIR/bin/activate"
pip install --quiet --upgrade openpyxl

echo "==> Generate dashboard JSON data"
python3 scripts/preprocess.py

echo "==> Install frontend dependencies"
cd "$DASHBOARD_DIR"
npm install

echo "==> Build frontend"
npm run build

echo "==> Publish static build"
mkdir -p "$WEB_ROOT"
rsync -a --delete "$DASHBOARD_DIR/dist/" "$WEB_ROOT/"

echo "==> Validate and reload nginx"
nginx -t
systemctl reload nginx

echo "==> Done"
echo "Dashboard web root: $WEB_ROOT"
