# JobFlow AI — AI-Powered Job Finder

A full-stack SaaS platform that automatically finds, scores, and tailors job applications using AI.

---

## Project Structure

```
/                              ← Frontend (React + Vite + TypeScript)
  src/app/
    contexts/                  ← AuthContext (JWT session + user state)
    services/                  ← api.ts, auth.service.ts, profile.service.ts, settings.service.ts
    pages/                     ← Dashboard, SearchJobs, JobBoard, Resume, ResumeVault, Applications, Analytics, Settings
    pages/settings/            ← ResumePreferencesTab (AI resume engine config), AiProvidersTab
    pages/admin/               ← AdminUsers dashboard (user management)
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
    routes/auth.ts             ← POST /api/auth/* (signup, login, OTP verify, reset)
    routes/jobs.ts             ← GET/POST /api/jobs/*
    routes/profile.ts          ← GET/PUT /api/profile
    routes/applications.ts     ← GET/POST/PUT /api/applications
    routes/activity.ts         ← GET /api/activity
    routes/analytics.ts        ← GET /api/analytics/*
    routes/settings.ts         ← GET/PUT /api/settings/* (prefs, AI providers, resume-prefs)
    routes/documents.ts        ← GET /api/documents/*
    routes/admin.ts            ← GET/PATCH/DELETE /api/admin/* (user management)
    utils/email.ts             ← nodemailer SMTP + console fallback
    index.ts                   ← Express server + auto-migration on startup

/db/
  postgres_schema.sql          ← Full PostgreSQL schema
  migrations/
    001_email_verification.sql ← email_verification_tokens table
    002_admin_role.sql         ← is_admin column on account_users
    003_resume_preferences.sql ← resume_preferences table (AI engine config)
    004_ai_provider_fields.sql ← encrypted key columns + current_job_title/linkedin_url

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
# Open Postgres.app, start the server, then:
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

# Create .env (see Environment Variables section below)
cp .env.example .env   # then edit with your values

# Seed superadmin + demo data
npm run db:seed

# Start dev server (hot-reload)
npm run dev
```

API available at `http://localhost:3001`
Health check: `curl http://localhost:3001/health`

> Migrations run automatically on every startup — no manual migration step needed.

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

The superadmin account is seeded automatically by `npm run db:seed`. It has:
- Agency plan (5,000 AI credits)
- Email pre-verified
- Admin dashboard access at `/admin/users`

---

## Features

### AI Job Strategy Builder (`/search`)
A full search strategy builder — not just a form:

| Section | Details |
|---------|---------|
| **Job Targeting** | Multi-title chip input with 19 suggestions; first chip = highest priority. Multi-select experience level (Internship → C-Level) |
| **Location & Salary** | Multi-location chips with suggestions, Remote Only + Include Nearby Cities toggles, salary range slider ($0–$400k) |
| **Keywords & Skills** | Must-Have chips (excluded if missing) and Nice-to-Have chips (boost relevance score) |
| **Search Strategy** | Strict / Balanced / Broad mode, AND/OR combine logic for titles, 4 priority weight sliders (Role Match / Salary / Location / Company Type) |
| **Company Filters** | Include/exclude specific companies (chips), company size filter (Startup / Small / Mid / Enterprise) — collapsible |
| **Job Freshness** | 24h / 3 days / 7 days / 30 days segmented control |
| **Sources** | 6 platforms: LinkedIn, Indeed, Glassdoor, Company Sites, AngelList, Remote OK — each shows live job count + last sync time |
| **AI Search Preview** | Right panel shows exactly what will be searched before you run it |
| **Estimated Results** | Live count that updates as you change filters |
| **Saved Searches** | Name a search, set auto-run daily + notifications, run or delete from sidebar |
| **Smart CTA** | "Find Best Matches" / "Start Smart Search" with animated phase messages during search |

### Resume (`/resume`)
Standalone page in the main navigation (moved from Settings):
- **Resume Readiness Score** — prominent SVG ring (0–100), color-coded green/amber/red, with "X fields to improve" prompt
- Full AI engine configuration panel (see Settings — Resume Preferences below)

### Authentication
- Signup / Login with JWT (7-day sessions, revocable)
- **Email OTP verification** — 6-digit code, 15-min TTL, 5-attempt limit
- Forgot password / Reset password via email link
- Rate-limited auth routes (20 req/15 min)

### Settings — Profile Tab
- Live form pre-populated from `GET /api/profile`
- Editable: first name, last name, job title, LinkedIn URL
- Location autocomplete powered by OpenStreetMap (Nominatim) — no API key required
- Email is read-only (contact support to change)
- Saves to `PUT /api/profile` and syncs name/location to sidebar instantly

### Settings — Resume Preferences (also accessible at `/resume`)

A full AI resume configuration panel with 6 sections:

| Section | Fields |
|---------|--------|
| **Profile Core** | Professional summary, years of experience (slider), key achievements, certifications |
| **Skills & Tools** | Core skills, tools & technologies, soft skills — all tag-chip inputs with auto-suggestions |
| **Target Strategy** | Desired roles (tags), seniority level, industry focus (tags), must-have ATS keywords (tags) |
| **AI Behaviour** | Writing tone (Concise / Impact-driven / Technical), resume style (ATS-safe / Balanced / Human-friendly), bullet style |
| **Optimisation** | ATS level (Basic / Balanced / Aggressive), cover letter toggle + tone / length / personalisation |
| **AI Safety Rules** | 4 guardrail toggles: no fake experience, no title changes, no exaggerated metrics, only rephrase |

