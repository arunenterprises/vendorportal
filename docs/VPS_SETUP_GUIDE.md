# ARUN ENTERPRISES VENDOR PORTAL — Server Setup & Hostinger VPS Migration Guide

Portal domain: **https://vendor.arunenterprisespryg.in**
ERP (upstream) API: **https://erp.arunenterprisespryg.in/api**
Backend port: **8003** · Frontend build served by Nginx · Database: MongoDB (two databases)

---

## 0. What you are installing

| Piece | What it is | Where it runs |
|---|---|---|
| Backend | FastAPI (Python 3.11) | 127.0.0.1:**8003** |
| Frontend | React build (static files) | /var/www/vendor-portal |
| Database | MongoDB 7 | 127.0.0.1:27017 |
| Web server | Nginx (HTTPS + reverse proxy) | ports 80 / 443 |

Two databases are used on purpose:

- `arun_vendor_portal` — vendors, work orders, bills, documents (refilled from the ERP on every sync)
- `arun_vendor_auth` — **logins only** (users, sessions). The ERP sync never touches it, so a sync can never disturb anyone's login.

No CORS configuration is needed anywhere: Nginx serves the site and `/api` from the same domain.

---

## 1. Create the VPS (Hostinger)

1. Hostinger panel → **VPS → Create / Manage**.
2. Plan: KVM 2 or higher (2 vCPU, 8 GB RAM recommended).
3. OS template: **Ubuntu 24.04 LTS** (plain, not with a panel).
4. Set the root password and note the server IP, e.g. `203.0.113.10`.
5. DNS (where arunenterprisespryg.in is managed) → add an **A record**:
   - Name: `vendor` · Type: `A` · Value: `203.0.113.10` · TTL: 3600
6. Wait until `ping vendor.arunenterprisespryg.in` answers with your VPS IP.

## 2. First login and basic hardening

```bash
ssh root@203.0.113.10

apt update && apt -y upgrade
apt -y install ufw fail2ban git curl unzip
adduser arun                 # a normal user for day-to-day work
usermod -aG sudo arun

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable           # port 8003 is NOT opened: it stays internal
systemctl enable --now fail2ban
```

## 3. Install the runtimes

```bash
# Python 3.11 + tools
apt -y install python3.11 python3.11-venv python3-pip

# Node 20 (to build the frontend)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt -y install nodejs
npm install -g yarn

# MongoDB 7
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | gpg --dearmor -o /usr/share/keyrings/mongo.gpg
echo "deb [signed-by=/usr/share/keyrings/mongo.gpg] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/7.0 multiverse" > /etc/apt/sources.list.d/mongodb.list
apt update && apt -y install mongodb-org
systemctl enable --now mongod

# Nginx + certificates
apt -y install nginx certbot python3-certbot-nginx
```

## 4. Directory layout

```bash
mkdir -p /srv/vendor-portal          # application code
mkdir -p /var/www/vendor-portal      # built frontend (what visitors get)
mkdir -p /var/log/vendor-portal      # logs
chown -R arun:arun /srv/vendor-portal /var/www/vendor-portal /var/log/vendor-portal
```

Put the code in place (upload the ZIP from Emergent, or `git clone`):

```bash
cd /srv/vendor-portal
unzip ~/vendor-portal.zip .      # creates backend/ and frontend/
```

## 5. Backend setup (port 8003)

```bash
cd /srv/vendor-portal/backend
python3.11 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
```

Create `/srv/vendor-portal/backend/.env`:

```ini
MONGO_URL="mongodb://127.0.0.1:27017"
DB_NAME="arun_vendor_portal"
AUTH_DB_NAME="arun_vendor_auth"

APP_URL="https://vendor.arunenterprisespryg.in"

ARUN_PORTAL_URL="https://erp.arunenterprisespryg.in"
ARUN_PORTAL_IDENTIFIER="arunenterprises2023@gmail.com"
ARUN_PORTAL_PASSWORD="<your ERP password — unchanged>"

WEBHOOK_CRON_SECRET="<any long random string>"
```

Protect it: `chmod 600 .env`

Service file `/etc/systemd/system/vendor-portal-api.service`:

```ini
[Unit]
Description=Arun Enterprises Vendor Portal API
After=network.target mongod.service

[Service]
User=arun
WorkingDirectory=/srv/vendor-portal/backend
ExecStart=/srv/vendor-portal/backend/.venv/bin/uvicorn server:app --host 127.0.0.1 --port 8003 --workers 2
Restart=always
RestartSec=3
StandardOutput=append:/var/log/vendor-portal/api.log
StandardError=append:/var/log/vendor-portal/api.err.log

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now vendor-portal-api
curl -s http://127.0.0.1:8003/api/        # must answer
```

## 6. First-run data setup

```bash
cd /srv/vendor-portal/backend
.venv/bin/python seed.py              # creates the owner login
.venv/bin/python migrate_auth_db.py   # moves logins to arun_vendor_auth + makes the owner SuperAdmin
```

