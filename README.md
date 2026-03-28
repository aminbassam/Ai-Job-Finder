# JobFlow AI — Autonomous AI Job Agent

A full-stack SaaS platform with an **autonomous job discovery engine** at its core. Set your search strategy once — the agent searches, scores, and surfaces the best matches automatically across multiple sources on a schedule.

---

## Project Structure

```
/                              ← Frontend (React + Vite + TypeScript)
  src/app/
    contexts/                  ← AuthContext (JWT session + user state)
    services/                  ← api.ts, auth.service.ts, profile.service.ts,
    |                             settings.service.ts, agent.service.ts
    pages/                     ← Dashboard, JobAgent, JobBoard, Resume, ResumeVault,
    |                             Applications, Analytics, Settings
    pages/agent/               ← ProfilesTab, SourcesTab, ResultsTab, ImportTab, RunsTab
    pages/settings/            ← ResumePreferencesTab (AI resume engine), AiProvidersTab
    pages/admin/               ← AdminUsers dashboard
    pages/auth/                ← Login, Signup, ForgotPassword, VerifyEmail (OTP)
    components/ui/             ← shadcn/ui components + TagInput, LocationInput
    components/auth/           ← ProtectedRoute, GuestRoute
    components/layouts/        ← RootLayout, AppSidebar
  index.html
  vite.config.ts               ← API proxy → backend:3001

/backend/                      ← API server (Node.js + Express + TypeScript)
  src/
    db/pool.ts                 ← PostgreSQL connection pool
    db/seed.ts                 ← Superadmin + demo data seed
    db/migrate.ts              ← Standalone migration runner
    middleware/auth.ts         ← JWT verify + session check
    middleware/adminAuth.ts    ← requireAdmin middleware
    middleware/validate.ts     ← Zod request validation
    routes/auth.ts             ← POST /api/auth/*
    routes/jobs.ts             ← GET/POST /api/jobs/*
    routes/profile.ts          ← GET/PUT /api/profile
    routes/agent.ts            ← GET/POST /api/agent/* (profiles, results, connectors, import)
    routes/applications.ts     ← GET/POST/PUT /api/applications
    routes/activity.ts         ← GET /api/activity
    routes/analytics.ts        ← GET /api/analytics/*
    routes/settings.ts         ← GET/PUT /api/settings/*
    routes/documents.ts        ← GET /api/documents/*
    routes/admin.ts            ← GET/PATCH/DELETE /api/admin/*
    services/pipeline.ts       ← Match pipeline: normalize → score → tier → persist
    services/scheduler.ts      ← node-cron scheduler (polls every 30 min)
    services/connectors/
      base.ts                  ← Connector interface + shared title-match helper
      greenhouse.ts            ← Greenhouse public board API (Lane 1)
      lever.ts                 ← Lever public postings API (Lane 1)
      ats-feed.ts              ← Ashby public board API (Lane 1)
      upwork.ts                ← Upwork GraphQL API with OAuth2 (Lane 2)
    utils/email.ts             ← nodemailer SMTP + console fallback
    utils/encryption.ts        ← AES-256-GCM encrypt/decrypt for AI provider keys
    index.ts                   ← Express server + auto-migration + scheduler start

/db/
  postgres_schema.sql          ← Full PostgreSQL schema
  migrations/
    001_email_verification.sql ← email_verification_tokens table
    002_admin_role.sql         ← is_admin column on account_users
    003_resume_preferences.sql ← resume_preferences table (AI engine config)
    004_ai_provider_fields.sql ← encrypted key columns + current_job_title/linkedin_url
    005_job_agent.sql          ← search_profiles, job_matches, connector_configs, agent_runs

/docker-compose.yml            ← PostgreSQL 16 container
```

---

## Prerequisites

