# Deployment til Contabo VPS

## 1. Push kode til GitHub

I Emergent: klik **"Save to GitHub"** → vælg/opret repository.

## 2. På Contabo serveren

```bash
# Forudsætninger (én gang)
sudo apt update
sudo apt install -y python3 python3-venv nodejs npm nginx mongodb
# Eller for nyere Ubuntu hvor mongodb hedder mongodb-org — følg https://www.mongodb.com/docs/manual/installation/

# Yarn (vi bruger yarn, ikke npm til build)
npm install -g yarn

# Klon dit repo
sudo mkdir -p /var/www/medlemsportal
sudo chown $USER:$USER /var/www/medlemsportal
cd /var/www/medlemsportal
git clone <din-github-url> .
```

## 3. Backend setup

```bash
cd /var/www/medlemsportal/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Opret `/var/www/medlemsportal/backend/.env`:
```ini
MONGO_URL=mongodb://localhost:27017
DB_NAME=medlemsportal
CORS_ORIGINS=https://medlemsportal.dindomæne.dk
JWT_SECRET=<generér ny: python3 -c "import secrets; print(secrets.token_hex(32))">
ADMIN_EMAIL=tdeele@gmail.com
ADMIN_PASSWORD=<dit-admin-password>

# Brevo SMTP
SMTP_SERVER=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_LOGIN=afb382001@smtp-brevo.com
SMTP_PASSWORD=<din-brevo-key>
FROM_EMAIL=tdeele@gmail.com
FROM_NAME=Medlemsportal
REMINDER_HOUR=9
REMINDER_TIMEZONE=Europe/Copenhagen

# Lokal upload-mappe (UDENFOR git repo så billeder ikke committerres)
UPLOAD_DIR=/var/www/medlemsportal-uploads

APP_NAME=medlemsportal
FACEBOOK_GROUP_URL=https://www.facebook.com/groups/315581835133905
```

```bash
# Opret upload-mappen
sudo mkdir -p /var/www/medlemsportal-uploads
sudo chown $USER:$USER /var/www/medlemsportal-uploads
```

## 4. Frontend build

```bash
cd /var/www/medlemsportal/frontend
echo "REACT_APP_BACKEND_URL=https://medlemsportal.dindomæne.dk" > .env
yarn install
yarn build
# Statiske filer kommer i frontend/build/
```

## 5. Systemd service (backend kører altid)

`/etc/systemd/system/medlemsportal.service`:
```ini
[Unit]
Description=Medlemsportal backend
After=network.target mongodb.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/medlemsportal/backend
EnvironmentFile=/var/www/medlemsportal/backend/.env
ExecStart=/var/www/medlemsportal/backend/venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now medlemsportal
sudo systemctl status medlemsportal
```

## 6. Nginx (ved siden af dine 5 andre sites)

`/etc/nginx/sites-available/medlemsportal`:
```nginx
server {
    listen 80;
    server_name medlemsportal.dindomæne.dk;

    client_max_body_size 12M;  # for billed-uploads

    # Frontend (React statics)
    location / {
        root /var/www/medlemsportal/frontend/build;
        try_files $uri /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/medlemsportal /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 7. HTTPS (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d medlemsportal.dindomæne.dk
```

## 8. Opdater app efterfølgende

```bash
cd /var/www/medlemsportal
git pull
cd backend && source venv/bin/activate && pip install -r requirements.txt && deactivate
cd ../frontend && yarn install && yarn build
sudo systemctl restart medlemsportal
```

## Vigtig note: Uploads
- `UPLOAD_DIR=/var/www/medlemsportal-uploads` er **udenfor git repo** — så billeder forsvinder ikke ved deploy
- Backup denne mappe regelmæssigt sammen med MongoDB
- MongoDB backup: `mongodump --db medlemsportal --out /backup/$(date +%F)`
