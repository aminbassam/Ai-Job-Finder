# JobFlow AI — Autonomous AI Job Agent

A full-stack SaaS platform with an **autonomous job discovery engine** at its core. Set your search strategy once — the agent searches, scores, and surfaces the best matches automatically across multiple sources on a schedule.

Developer onboarding:

- [docs/day-one-developer-onboarding.md](/Users/aminbassam/Documents/Cursor/Job Finder/docs/day-one-developer-onboarding.md)
- [docs/master-resume-system.md](/Users/aminbassam/Documents/Cursor/Job Finder/docs/master-resume-system.md)
- [docs/gmail-linkedin-ingestion.md](/Users/aminbassam/Documents/Cursor/Job Finder/docs/gmail-linkedin-ingestion.md)

---

## Project Structure

```
/                              ← Frontend (React + Vite + TypeScript)
  src/app/
    contexts/                  ← AuthContext (JWT session + user state)
    services/                  ← api.ts, auth.service.ts, profile.service.ts,
    |                             settings.service.ts, agent.service.ts,
    |                             masterResume.service.ts
    pages/                     ← Dashboard, JobAgent, JobBoard, Resume,
    |                             Applications, Analytics, Settings
    pages/master-resume/       ← ProfilesWorkspace, ImportWorkspace
    pages/agent/               ← ProfilesTab, SourcesTab, ResultsTab, ImportTab, RunsTab
    pages/settings/            ← ResumePreferencesTab, AiProvidersTab, GlobalAiSettingsTab,
    |                             IntegrationsTab, Download Extension
    pages/admin/               ← AdminUsers dashboard, PlatformLogs
    pages/auth/                ← Login, Signup, ForgotPassword, VerifyEmail (OTP)
    components/ui/             ← shadcn/ui components + TagInput, LocationInput
    components/documents/      ← document preview modal
    components/resume/         ← ResumeGenerationDialog
    components/auth/           ← ProtectedRoute, GuestRoute
    components/layouts/        ← RootLayout, AppSidebar
  index.html
  vite.config.ts               ← API proxy → backend:3001

/backend/                      ← API server (Node.js + Express + TypeScript)
  src/
    db/pool.ts                 ← PostgreSQL connection pool
    db/seed.ts                 ← Local admin seed + demo workspace seed
    db/migrate.ts              ← Standalone migration runner
    middleware/auth.ts         ← JWT verify + session check
    middleware/adminAuth.ts    ← requireAdmin middleware
    middleware/validate.ts     ← Zod request validation
    routes/auth.ts             ← POST /api/auth/*
    routes/jobs.ts             ← GET/POST /api/jobs/*
    routes/profile.ts          ← GET/PUT /api/profile
    routes/agent.ts            ← GET/POST /api/agent/* (profiles, results, connectors, import)
    routes/master-resume.ts    ← GET/POST/PUT/DELETE /api/master-resume/*
    routes/ai.ts               ← POST /api/ai/* (resume parse, bullets, summary, score)
    routes/gmail.ts            ← Gmail OAuth, sync, disconnect
    routes/applications.ts     ← GET/POST/PUT /api/applications
    routes/activity.ts         ← GET /api/activity
    routes/analytics.ts        ← GET /api/analytics/*
    routes/settings.ts         ← GET/PUT /api/settings/*
    routes/documents.ts        ← GET /api/documents/*
    routes/admin.ts            ← GET/PATCH/DELETE /api/admin/*
    services/pipeline.ts       ← Match pipeline: normalize → score → tier → persist
    services/scheduler.ts      ← node-cron scheduler (agent every 30 min, Gmail every 15 min)
    services/gmail-linkedin-ingestion.ts ← Gmail OAuth + LinkedIn email parsing + import
    services/master-resume.ts  ← structured master resume persistence + aggregate loading
    services/master-resume-import.ts ← PDF/DOCX master resume parsing + normalization
    services/master-resume-score.ts  ← ATS / impact / completeness / MQ scoring
    services/ai-client.ts      ← shared OpenAI helper for JSON/chat completions
    services/job-ai-extraction.ts ← job/email AI extraction fallback
    services/resume-renderer.ts← rich resume HTML rendering
    services/pdf.ts            ← PDF generation for downloads
    services/connectors/
      base.ts                  ← Connector interface + shared title-match helper
      builtinaustin.ts         ← Built In Austin crawler (Lane 1)
      greenhouse.ts            ← Greenhouse public board API (Lane 1)
      lever.ts                 ← Lever public postings API (Lane 1)
      ats-feed.ts              ← Ashby public board API (Lane 1)
      remotive.ts              ← Remotive remote jobs API (free, no key)
      arbeitnow.ts             ← Arbeitnow job board API (free, no key)
      ziprecruiter.ts          ← ZipRecruiter official Partner API (key required)
      usajobs.ts               ← USAJobs federal jobs API (key required)
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
    009_global_ai_settings.sql ← shared AI settings / custom prompt controls
    010_resume_rich_formatting.sql ← rich resume HTML + formatting settings
    011_multi_profile_master_resume.sql ← structured multi-profile master resume system
    016_gmail_linkedin_ingestion.sql ← Gmail OAuth + synced LinkedIn email jobs
    017_profile_activity_logs.sql ← per-profile action timeline (create/run/pause/cancel)
    018_account_usernames.sql  ← optional username sign-in support
    019_demo_users.sql         ← demo users + 24h cleanup support

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

npm run db:seed        # seed local admin + demo data
npm run dev            # hot-reload dev server
```