- [Node.js 20+](https://nodejs.org)
- [npm](https://npmjs.com)
- PostgreSQL 14+ (Docker or [Postgres.app](https://postgresapp.com) on macOS)

---

## Quick Start

### 1. Start PostgreSQL

**Option A — Docker:**
```bash
docker-compose up -d
# Wait for "healthy": docker-compose ps
```

**Option B — Postgres.app (macOS):**
```bash
/Applications/Postgres.app/Contents/Versions/latest/bin/psql -U postgres

CREATE ROLE jobflow WITH LOGIN PASSWORD 'jobflow_dev';
CREATE DATABASE jobflow OWNER jobflow;
\c jobflow
\i db/postgres_schema.sql
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO jobflow;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO jobflow;
\q
```

### 2. Backend setup

```bash
cd backend
npm install

cp .env.example .env   # then edit with your values

npm run db:seed        # seed superadmin + demo data
npm run dev            # hot-reload dev server
```

API available at `http://localhost:3001`
Health check: `curl http://localhost:3001/health`

> All migrations run automatically on every startup — no manual step needed.
> The job agent scheduler starts automatically with the server.

### 3. Frontend setup

```bash
# From project root
npm install
npm run dev
```

Open **http://localhost:5678**. All `/api/*` requests proxy to `http://localhost:3001`.

---

## Default Accounts

| Role | Email | Password |
|------|-------|----------|
| Superadmin | `admin@jobflow.ai` | `Admin@123456` |

Seeded automatically by `npm run db:seed` with Agency plan, 5,000 AI credits, pre-verified email, and admin dashboard access at `/admin/users`.

---

## Features

### Job Agent (`/agent`) — Core Experience

The autonomous job discovery engine. Set your strategy once, the system does the rest.

#### How it works
```
1. Define profiles  →  2. Connect sources  →  3. Auto-runs on schedule
      ↓                                              ↓
5. Review top matches  ←  4. AI scores every job (0-100)
```

#### Search Profiles
Each profile is a named, reusable search configuration:

| Field | Options |
|-------|---------|
| Job Titles | Multi-chip input — order = priority |
| Locations | Multi-chip + Remote Only + Include Nearby |
| Salary Range | Slider $0–$400k |
| Experience | Internship / Entry / Mid / Senior / Lead / Director / C-Level |
| Must-Have Keywords | Hard filter — jobs without these are rejected |
| Nice-to-Have Keywords | Boost relevance score |
| Excluded Companies | Hard filter — jobs from these companies are skipped |
| Sources | Greenhouse / Lever / Ashby / Upwork (per connector config) |
| Search Mode | Strict / Balanced / Broad |
| Score Threshold | Minimum score to surface (default 70) |
| Schedule | Every 6h / Daily / Weekdays only |
| Auto-resume | Auto-generate tailored resume for strong matches |

#### Match Pipeline
Every discovered job goes through the same pipeline:

```
Fetch from connectors → Filter excluded companies → Score (0-100)
    → Tier (strong/maybe/weak/reject) → Deduplicate → Save
```

**Scoring weights:**
| Signal | Max pts | Logic |
|--------|---------|-------|
| Title match | 40 | Exact=40, partial=28, miss=0 |
| Keyword match | 30 | Missing must-have = hard 0; nice-to-have = proportional bonus |
| Location match | 20 | Remote=15–20; location string match=20; no location=4 |
| Salary match | 10 | Overlap=10; unknown=5; no overlap=0 |

**Tiers:** Strong (75+) · Maybe (55+) · Weak (35+) · Reject (<35)

#### Scheduler
- `node-cron` polls every 30 minutes
- Runs all profiles where `next_run_at ≤ now()`
- Respects weekdays-only setting (skips Sat/Sun)
- Creates an `agent_run` audit record per execution with job counts and errors
- Next run time: +6h for 6h schedule, next 08:00 for daily/weekdays

#### 4-Lane Connector Strategy

| Lane | Connector | Auth | Notes |
|------|-----------|------|-------|
| **Lane 1** — Autonomous ATS | Greenhouse | None | Public board API — provide company slugs |
| **Lane 1** — Autonomous ATS | Lever | None | Public postings API — provide company slugs |
| **Lane 1** — Autonomous ATS | Ashby | None | Public board API — provide company + slug pairs |
| **Lane 2** — Official API | Upwork | OAuth2 token | GraphQL search — contract/freelance work |
| **Lane 3** — Browser Extension | LinkedIn, Indeed, any page | Extension | One-click save (coming soon) |
| **Lane 4** — Email Ingestion | LinkedIn alerts, Indeed, ZipRecruiter | Forward email | Auto-parse job alert emails (coming soon) |

#### Results Inbox
- Filter by tier (Strong / Maybe / Weak) and status (New / Saved / Applied)
- AI score ring with score breakdown (title / keywords / location / salary)
- Expandable job description and requirements
- Save · Mark applied · Dismiss — all with live status updates
- Load more pagination

#### Manual Import
- Paste a job URL — source auto-detected from domain (LinkedIn, Indeed, Greenhouse, Lever, Ashby, Workday)
- Or fill in job details manually (title, company, location, description)
- Every manual import enters the same scoring pipeline

#### Run History
- Full audit log of every scheduled and manual run
- Per-run: jobs found, new jobs, strong matches, duration, errors

---

### Resume (`/resume`)
Standalone page in the main navigation:
- **Resume Readiness Score** — prominent SVG ring (0–100), color-coded green/amber/red
- Full AI resume engine configuration (same as Settings → Resume Preferences)

### Authentication
- Signup / Login with JWT (7-day sessions, revocable)
- **Email OTP verification** — 6-digit code, 15-min TTL, 5-attempt limit
- Forgot password / Reset password via email link
- Rate-limited auth routes (20 req/15 min)

### Settings — Profile Tab
- Live form pre-populated from `GET /api/profile`
- Editable: first name, last name, job title, LinkedIn URL
- Location autocomplete powered by OpenStreetMap (Nominatim) — no API key required
- Email is read-only
- Saves to `PUT /api/profile` and syncs name/location to sidebar instantly

### Settings — Resume Preferences (also at `/resume`)

| Section | Fields |
|---------|--------|
| **Profile Core** | Professional summary, years of experience (slider), key achievements, certifications |
| **Skills & Tools** | Core skills, tools & technologies, soft skills — all tag-chip inputs with suggestions |
| **Target Strategy** | Desired roles (tags), seniority level, industry focus (tags), must-have ATS keywords |
| **AI Behaviour** | Writing tone, resume style (ATS-safe / Balanced / Human-friendly), bullet style |
| **Optimisation** | ATS level (Basic / Balanced / Aggressive), cover letter config |
| **AI Safety Rules** | 4 guardrail toggles: no fake experience, no title changes, no exaggerated metrics, only rephrase |

**Resume Readiness Score** — live SVG ring, color-coded, shows which fields are missing.
**Auto-save** — debounced 2s after any change, with "Saved Xs ago" indicator.

### Settings — AI Providers
- **Live status**: disconnected → validating → connected / error
- **Real key validation**: backend calls `/v1/models` on OpenAI / Anthropic with 8s timeout
- **AES-256-GCM encryption** at rest — IV + auth tag in separate DB columns
- **Model selector** after connection: gpt-4o / gpt-4o-mini / gpt-4-turbo / gpt-3.5-turbo · claude-opus-4-6 / claude-sonnet-4-6 / claude-haiku-4-5
- Test connection button · Disconnect removes encrypted key

### Admin Dashboard (`/admin/users`)
Requires `is_admin = true`.
- Stats bar, paginated user table, search + plan/status/verification filters
- Edit user, activate/deactivate (revokes all sessions), delete
- Self-protection: admins cannot deactivate or remove their own admin flag

---

## API Reference

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/signup` | Create account, sends OTP email |
| POST | `/api/auth/login` | Sign in → `{ token, user }` |
| POST | `/api/auth/logout` | Revoke session |
| POST | `/api/auth/forgot-password` | Send password reset email |
| POST | `/api/auth/reset-password` | Apply new password with token |
| POST | `/api/auth/send-verification` | Resend OTP email (auth required) |
| POST | `/api/auth/verify-email` | Verify 6-digit OTP code |

### Profile
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/profile` | Full profile incl. skills |
| PUT | `/api/profile` | Update name, location, title, LinkedIn, summary, skills |

### Job Agent
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/agent/profiles` | List user's search profiles with match counts |
| POST | `/api/agent/profiles` | Create search profile |
| PUT | `/api/agent/profiles/:id` | Update search profile |
| DELETE | `/api/agent/profiles/:id` | Delete search profile |
| POST | `/api/agent/profiles/:id/run` | Trigger manual run (async, returns runId) |
| GET | `/api/agent/connectors` | List connector configurations |
| PUT | `/api/agent/connectors/:connector` | Save connector config (slugs, tokens) |
| GET | `/api/agent/results` | Paginated match results (`?tier=strong&status=new`) |
| PATCH | `/api/agent/results/:id/status` | Update match status (new/viewed/saved/applied/dismissed) |
| POST | `/api/agent/import` | Manual job import (URL or raw fields) |
| GET | `/api/agent/runs` | Recent agent run history (last 50) |

### Jobs
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/jobs` | List with filters |
| GET | `/api/jobs/:id` | Job detail |
| POST | `/api/jobs/import-link` | Import job from URL |
| POST | `/api/jobs/:id/score` | Run AI fit scoring |
| POST | `/api/jobs/:id/generate-resume` | Generate tailored resume |
| POST | `/api/jobs/:id/generate-cover-letter` | Generate cover letter |
| PUT | `/api/jobs/:id/state` | Update stage, saved flag, notes |

### Settings
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/settings/preferences` | User notification + ATS preferences |
| PUT | `/api/settings/preferences` | Update preferences |
| GET | `/api/settings/resume-preferences` | Full AI resume config |
| PUT | `/api/settings/resume-preferences` | Update AI resume config |
| GET | `/api/settings/ai-providers` | Connected AI providers with status |
| POST | `/api/settings/ai-providers` | Connect provider (validates key, encrypts AES-256-GCM) |
| DELETE | `/api/settings/ai-providers/:provider` | Disconnect provider |
| POST | `/api/settings/ai-providers/:provider/test` | Re-validate stored key |
| PUT | `/api/settings/ai-providers/:provider/model` | Set active model version |
| GET | `/api/settings/subscription` | Plan, credits, billing info |

### Admin (requires `is_admin = true`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/stats` | Platform-wide user statistics |
| GET | `/api/admin/users` | Paginated user list with search + filters |
| PATCH | `/api/admin/users/:id` | Edit user (name, email, plan, isAdmin) |
| PATCH | `/api/admin/users/:id/status` | Activate / deactivate user |
| DELETE | `/api/admin/users/:id` | Hard delete user |

### Other
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/applications` | Application pipeline |
| POST | `/api/applications` | Create application |
| PUT | `/api/applications/:id` | Update status |
| GET | `/api/activity` | Activity feed |
| GET | `/api/analytics/dashboard` | Dashboard stats |
| GET | `/api/analytics/funnel` | Application funnel |
| GET | `/api/analytics/jobs-per-week` | Weekly job counts |
| GET | `/api/analytics/source-performance` | Source breakdown |
| GET | `/api/documents` | Resume & cover letter list |

---

## Database

Migrations in `db/migrations/` apply automatically on every backend startup (idempotent).

| Table | Purpose |
|-------|---------|
| `account_users` | Users with `is_admin`, `email_verified_at`, `current_job_title`, `linkedin_url` |
| `user_sessions` | Revocable JWT sessions |
| `password_reset_tokens` | Time-limited reset links |
| `email_verification_tokens` | 6-digit OTP codes (hashed) |
| `user_profiles` | Summary, years experience, salary range |
| `user_skills` | Per-user skill list |
| `resume_preferences` | Full AI engine config (tone, targeting, safety rules) |
| `user_preferences` | Notification + ATS preferences |
| `ai_provider_connections` | OpenAI / Anthropic — AES-256-GCM encrypted keys, model, status |
| `search_profiles` | Named search configurations with schedule + scoring settings |
| `job_matches` | Pipeline output — normalized, scored, tiered jobs from all sources |
| `connector_configs` | Per-user connector settings (slugs, tokens, last sync) |
| `agent_runs` | Audit log of every scheduled and manual agent run |
| `jobs` + `companies` | Job catalog |
| `user_job_states` + `job_score_runs` | User-specific job scores |
| `documents` + `document_versions` | Resume vault |
| `applications` + `application_status_history` | Application pipeline |
| `activity_events` | Activity feed |
| `ai_runs` + `user_credit_ledger` | AI usage & credits |
| `user_subscriptions` + `subscription_plans` | Billing |

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://jobflow:jobflow_dev@localhost:5432/jobflow` | PostgreSQL connection |
| `PORT` | `3001` | API server port |
| `JWT_SECRET` | *(required)* | Generate: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_EXPIRES_IN` | `7d` | Token expiry |
| `CORS_ORIGIN` | `http://localhost:5678` | Allowed frontend origin |
| `APP_URL` | `http://localhost:5678` | Used in email links |
| `AUTH_RATE_LIMIT` | `20` | Max auth requests per 15 min |
| `SMTP_HOST` | *(optional)* | SMTP server (e.g. `sandbox.smtp.mailtrap.io`) |
| `SMTP_PORT` | `2525` | SMTP port |
| `SMTP_USER` | *(optional)* | SMTP username |
| `SMTP_PASS` | *(optional)* | SMTP password |
| `SMTP_FROM` | `JobFlow AI <noreply@jobflow.ai>` | Sender name + address |
| `ENCRYPTION_KEY` | *(required)* | 64-char hex string for AES-256-GCM — generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

> If SMTP is not configured, OTP codes and reset links print to the backend console.

### Frontend (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | *(not set — uses Vite proxy)* | Set to production API URL for production builds |

---

## Security

- Passwords hashed with **bcrypt** (cost 12)
- JWTs verified and checked against `user_sessions` (revocation supported)
- OTP codes stored as **SHA-256 hashes** with attempt limits and expiry
- Sessions expire after 7 days; deactivating a user revokes all sessions immediately
- Auth routes rate-limited (20 req / 15 min)
- CORS restricted to `CORS_ORIGIN`
- Security headers via **Helmet**
- All SQL uses parameterized queries — no string interpolation
- AI provider keys encrypted with **AES-256-GCM** at rest; decrypted server-side only

---

## Production Deployment

1. Build frontend: `npm run build` → deploy `dist/` to Vercel / Netlify / CDN
2. Deploy backend to Railway / Render / Fly.io / ECS
3. Provision managed PostgreSQL (Supabase, Neon, RDS)
4. Set all environment variables in your platform
5. Run seed once: `npm run db:seed`
6. Set `VITE_API_URL` to your production API URL

The job agent scheduler starts automatically with the server process — no separate worker needed.

---

## Connecting Real AI (OpenAI / Anthropic)

1. Go to **Settings → AI Providers** and connect your key
2. Replace placeholder sections in `backend/src/routes/jobs.ts` (marked `// In production:`) with actual SDK calls
3. The `resume_preferences` and `search_profiles` tables already hold all configuration needed for prompts (tone, style, target roles, keywords, safety rules, score threshold)
4. For the agent pipeline, replace the rule-based scorer in `backend/src/services/pipeline.ts` with an LLM scoring call using the connected provider's model

---

## Roadmap

| Status | Feature |
|--------|---------|
| ✅ | Autonomous job agent with scheduler |
| ✅ | 4-lane connector model (Greenhouse, Lever, Ashby, Upwork) |
| ✅ | AI scoring pipeline (rule-based, 0-100) |
| ✅ | Search profiles with per-profile schedule |
| ✅ | Results inbox with tier/status filtering |
| ✅ | Manual import (URL + form) |
| ✅ | AI resume engine config (6 sections + readiness score) |
| ✅ | AES-256-GCM encrypted AI provider keys |
| 🔜 | Browser extension (Lane 3 — LinkedIn, Indeed, any page) |
| 🔜 | Email ingestion (Lane 4 — job alert emails) |
| 🔜 | LLM-based scoring via connected AI provider |
| 🔜 | Auto-generated tailored resume for strong matches |
| 🔜 | Push / email notifications for new strong matches |
| 🔜 | Upwork OAuth2 flow in the UI |
