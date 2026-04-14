# Brigade Electronics — Vehicle Onboarding (Lean Edition)

Simple mobile-responsive web form for field installers. No Google APIs, no external databases.  
**Data is stored locally in SQLite. Photos and PDFs are saved to disk. Confirmation emails sent via Gmail.**

---

## How It Works

```
Installer fills form on phone
        │
        ▼
POST /api/submit  (multipart — 5 photos + form fields)
        │
        ├─ Validate all fields (server + client side)
        ├─ Save photos to  uploads/{ID}/
        ├─ Save record to  data/onboarding.db  (SQLite)
        ├─ Generate PDF certificate  →  saved alongside photos
        └─ Email PDF + photos to installer + brigade team
```

Admin browses records at `/admin` (password protected).

---

## Quick Start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
#  → edit .env with your Gmail App Password, admin password, recipient email

# 3. Run
npm start
# → http://localhost:3000        (installer form)
# → http://localhost:3000/admin  (admin dashboard)
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | HTTP port (default 3000) |
| `NODE_ENV` | No | `production` or `development` |
| `UPLOADS_DIR` | No | Where photos/PDFs are saved (default: `uploads/`) |
| `DATA_DIR` | No | Where SQLite DB lives (default: `data/`) |
| `EMAIL_USER` | **Yes** | Gmail address used to send emails |
| `EMAIL_PASS` | **Yes** | Gmail App Password (not your login password) |
| `EMAIL_RECIPIENTS` | **Yes** | Always-CC addresses, comma-separated |
| `ADMIN_PASSWORD` | **Yes** | Password for `/admin` page |

### Getting a Gmail App Password
1. Go to your Google Account → Security → 2-Step Verification (must be enabled)
2. Scroll down to **App passwords**
3. Create one for "Mail" / "Other" → name it "Brigade Onboarding"
4. Copy the 16-character password into `EMAIL_PASS`

---

## Admin Dashboard

Visit `http://your-server/admin` — browser will prompt for a password (use `ADMIN_PASSWORD` from `.env`).

| Feature | URL |
|---|---|
| View all submissions | `/admin` |
| Download CSV export | `/admin/export` |
| Download a PDF | `/admin/pdf/{onboarding-id}` |

---

## Deployment — Azure App Service

### Option A: Docker (recommended)

```bash
# Build
docker build -t brigade-onboarding .

# Test locally first
docker run -p 3000:3000 \
  -v $(pwd)/uploads:/app/uploads \
  -v $(pwd)/data:/app/data \
  --env-file .env \
  brigade-onboarding

# Push to Azure Container Registry
az acr login --name <your-acr>
docker tag brigade-onboarding <your-acr>.azurecr.io/brigade-onboarding:latest
docker push <your-acr>.azurecr.io/brigade-onboarding:latest

# Create App Service in UK South
az appservice plan create --name brigade-plan --resource-group brigade-rg \
  --location uksouth --is-linux --sku B1

az webapp create --name brigade-onboarding --resource-group brigade-rg \
  --plan brigade-plan \
  --deployment-container-image-name <your-acr>.azurecr.io/brigade-onboarding:latest
```

### Set Environment Variables on Azure

```bash
az webapp config appsettings set \
  --name brigade-onboarding --resource-group brigade-rg \
  --settings \
    EMAIL_USER="your@gmail.com" \
    EMAIL_PASS="your-app-password" \
    EMAIL_RECIPIENTS="joel.jijo@brigade-halo.com" \
    ADMIN_PASSWORD="choose-a-strong-password" \
    NODE_ENV="production"
```

### Enable HTTPS Only

```bash
az webapp update --name brigade-onboarding --resource-group brigade-rg --https-only true
```

### Mount Persistent Storage

> **Important:** Container restarts will wipe `uploads/` and `data/` unless you mount persistent storage.

```bash
# Create an Azure File Share and mount it
az webapp config storage-account add \
  --name brigade-onboarding --resource-group brigade-rg \
  --custom-id uploads --storage-type AzureFiles \
  --account-name <storage-account> --share-name uploads \
  --mount-path /app/uploads

az webapp config storage-account add \
  --name brigade-onboarding --resource-group brigade-rg \
  --custom-id data --storage-type AzureFiles \
  --account-name <storage-account> --share-name data \
  --mount-path /app/data
```

---

## Deployment — Railway.app (quick testing)

1. Push to GitHub
2. New Railway project → Deploy from GitHub
3. Add env vars in Railway dashboard
4. Railway auto-detects Node.js and runs `npm start`

> Note: Railway's ephemeral filesystem means uploads/data won't persist across deploys.  
> Use Railway Volumes or switch to Azure for production.

---

## File Structure

```
.
├── src/
│   ├── server.js          # Express app — security headers, routing
│   ├── db.js              # SQLite setup + prepared statements
│   ├── routes/
│   │   ├── submit.js      # POST /api/submit — full pipeline
│   │   └── admin.js       # GET /admin — dashboard, CSV export, PDF download
│   ├── middleware/
│   │   └── validate.js    # OWASP input validation
│   └── services/
│       ├── pdfService.js  # PDFKit certificate generation
│       └── emailService.js# Nodemailer confirmation + attachments
├── public/
│   ├── index.html         # 5-step mobile form
│   ├── styles.css         # Mobile-first CSS
│   └── app.js             # Vanilla JS — validation, upload previews
├── uploads/               # Created at runtime — gitignored
├── data/                  # Created at runtime — gitignored (SQLite lives here)
├── .env.example
├── Dockerfile
└── README.md
```

---

## Dependencies (6 total)

| Package | Purpose |
|---|---|
| `express` | Web server |
| `multer` | File upload handling |
| `better-sqlite3` | SQLite database (zero config) |
| `pdfkit` | PDF certificate generation |
| `nodemailer` | Email delivery |
| `dotenv` | Environment variable loading |
