# JobFlow AI — AI-Powered Job Finder

A full-stack SaaS platform that automatically finds, scores, and tailors applications for jobs using AI.

---

## Project Structure

```
/                         ← Frontend (React + Vite + TypeScript)
  src/app/
    contexts/             ← AuthContext (JWT session management)
    services/             ← api.ts, auth.service.ts, jobs.service.ts
    pages/                ← Dashboard, JobBoard, ResumeVault, Applications, etc.
    components/           ← UI components (shadcn/ui)
  index.html
  vite.config.ts          ← API proxy → backend:3001

/backend/                 ← API server (Node.js + Express + TypeScript)
  src/
    db/pool.ts            ← PostgreSQL connection pool
    db/seed.ts            ← Demo data seed script
    middleware/auth.ts    ← JWT verify + session check
    middleware/validate.ts← Zod request validation
    routes/auth.ts        ← POST /api/auth/*
    routes/jobs.ts        ← GET/POST /api/jobs/*
    routes/profile.ts     ← GET/PUT /api/profile
    routes/applications.ts← GET/POST/PUT /api/applications
    routes/activity.ts    ← GET /api/activity
    routes/analytics.ts   ← GET /api/analytics/*
    routes/settings.ts    ← GET/PUT /api/settings/*
    routes/documents.ts   ← GET /api/documents/*
    index.ts              ← Express server entry point

/db/
  postgres_schema.sql     ← Full PostgreSQL schema with indexes and triggers

/docker-compose.yml       ← PostgreSQL 16 container
```

---

## Prerequisites

- [Node.js 20+](https://nodejs.org)
- [npm](https://npmjs.com) or [pnpm](https://pnpm.io)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for PostgreSQL)

---

## Quick Start (3 terminal tabs)

### 1. Start PostgreSQL

```bash
docker-compose up -d
```

This starts PostgreSQL on port 5432 and auto-applies `db/postgres_schema.sql` on first boot.

Wait for it to be healthy:
```bash
docker-compose ps
# postgres should show "healthy"
```

### 2. Set up and start the backend API

```bash
cd backend

# Copy environment file
cp .env.example .env

# Edit .env — generate a real JWT_SECRET:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Install dependencies
npm install

# Seed demo data (companies, jobs, tags, subscription plans)
npm run db:seed

# Start dev server (hot-reload)
npm run dev
```

The API will be available at `http://localhost:3001`.
Health check: `curl http://localhost:3001/health`

### 3. Start the frontend

In the project root:
```bash
# Copy env file
cp .env.example .env

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open **http://localhost:5678** in your browser.

All `/api/*` requests are automatically proxied to `http://localhost:3001`.

---

## First Run

1. Open http://localhost:5678
2. Click **Sign up** and create an account
3. You are redirected to the Dashboard
4. Navigate to **Job Board** — 8 demo jobs are pre-seeded
5. Click a job → **Score with AI** to run the scoring engine
6. Score ≥ 70 unlocks **Generate Resume**

---

## API Endpoints

### Auth (`/api/auth/*`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/signup` | Create account, returns `{ token, user }` |
| POST | `/api/auth/login` | Sign in, returns `{ token, user }` |
| POST | `/api/auth/logout` | Revoke session |
| POST | `/api/auth/forgot-password` | Send reset link |
| POST | `/api/auth/reset-password` | Apply new password |
| GET  | `/api/auth/me` | Get current user |

### Jobs (`/api/jobs/*`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/jobs` | List jobs with filters (`query`, `minScore`, `status`, `source`, `remoteOnly`) |
| GET | `/api/jobs/:id` | Single job detail |
| POST | `/api/jobs/import-link` | Import job from URL |
| POST | `/api/jobs/:id/score` | Run AI fit scoring |
| POST | `/api/jobs/:id/generate-resume` | Generate tailored resume |
| POST | `/api/jobs/:id/generate-cover-letter` | Generate cover letter |
| PUT | `/api/jobs/:id/state` | Update stage, saved, notes |

### Other
| Route | Description |
|-------|-------------|
| `GET /api/profile` | User profile + skills |
| `PUT /api/profile` | Update profile |
| `GET /api/applications` | Application pipeline |
| `POST /api/applications` | Create application |
| `PUT /api/applications/:id` | Update status |
| `GET /api/activity` | Activity feed |
| `GET /api/analytics/dashboard` | Dashboard stats |
| `GET /api/analytics/funnel` | Application funnel |
| `GET /api/analytics/jobs-per-week` | Weekly job counts |
| `GET /api/analytics/source-performance` | Source breakdown |
| `GET /api/settings/preferences` | User preferences |
| `PUT /api/settings/preferences` | Update preferences |
| `GET /api/settings/ai-providers` | AI provider connections |
| `POST /api/settings/ai-providers` | Connect AI provider |
| `GET /api/settings/subscription` | Subscription + credits |
| `GET /api/documents` | Resume & cover letter list |

---

## Security

- Passwords hashed with **bcrypt** (cost 12)
- JWT tokens verified and checked against `user_sessions` table (supports revocation)
- Sessions expire after 7 days
- Auth routes rate-limited to 20 req/15min
- CORS restricted to `CORS_ORIGIN`
- Security headers via **Helmet**
- All SQL uses parameterized queries (no string interpolation)
- AI provider keys stored as hint only — full key should use KMS in production

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://jobflow:jobflow_dev@localhost:5432/jobflow` | PostgreSQL connection |
| `PORT` | `3001` | API server port |
| `JWT_SECRET` | *(required)* | Long random string for signing JWTs |
| `JWT_EXPIRES_IN` | `7d` | Token expiry |
| `CORS_ORIGIN` | `http://localhost:5678` | Allowed frontend origin |
| `AUTH_RATE_LIMIT` | `20` | Max auth requests per 15 min |

### Frontend (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | *(not set — uses proxy)* | Direct API URL for production builds |

---

## Production Deployment

1. Build the frontend: `npm run build` → deploy `dist/` to Vercel/Netlify/CDN
2. Deploy the backend to Railway/Render/Fly.io/ECS
3. Provision a managed PostgreSQL instance (Supabase, Neon, RDS)
4. Set environment variables in your platform
5. Run the seed script once: `npm run db:seed`
6. Set `VITE_API_URL` to your production API URL

---

## Connecting Real AI (OpenAI / Anthropic)

The scoring and generation routes currently return placeholder responses. To wire up real AI:

1. Go to **Settings → AI Providers** in the app and enter your API key
2. In the backend routes (`backend/src/routes/jobs.ts`), replace the placeholder sections marked with `// In production:` comments with actual calls to the OpenAI or Anthropic SDK

---

## Database

The schema is in `db/postgres_schema.sql`. Key tables:

- `account_users` + `user_sessions` + `password_reset_tokens` — auth
- `jobs` + `companies` + `job_sources` + `tags` — job catalog
- `user_job_states` + `job_score_runs` — user-specific job data
- `documents` + `document_versions` — resume vault
- `applications` + `application_status_history` — application pipeline
- `activity_events` — activity feed
- `ai_runs` + `user_credit_ledger` — AI usage tracking
- `user_subscriptions` + `subscription_plans` — billing
