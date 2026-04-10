# Backend Systemd Service

## Цель

Backend API должен жить не через `nohup`, а через `systemd`, чтобы:

- подниматься после reboot
- перезапускаться при падении
- управляться через `systemctl`
- писать логи в `journalctl`

## Service File

Шаблон лежит в репозитории:

- `deploy/systemd/sales-dashboard-backend.service`

## One-Time Install On Server

Скопировать unit в systemd:

```bash
cp /srv/sales_dashbord/deploy/systemd/sales-dashboard-backend.service /etc/systemd/system/
```

Перечитать unit-файлы:

```bash
systemctl daemon-reload
```

Включить автозапуск и сразу запустить:

```bash
systemctl enable --now sales-dashboard-backend
```

## Verify

Проверить статус:

```bash
systemctl status sales-dashboard-backend --no-pager
```

Проверить health:

```bash
curl http://127.0.0.1:4000/health
curl http://127.0.0.1:4000/api/meta
```

Посмотреть логи:

```bash
journalctl -u sales-dashboard-backend -n 100 --no-pager
```

Live logs:

```bash
journalctl -u sales-dashboard-backend -f
```

## Update Flow After Git Pull

Если менялся backend-код:

```bash
cd /srv/sales_dashbord/backend
npm ci
npm run build
systemctl restart sales-dashboard-backend
```

Если менялись только данные:

- backend restart не нужен
- достаточно обновить БД через `./scripts/db_refresh_server.sh`

## Required Env File

Backend ждёт:

- `/srv/sales_dashbord/backend/.env`

Минимальный рабочий вариант:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/sales_dashboard
PORT=4000
CORS_ORIGIN=*
```

## Full Working Server Sequence

### 1. Обновить код

```bash
cd /srv/sales_dashbord
git pull --ff-only origin main
```

### 2. Обновить БД

```bash
cd /srv/sales_dashbord
./scripts/db_refresh_server.sh
```

### 3. Если менялся backend-код, пересобрать и перезапустить API

```bash
cd /srv/sales_dashbord/backend
npm ci
npm run build
systemctl restart sales-dashboard-backend
```

### 4. Если менялся frontend-код, пересобрать сайт

```bash
cd /srv/sales_dashbord/dashboard
VITE_DATA_SOURCE=api VITE_API_BASE_URL=http://127.0.0.1:4000 npm run build
rsync -a --delete dist/ /var/www/sales-dashboard/
nginx -t
systemctl reload nginx
```