**Resume Readiness Score** — live SVG ring (0–100), color-coded, shows exactly which fields are missing.
**Auto-save** — debounced 2-second save after any change, with "Saved just now / Saved Xs ago" indicator.

### Settings — AI Providers
- **Live connection status**: disconnected → validating → connected / error (with error details displayed)
- **Real API key validation**: backend calls `GET /v1/models` on OpenAI / Anthropic with 8-second timeout before storing
- **AES-256-GCM encryption**: keys encrypted at rest; IV + auth tag stored in separate DB columns; `ENCRYPTION_KEY` required
- **Model selector**: appears after successful connection
  - OpenAI: `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `gpt-3.5-turbo`
  - Anthropic: `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5`
- **Test connection** button re-validates a stored key on demand
- **Disconnect** removes the encrypted key and resets status to disconnected

### Admin Dashboard (`/admin/users`)
Accessible only to users with `is_admin = true`.

- **Stats bar**: Total users, Active, Email Verified, Admins, Free / Pro / Agency counts
- **User table**: search + filter by plan, status, verification
- **Actions**: Edit (name, email, plan, admin toggle), Activate/Deactivate, Delete
- **Session revocation**: Deactivating a user revokes all their active sessions immediately
- **Self-protection**: Admins cannot delete, deactivate, or remove their own admin flag

### Tag Input (`TagInput` component)
Reusable chip-based input used throughout the app:
- Add tags with Enter or comma
- Remove with ×  button or Backspace
- Dropdown auto-suggestions with keyboard navigation (↑↓ Enter Esc)
- Controlled component (`tags` + `onChange`)

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

### Jobs
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/jobs` | List with filters (`query`, `minScore`, `status`, `source`, `remoteOnly`) |
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
| POST | `/api/settings/ai-providers` | Connect provider (validates key, encrypts with AES-256-GCM) |
| DELETE | `/api/settings/ai-providers/:provider` | Disconnect provider, remove encrypted key |
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

Schema lives in `db/postgres_schema.sql`. Migrations in `db/migrations/` are applied automatically on every backend startup (idempotent).

| Table | Purpose |
|-------|---------|
| `account_users` | Users with `is_admin`, `email_verified_at` |
| `user_sessions` | Revocable JWT sessions |
| `password_reset_tokens` | Time-limited reset links |
| `email_verification_tokens` | 6-digit OTP codes (hashed) |
| `user_profiles` | Summary, years experience, salary range |
| `user_skills` | Per-user skill list |
| `resume_preferences` | Full AI engine config (tone, targeting, safety rules) |
| `user_preferences` | Notification + ATS preferences |
| `ai_provider_connections` | OpenAI / Anthropic — AES-256-GCM encrypted keys, selected model, connection status |
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
| `JWT_SECRET` | *(required)* | Long random string — generate with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_EXPIRES_IN` | `7d` | Token expiry |
| `CORS_ORIGIN` | `http://localhost:5678` | Allowed frontend origin |
| `APP_URL` | `http://localhost:5678` | Used in email links |
| `AUTH_RATE_LIMIT` | `20` | Max auth requests per 15 min |
| `SMTP_HOST` | *(optional)* | SMTP server (e.g. `sandbox.smtp.mailtrap.io`) |
| `SMTP_PORT` | `2525` | SMTP port |
| `SMTP_USER` | *(optional)* | SMTP username |
| `SMTP_PASS` | *(optional)* | SMTP password |
| `SMTP_FROM` | `JobFlow AI <noreply@jobflow.ai>` | Sender name + address |
| `ENCRYPTION_KEY` | *(required for AI providers)* | 64-char hex string (32 bytes) for AES-256-GCM key encryption — generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

> If SMTP is not configured, OTP codes and reset links are printed to the backend console.

### Frontend (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | *(not set — uses Vite proxy)* | Set to production API URL for production builds |

---

## Security

- Passwords hashed with **bcrypt** (cost 12)
- JWTs verified and checked against `user_sessions` (revocation supported)
- OTP codes stored as **SHA-256 hashes** with attempt limits and expiry
- Sessions expire after 7 days; deactivating a user immediately revokes all sessions
- Auth routes rate-limited (20 req / 15 min)
- CORS restricted to `CORS_ORIGIN`
- Security headers via **Helmet**
- All SQL uses parameterized queries (no string interpolation)
- AI provider keys encrypted with **AES-256-GCM** at rest (IV + auth tag stored separately); decrypted server-side only for test calls

---

## Production Deployment

1. Build frontend: `npm run build` → deploy `dist/` to Vercel / Netlify / CDN
2. Deploy backend to Railway / Render / Fly.io / ECS
3. Provision managed PostgreSQL (Supabase, Neon, RDS)
4. Set all environment variables in your platform
5. Run seed once: `npm run db:seed`
6. Set `VITE_API_URL` to your production API URL

---

## Connecting Real AI (OpenAI / Anthropic)

Scoring and generation routes return placeholder responses. To wire up real AI:

1. Go to **Settings → AI Providers** and enter your API key
2. In `backend/src/routes/jobs.ts`, replace sections marked `// In production:` with actual OpenAI / Anthropic SDK calls
3. The `resume_preferences` table already provides all the AI configuration data (tone, style, target roles, keywords, safety rules) to pass into your prompts