Owner login: `arunenterprises2023@gmail.com` — role **SuperAdmin** (password unchanged).
Vendors sign in with their **vendor code as both the login ID and the password**.

## 7. Frontend build

```bash
cd /srv/vendor-portal/frontend
yarn install
yarn build
cp -r dist/* /var/www/vendor-portal/
```

(Re-run these four lines after every code update.)

## 8. Nginx — one domain, no CORS

`/etc/nginx/sites-available/vendor-portal`:

```nginx
server {
    listen 80;
    server_name vendor.arunenterprisespryg.in;

    root /var/www/vendor-portal;
    index index.html;
    client_max_body_size 10M;

    # the React app — every deep link falls back to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # the API, same origin, so no cross-origin headers are required
    location /api/ {
        proxy_pass http://127.0.0.1:8003;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/vendor-portal /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
certbot --nginx -d vendor.arunenterprisespryg.in --redirect --agree-tos -m arunenterprises2023@gmail.com
```

## 9. Automatic ERP sync every 15 minutes

```bash
crontab -u arun -e
```

Add:

```cron
*/15 * * * * curl -s -X POST -H "Authorization: Bearer <WEBHOOK_CRON_SECRET>" https://vendor.arunenterprisespryg.in/api/cron/sync-arun >> /var/log/vendor-portal/sync.log 2>&1
```

## 10. Daily backup (both databases)

```bash
printf '%s\n' '#!/bin/bash' \
 'D=/var/backups/mongo/$(date +%F)' \
 'mkdir -p $D' \
 'mongodump --db arun_vendor_portal --out $D' \
 'mongodump --db arun_vendor_auth --out $D' \
 'find /var/backups/mongo -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +' \
 > /usr/local/bin/mongo-backup.sh
chmod +x /usr/local/bin/mongo-backup.sh
echo "15 2 * * * /usr/local/bin/mongo-backup.sh" | crontab -u root -
```

Restore when needed: `mongorestore --drop /var/backups/mongo/<date>`

## 11. Go-live checklist

1. `https://vendor.arunenterprisespryg.in` opens with the padlock.
2. SuperAdmin signs in; the sidebar shows **SuperAdmin**.
3. Admin → **Sync from Workflow Portal** pulls vendors, work orders and bills from the ERP.
4. A vendor signs in with their vendor code and sees only their own records.
5. Bills → PDF downloads; Admin → Bills → Export to Excel downloads.
6. `systemctl status vendor-portal-api mongod nginx` — all three active.

## 12. Everyday commands

| Task | Command |
|---|---|
| Restart API | `systemctl restart vendor-portal-api` |
| API logs | `tail -f /var/log/vendor-portal/api.err.log` |
| Rebuild frontend | `cd /srv/vendor-portal/frontend && yarn build && cp -r dist/* /var/www/vendor-portal/` |
| Reload Nginx | `nginx -t && systemctl reload nginx` |
| Renew certificate | `certbot renew --dry-run` (renewal is automatic) |
| Manual sync | `curl -X POST -H "Authorization: Bearer <SECRET>" https://vendor.arunenterprisespryg.in/api/cron/sync-arun` |

## 13. If something breaks

| Symptom | Fix |
|---|---|
| 502 Bad Gateway | API is down → `systemctl status vendor-portal-api`, read `api.err.log` |
| Blank page on refresh | `try_files ... /index.html` missing in Nginx |
| Login works, data empty | run a sync; check `ARUN_PORTAL_*` values in `.env` |
| Sync 502 / timeout | ERP unreachable → `curl -I https://erp.arunenterprisespryg.in/api` |
| Nobody can log in | check `arun_vendor_auth` exists: `mongosh --eval 'db.getMongo().getDBNames()'` |

## 14. Roles and logins (November 2026 update)

| Role | What it can do |
|---|---|
| SuperAdmin | Everything, plus create portal users and change their role / permissions |
| Admin | Change portal data (sync, payment status, work-order status, documents) |
| Staff | View only; can be limited to chosen vendors |
| Vendor | Sees only its own vendor details, work orders, bills and payment status |

- Owner login: `arunenterprises2023@gmail.com` — role **SuperAdmin**. The backend
  re-applies this role and the password from `ARUN_PORTAL_IDENTIFIER` /
  `ARUN_PORTAL_PASSWORD` on every start, so the owner can never be locked out.
- Vendors sign in with their **vendor code as BOTH the login ID and the password**.
- **Staff vendor access**: Admin Command Center -> Portal Users -> "Vendor Access"
  on a staff row. Tick the vendors that staff member may see; "Allow all" clears
  the limit. A limited staff login then sees only those vendors everywhere —
  dashboard, vendors, work orders, bills, payment register and the Excel export.

## 15. One database or two?

`AUTH_DB_NAME` decides where logins are stored. On your own VPS keep two
databases (`arun_vendor_portal` + `arun_vendor_auth`) as described above. If a
managed MongoDB only authorizes ONE database, simply set `AUTH_DB_NAME` to the
same value as `DB_NAME` — the backend also detects this at startup and falls
back to the main database by itself, logging a line instead of failing to boot.