API available at `http://localhost:3001`
Health check: `curl http://localhost:3001/health`

Optional before seeding:

```env
SEED_ADMIN_EMAIL=admin@local.jobflow.test
SEED_ADMIN_PASSWORD=choose-a-strong-local-password
```

If `SEED_ADMIN_PASSWORD` is omitted, the seed script generates a local-only admin password and prints it once to the console.

> All migrations run automatically on every startup — no manual step needed.
> The scheduler starts automatically with the server for both Job Agent polling and Gmail LinkedIn email ingestion.

If you want Gmail LinkedIn alert ingestion locally, also configure:

```env
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/api/gmail/callback
```

### 3. Frontend setup

```bash
# From project root
npm install
npm run dev
```

Open **http://localhost:5678**. All `/api/*` requests proxy to `http://localhost:3001`.

---

## Seeded Local Data

`npm run db:seed` creates:

- subscription plans
- local admin access for development
- a seeded demo workspace for dashboard / job board walkthroughs

Admin credentials are intentionally not committed to the repository or this README. Set `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` before seeding, or use the one-time generated password printed by the seed script.

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
| **Lane 1** — Free APIs (default) | Remotive | None | Remote jobs API; category-based fetch + client-side title filter |
| **Lane 1** — Free APIs (default) | Arbeitnow | None | EU/global job board API; paginated, respects remote filter |
| **Lane 1** — Autonomous ATS | Google | None | Best-effort public job discovery + metadata enrichment |
| **Lane 1** — Autonomous ATS | Built In Austin | None | Playwright crawler with pagination + detail enrichment |
| **Lane 1** — Autonomous ATS | Greenhouse | None | Public board API — provide company slugs |
| **Lane 1** — Autonomous ATS | Lever | None | Public postings API — provide company slugs |
| **Lane 1** — Autonomous ATS | Ashby | None | Public board API — provide company + slug pairs |
| **Lane 2** — Official API | ZipRecruiter | API key | Official Partner API; fan-out across job titles × locations |
| **Lane 2** — Official API | USAJobs | Email + API key | US federal jobs via `data.usajobs.gov`; public positions only |
| **Lane 2** — Official API | Upwork | OAuth2 token | GraphQL search — contract/freelance work |
| **Lane 3** — Browser Extension | LinkedIn, Indeed, Glassdoor, ZipRecruiter, Lever, Greenhouse, Workday, any page | Extension | One-click save from supported job pages into the Job Board |
| **Lane 4** — Email Ingestion | LinkedIn alerts via Gmail | Gmail OAuth | Reads LinkedIn alert emails, imports jobs, and scores matches automatically |

#### Profile Activity Log
Each profile card shows a collapsible timeline of every action taken:
- Profile created / updated / paused / resumed / deleted
- Run started / completed (with job counts) / failed / cancelled
- Timestamps with relative time display

#### Run Lifecycle (per profile)
- Click **Run** → button swaps to **Stop**, an "In Progress" badge appears, and the app polls `GET /api/agent/runs/:runId` every 2 seconds
- On completion: shows jobs found + strong match summary
- Click **Stop** → cancels the in-flight run via `POST /api/agent/runs/:runId/cancel`

