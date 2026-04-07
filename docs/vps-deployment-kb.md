# VPS Deployment Notes: Sales Dashboard

## Итоговая схема

- Репозиторий: `https://github.com/Vlukkk/sales_dashbord`
- Папка приложения на VPS: `/srv/sales_dashbord`
- Папка статического сайта для nginx: `/var/www/sales-dashboard`
- Внешний URL: `http://138.124.80.128:8080/`
- Авторизация: nginx Basic Auth, пользователь `admin`
- Firewall: `ufw` включен, дашборд открыт на `8080/tcp`
- `443/tcp` не трогаем, потому что он занят `xray`
- `80/tcp` занят существующим nginx-сайтом `openclaw` для `138.124.80.128`

## Почему дашборд висит на 8080

На сервере уже были активные сервисы:

- `22/tcp` - SSH
- `443/tcp` - `xray`
- `2096/tcp` - `x-ui`
- `38164/tcp` - `x-ui`
- `80/tcp` - nginx site `openclaw` с `server_name 138.124.80.128`

Поэтому для Sales Dashboard выбран отдельный порт `8080`, чтобы не ломать существующий `openclaw` и VPN/proxy-инфраструктуру.

## Что не хранится в Git

В Git не пушим исходные выгрузки и сгенерированные JSON, потому что там могут быть клиентские и бизнес-данные:

- `*.xml`
- `*.xls`
- `*.xlsx`
- `Lagerbestand*.txt`
- `dashboard/public/data/*.json`
- `dashboard/dist/`
- `dashboard/node_modules/`
- `.env*`

Папка `dashboard/public/data` есть в Git только через `.gitkeep`.

## Первый деплой, который был выполнен

### 1. Проверили сервер

```bash
cat /etc/os-release
whoami
```

Сервер:

```text
Ubuntu 24.04.3 LTS
root
```

### 2. Установили базовые пакеты

```bash
apt update
apt install -y git curl nginx ufw apache2-utils rsync python3 python3-pip python3.12-venv
```

Проверки:

```bash
git --version
nginx -v
python3 --version
```

### 3. Установили Node.js 22 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
```

Проверки:

```bash
node -v
npm -v
```

Фактически:

```text
node v22.22.2
npm 10.9.7
```

### 4. Проверили текущие порты

```bash
ufw status verbose
ss -tulpn
```

`ufw` был `inactive`, но на сервере уже слушали `ssh`, `xray`, `x-ui`, `openclaw`.

### 5. Включили UFW, не ломая существующие сервисы

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 2096/tcp
ufw allow 38164/tcp
ufw --force enable
ufw status numbered
```

Позже добавили порт дашборда:

```bash
ufw allow 8080/tcp
ufw status numbered
```

### 6. Клонировали репозиторий

```bash
mkdir -p /srv
cd /srv
git clone https://github.com/Vlukkk/sales_dashbord.git
cd /srv/sales_dashbord
```

### 7. Загрузили исходные файлы данных через Termius SFTP

Файлы загрузили в `/srv/sales_dashbord`:

```text
product - 2026-04-06T201032.237.xml
Выгрузка_DE.xlsx
Lagerbestand+f&uuml;r+Versand+durch+Amazon_04-06-2026.txt
```

Проверка:

```bash
cd /srv/sales_dashbord
ls -lah
```

### 8. Сгенерировали JSON-данные

```bash
cd /srv/sales_dashbord
python3 -m venv .venv
. .venv/bin/activate
pip install openpyxl
python3 scripts/preprocess.py
ls -lah dashboard/public/data
```

Итог:

```text
sales.json
products.json
inventory.json
```

### 9. Собрали frontend

```bash
cd /srv/sales_dashbord/dashboard
npm install
npm run build
ls -lah dist
```

Важно: на VPS использовали `npm install`, потому что `npm ci` ругался на несовпадение `package.json` и `package-lock.json`.

### 10. Опубликовали static build в web root

```bash
mkdir -p /var/www/sales-dashboard
rsync -a --delete /srv/sales_dashbord/dashboard/dist/ /var/www/sales-dashboard/
ls -lah /var/www/sales-dashboard
ls -lah /var/www/sales-dashboard/data
```

### 11. Создали Basic Auth пароль

```bash
htpasswd -c /etc/nginx/.sales-dashboard.htpasswd admin
ls -lah /etc/nginx/.sales-dashboard.htpasswd
```

Пароль в заметках не хранить.

### 12. Создали nginx site

Файл: `/etc/nginx/sites-available/sales-dashboard`

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

Включили site:

```bash
ln -s /etc/nginx/sites-available/sales-dashboard /etc/nginx/sites-enabled/sales-dashboard
nginx -t
systemctl start nginx
systemctl reload nginx
```

Если nginx уже активен, достаточно:

```bash
nginx -t
systemctl reload nginx
```

### 13. Проверили доступ

Без пароля:

```bash
curl -I http://127.0.0.1:8080/
```

Ожидаемо:

```text
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Basic realm="Sales Dashboard"
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

В браузере:

```text
http://138.124.80.128:8080/
```

## Обновление после push в Git

На сервере:

```bash
cd /srv/sales_dashbord
./scripts/deploy.sh
```

Если скрипт ещё не исполняемый:

```bash
chmod +x /srv/sales_dashbord/scripts/deploy.sh
```

## Ручной update flow без скрипта

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

## Смена пароля

```bash
htpasswd /etc/nginx/.sales-dashboard.htpasswd admin
systemctl reload nginx
```

## Быстрая диагностика

```bash
ufw status numbered
systemctl status nginx --no-pager
ss -tulpn | grep ':8080'
nginx -t
curl -I http://127.0.0.1:8080/
curl -I -u admin:'PASSWORD' http://127.0.0.1:8080/
```
