Use a Hostinger VPS, not WordPress/Web/Cloud hosting. Hostinger’s current guidance says Node.js can run on multiple plans, but PostgreSQL requires a VPS, and VPS is the option for full server control needed by your app. Sources: Hostinger Node.js support, Hostinger PostgreSQL support, Hostinger VPS plans: https://www.hostinger.com/support/node-js-hosting-options-at-hostinger/ , https://www.hostinger.com/support/1583659-is-postgresql-supported-at-hostinger/ , https://www.hostinger.com/vps-hosting

My exact recommendation:

Buy KVM 2 minimum, KVM 4 if you want more headroom
Use Ubuntu 24.04 LTS
Put everything on one VPS:
Nginx
frontend static build
backend Node app on localhost:3001
PostgreSQL on the same server
PM2 for process management
Architecture

https://yourdomain.com/ -> frontend dist
https://yourdomain.com/api/* -> Node backend
PostgreSQL local on VPS
Chrome extension points to https://yourdomain.com/api
1. Buy and prepare the VPS
In Hostinger:

Buy VPS.
Choose Ubuntu 24.04 LTS.
Attach your domain or subdomain.
Point DNS A record to the VPS IP.
Example DNS:

@ -> VPS IP
www -> VPS IP
2. SSH into the server

ssh root@YOUR_SERVER_IP
3. Install system packages

apt update && apt upgrade -y
apt install -y nginx git curl unzip ufw build-essential
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
apt install -y postgresql postgresql-contrib
npm install -g pm2
If you plan to use Playwright-based connectors, also install browser deps:

npx playwright install --with-deps chromium
4. Create app user

adduser deploy
usermod -aG sudo deploy
su - deploy
5. Clone the repo

cd ~
git clone YOUR_REPO_URL jobfinder
cd jobfinder
6. Set up PostgreSQL

sudo -u postgres psql
Inside psql:

CREATE ROLE jobflow WITH LOGIN PASSWORD 'CHANGE_THIS_STRONG_PASSWORD';
CREATE DATABASE jobflow OWNER jobflow;
\q
Your DB URL will be:

postgresql://jobflow:CHANGE_THIS_STRONG_PASSWORD@localhost:5432/jobflow
7. Backend env
Create backend/.env:

NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://jobflow:CHANGE_THIS_STRONG_PASSWORD@localhost:5432/jobflow

JWT_SECRET=CHANGE_THIS_TO_A_LONG_RANDOM_SECRET
ENCRYPTION_KEY=PUT_64_HEX_CHARS_HERE

CORS_ORIGIN=https://yourdomain.com
APP_URL=https://yourdomain.com

AUTH_RATE_LIMIT=20
SESSION_TTL_SECONDS=604800
JWT_EXPIRES_IN=7d
Generate ENCRYPTION_KEY:

node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
Optional email env:

SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=your@email.com
SMTP_PASS=your_password
SMTP_FROM=JobFlow AI <noreply@yourdomain.com>
Optional Gmail ingestion env:

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://yourdomain.com/api/gmail/callback
8. Install dependencies and build
Frontend:

cd ~/jobfinder
npm install
npm run build
Backend:

cd ~/jobfinder/backend
npm install
npm run build
9. Run database migrations
Do this manually on deploy:

cd ~/jobfinder/backend
npm run db:migrate
Important: your runtime startup migrator appears to stop at migration 016, while the standalone migrator includes 017. So I recommend always running npm run db:migrate during deployment.

Optional first seed:

npm run db:seed
10. Start backend with PM2
From ~/jobfinder/backend:

pm2 start dist/index.js --name jobflow-api
pm2 save
pm2 startup
11. Nginx config
Create:

sudo nano /etc/nginx/sites-available/jobflow
Put:

server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    root /home/deploy/jobfinder/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri /index.html;
    }
}
Enable it:

sudo ln -s /etc/nginx/sites-available/jobflow /etc/nginx/sites-enabled/jobflow
sudo nginx -t
sudo systemctl reload nginx
12. SSL
Use Let’s Encrypt:

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
13. Firewall

sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
14. Chrome extension production setting
In the extension options, set API URL to:

https://yourdomain.com/api
15. Deploy updates
Each time:

cd ~/jobfinder
git pull

npm install
npm run build

cd backend
npm install
npm run build
npm run db:migrate

pm2 restart jobflow-api
16. Verify
Check:

pm2 status
pm2 logs jobflow-api
curl http://127.0.0.1:3001/health
curl https://yourdomain.com/health
The app itself should load at:

https://yourdomain.com
API health at https://yourdomain.com/api/... via Nginx proxy
direct backend health on server: http://127.0.0.1:3001/health
My recommendation
Do it on:

Hostinger VPS KVM 2 if budget matters
Hostinger VPS KVM 4 if you want smoother headroom for Playwright connectors and scheduled jobs
If you want, I can make this even more concrete by preparing:

a ready-to-paste backend/.env.production
a ready-to-paste Nginx config with your real domain
and a pm2 ecosystem.config.js for this repo.