#### AI Scoring in the Pipeline
All jobs discovered by search profiles are inserted as `match_tier='new'` and immediately queued for AI scoring using the same `scoreJobWithAi` function used for manual imports. Every pipeline job gets the full breakdown (skillsMatch / experienceMatch / roleAlignment / locationSalaryFit) and appears in the Job Board with complete AI analysis.

#### Results Inbox
- Filter by tier (Strong / Maybe / Weak) and status (New / Saved / Applied)
- AI score ring with full score breakdown (skills / experience / role / location-salary)
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

### Job Board (`/jobs`)
Unified workspace for reviewing all matched and imported jobs.

- **Grid view** — default card layout with score ring, tier badge, and quick actions
- **List view** — compact table with bulk selection:
  - Select All checkbox (with indeterminate state when partially selected)
  - Per-row checkboxes; selected rows highlighted
  - Bulk action toolbar: "X selected · Delete Selected · Clear"
  - Bulk delete removes selected jobs from the database with optimistic UI
- AI analysis panel per job: score breakdown bars, strengths, weaknesses, keywords to mirror
- Resume generation per job: linked tailored resume or generate button
- Missing AI provider / API key errors link directly to **Settings → AI Providers**
- Tabs: All · Strong · Maybe · New · Saved · Applied
- Source badges distinguish `Agent`, `Manual`, and `Extension` imports

### Resume (`/resume`)
The Resume area is now the **Master Resume** hub.

It includes:
- multiple structured Master Resume profiles per user
- PDF / DOCX resume upload
- structured experience, bullets, skills, projects, and leadership editing
- AI summary generation
- AI bullet generation
- ATS / impact / completeness / MQ scoring against a job description
- import history + parsed JSON preview

Important behavior:
- the Master Resume is a structured data layer, not just a document
- Master Resume imports now support PDF / DOCX resume uploads only

### Settings → Integrations

- Connect Gmail with Google OAuth (`gmail.readonly`)
- Sync LinkedIn job alert emails manually or automatically every 15 minutes
- Imported email jobs are normalized into the canonical jobs layer and also surfaced in the Job Board through the Job Agent match flow
- Disconnect Gmail at any time

### Admin → Platform Logs (`/admin/logs`)

- Unified platform visibility for:
  - Job Agent runs
  - connector health
  - recent activity events
- Quick health summary for failures, warnings, active connectors, and 24h run stats
- Table view for debugging whether the autonomous pipeline is actually working
- the default Master Resume profile feeds AI job scoring and tailored resume generation elsewhere in the platform
- legacy resume preferences still exist for compatibility, but structured profiles are now the main source of truth

See:
- [docs/master-resume-system.md](/Users/aminbassam/Documents/Cursor/Job Finder/docs/master-resume-system.md)

### Authentication
- Signup / Login with JWT (7-day sessions, revocable)
- Sign in with either email or optional username
- **Email OTP verification** — 6-digit code, 15-min TTL, 5-attempt limit
- Forgot password / Reset password via email link
- In-app password change from Settings
- Rate-limited auth routes (20 req/15 min)

### Settings — Profile Tab
- Live form pre-populated from `GET /api/profile`
- Editable: first name, last name, username, job title, LinkedIn URL
- US-only city/state autocomplete powered by OpenStreetMap (Nominatim) — no API key required
- Email is read-only
- Saves to `PUT /api/profile` and syncs name/location to sidebar instantly
- Includes a signed-in password change form

### Location Search Experience
- Shared US-only location suggestions are used across profile settings, manual job import, search profile locations, connector preferred locations, and the broader search workspace
- Suggestions now stay closed until the field is focused instead of rendering open by default
- Supports US states, US cities, and `Remote`

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

### Settings — AI Settings

Global AI behavior is now centralized in Settings and shared across the platform.

This includes:
- AI behavior control
- optimization settings
- AI safety rules
- custom AI roles
- default AI instructions
- resume formatting controls
- Google Fonts selections for resume title/body fonts

These settings are used by:
- AI resume generation
- AI resume improvement
- AI job scoring
- Master Resume parsing and generation flows
**Auto-save** — debounced 2s after any change, with "Saved Xs ago" indicator.

### Settings — AI Providers
- **Live status**: disconnected → validating → connected / error
- **Real key validation**: backend calls `/v1/models` on OpenAI / Anthropic with 8s timeout
- **AES-256-GCM encryption** at rest — IV + auth tag in separate DB columns
- **Model selector** after connection: gpt-4o / gpt-4o-mini / gpt-4-turbo / gpt-3.5-turbo · claude-opus-4-6 / claude-sonnet-4-6 / claude-haiku-4-5
- Setup instructions and official help links for finding provider API keys
- Test connection button · Disconnect removes encrypted key

### Settings — Download Extension
- Direct ZIP download for the Chrome extension from the app
- Short install steps for loading the unpacked extension in Chrome
- Live API base URL can be pointed at your hosted subdomain

### Admin Dashboard (`/admin/users`)
Requires `is_admin = true`.
- Stats bar, paginated user table, search + plan/status/verification filters
- Edit user, activate/deactivate (revokes all sessions), reset password, delete
- Self-protection: admins cannot deactivate or remove their own admin flag

---

## API Reference

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/signup` | Create account, sends OTP email |
| POST | `/api/auth/login` | Sign in → `{ token, user }` |
| POST | `/api/auth/logout` | Revoke session |
| PATCH | `/api/auth/change-password` | Change password while signed in |
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
| POST | `/api/agent/profiles/:id/run` | Trigger manual run (async, returns `{ runId }`) |
| GET | `/api/agent/profiles/:id/logs` | Activity log timeline for a profile |
| GET | `/api/agent/connectors` | List connector configurations |
| PUT | `/api/agent/connectors/:connector` | Save connector config (slugs, tokens) |
| GET | `/api/agent/results` | Paginated match results (`?tier=strong&status=new`) |
| GET | `/api/agent/results/:id` | Single match detail |
| PATCH | `/api/agent/results/:id/status` | Update match status (new/viewed/saved/applied/dismissed) |
| DELETE | `/api/agent/results/:id` | Delete a single match |
| DELETE | `/api/agent/results` | Bulk delete matches (`{ ids: string[] }` body, max 500) |
| POST | `/api/agent/results/:id/generate-resume` | Generate tailored resume for a match |
| POST | `/api/agent/import` | Manual job import (URL or raw fields) |
| GET | `/api/agent/runs` | Recent agent run history (last 50) |
| GET | `/api/agent/runs/:runId` | Poll a specific run's status |
| POST | `/api/agent/runs/:runId/cancel` | Cancel an in-progress run |

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
| PATCH | `/api/admin/users/:id/password` | Reset a user's password and revoke active sessions |
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
| GET | `/health` | Direct API health check |
| GET | `/api/health` | Reverse-proxy-safe API health alias |

---

## Database

Migrations in `db/migrations/` apply automatically on every backend startup (idempotent).

| Table | Purpose |
|-------|---------|
| `account_users` | Users with `is_admin`, `is_demo`, `username`, `email_verified_at`, `current_job_title`, `linkedin_url` |
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
| `profile_activity_logs` | Per-profile action timeline (create/update/pause/run/cancel/complete) |
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
| `SEED_ADMIN_EMAIL` | `admin@local.jobflow.test` | Optional local admin email used by `npm run db:seed` |
| `SEED_ADMIN_PASSWORD` | *(generated if blank)* | Optional local admin password used by `npm run db:seed` |
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
| ✅ | Multi-lane connector model (Greenhouse, Lever, Ashby, Upwork, Remotive, Arbeitnow, ZipRecruiter, USAJobs) |
| ✅ | Free default sources — Remotive + Arbeitnow work out of the box with no API key |
| ✅ | LLM-based AI scoring pipeline (0-100) with full breakdown per job |
| ✅ | Search profiles with per-profile schedule, run status, Stop button, activity log |
| ✅ | Pipeline → Job Board: all agent-found jobs AI-scored and visible in Job Board |
| ✅ | Results inbox with tier/status filtering |
| ✅ | Job Board list view with bulk select + bulk delete |
| ✅ | Manual import (URL + form) |
| ✅ | AI resume engine config (6 sections + readiness score) |
| ✅ | AES-256-GCM encrypted AI provider keys |
| ✅ | Gmail LinkedIn alert email ingestion (Lane 4) |
| ✅ | Auto-generated tailored resume for strong matches |
| ✅ | Browser extension (Lane 3 manual capture + Settings ZIP download) |
| ✅ | Username sign-in + in-app password change |
| ✅ | Demo workspace with seeded mock data and 24-hour cleanup |
| ✅ | US-only shared location suggestions across settings, imports, and agent profile flows |
| ✅ | Job Board grid default + AI-settings link for provider/API-key errors |
| 🔜 | Push / email notifications for new strong matches |
| 🔜 | Upwork OAuth2 flow in the UI |
