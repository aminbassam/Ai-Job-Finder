# Day One Developer Onboarding

This guide is the fastest path from a fresh clone to a working local JobFlow AI environment.

## What You Are Running

JobFlow AI is a full-stack app with three moving parts:

- Frontend: React + Vite on `http://localhost:5678`
- Backend: Express + TypeScript on `http://localhost:3001`
- Database: PostgreSQL on `localhost:5432`

The frontend sends all `/api/*` requests to the backend through the Vite proxy in [vite.config.ts](/Users/aminbassam/Documents/Cursor/Job Finder/vite.config.ts). The backend persists data in PostgreSQL using the schema in [db/postgres_schema.sql](/Users/aminbassam/Documents/Cursor/Job Finder/db/postgres_schema.sql) plus incremental SQL migrations in [db/migrations](/Users/aminbassam/Documents/Cursor/Job Finder/db/migrations/001_email_verification.sql).

## Prerequisites

- Node.js 20+
- npm
- PostgreSQL 14+ or Docker Desktop

## Recommended First-Time Setup

### 1. Clone and install dependencies

From the repo root:

```bash
npm install
cd backend
npm install
cd ..
```

### 2. Start PostgreSQL

Recommended option:

```bash
docker-compose up -d
docker-compose ps
```

Wait until the `postgres` service is healthy.

What Docker gives you:

- database: `jobflow`
- user: `jobflow`
- password: `jobflow_dev`

The Docker setup auto-loads:

- [db/postgres_schema.sql](/Users/aminbassam/Documents/Cursor/Job Finder/db/postgres_schema.sql)
- [db/migrations/001_email_verification.sql](/Users/aminbassam/Documents/Cursor/Job Finder/db/migrations/001_email_verification.sql)

The backend applies the full migration set again on startup, so first boot is safe even if some tables or columns already exist.

### 3. Create `backend/.env`

Start from the checked-in example:

```bash
cd backend
cp .env.example .env
```

Then edit `backend/.env`.

Minimum working contents:

```env
DATABASE_URL=postgresql://jobflow:jobflow_dev@localhost:5432/jobflow
PORT=3001
JWT_SECRET=replace-this-with-a-long-random-string
JWT_EXPIRES_IN=7d
SESSION_TTL_SECONDS=604800
CORS_ORIGIN=http://localhost:5678
AUTH_RATE_LIMIT=20
NODE_ENV=development
APP_URL=http://localhost:5678
ENCRYPTION_KEY=replace-this-with-64-hex-characters
```

Generate a strong JWT secret with:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Generate the encryption key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

If `SMTP_HOST` is left blank, verification and reset emails fall back to console output in local development.

### 4. Seed demo data

From `backend/`:

```bash
npm run db:seed
```

This seeds:

- subscription plans
- demo companies and jobs
- tags
- a superadmin account

### 5. Start the backend

From `backend/`:

```bash
npm run dev
```

Healthy signs:

- `JobFlow API running on http://localhost:3001`
- `[db] Migrations applied.`
- `[scheduler] Started`

Quick check:

```bash
curl http://localhost:3001/health
```

Expected response:

```json
{"status":"ok","timestamp":"..."}
```

### 6. Start the frontend

From the repo root:

```bash
npm run dev
```

Open:

`http://localhost:5678`

## First Login

Seeded admin account:

- Email: `admin@jobflow.ai`
- Password: `Admin@123456`

Useful first pages:

- `/auth/login`
- `/agent`
- `/settings`
- `/admin/users`

## Recommended Day-One Smoke Test

1. Open `http://localhost:5678`
2. Sign in with the seeded admin account
3. Confirm you land in the authenticated app
4. Open `/settings` and make a small profile change
5. Open `/agent`
6. Create a search profile
7. Trigger a manual run
8. Confirm results or run logs appear
9. Open `/admin/users` and verify the admin dashboard loads

If those steps work, the core stack is healthy.

## Repo Map

Frontend:

- [src/app/routes.tsx](/Users/aminbassam/Documents/Cursor/Job Finder/src/app/routes.tsx)
- [src/app/contexts/AuthContext.tsx](/Users/aminbassam/Documents/Cursor/Job Finder/src/app/contexts/AuthContext.tsx)
- [src/app/services](/Users/aminbassam/Documents/Cursor/Job Finder/src/app/services/api.ts)
- [src/app/pages/JobAgent.tsx](/Users/aminbassam/Documents/Cursor/Job Finder/src/app/pages/JobAgent.tsx)
- [src/app/pages/Settings.tsx](/Users/aminbassam/Documents/Cursor/Job Finder/src/app/pages/Settings.tsx)

Backend:

- [backend/src/index.ts](/Users/aminbassam/Documents/Cursor/Job Finder/backend/src/index.ts)
- [backend/src/routes/auth.ts](/Users/aminbassam/Documents/Cursor/Job Finder/backend/src/routes/auth.ts)
- [backend/src/routes/agent.ts](/Users/aminbassam/Documents/Cursor/Job Finder/backend/src/routes/agent.ts)
- [backend/src/routes/settings.ts](/Users/aminbassam/Documents/Cursor/Job Finder/backend/src/routes/settings.ts)
- [backend/src/routes/admin.ts](/Users/aminbassam/Documents/Cursor/Job Finder/backend/src/routes/admin.ts)

Database:

- [db/postgres_schema.sql](/Users/aminbassam/Documents/Cursor/Job Finder/db/postgres_schema.sql)
- [db/migrations/005_job_agent.sql](/Users/aminbassam/Documents/Cursor/Job Finder/db/migrations/005_job_agent.sql)

## Common Setup Failures

### `DATABASE_URL environment variable is not set`

Cause:

- `backend/.env` is missing or not loaded

Fix:

- create `backend/.env`
- restart the backend

The check that throws this lives in [backend/src/db/pool.ts](/Users/aminbassam/Documents/Cursor/Job Finder/backend/src/db/pool.ts).

### `role "jobflow" does not exist`

Cause:

- PostgreSQL is running, but the `jobflow` role/database was never created

Fix:

- use Docker Compose, or
- create the role and DB manually to match `DATABASE_URL`

### Vite shows `http proxy error: /api/... ECONNREFUSED`

Cause:

- frontend is running, backend is not

Fix:

- start `backend` on port `3001`

### Signup or login returns `500`

Cause:

- backend crashed on startup, DB is unavailable, or schema is incomplete

Fix:

1. check the backend terminal first
2. confirm Postgres is healthy
3. confirm `DATABASE_URL`
4. rerun `npm run db:seed`

### Docker database starts but app behavior is weird

Cause:

- existing persisted volume with older schema/data

Fix:

If you are okay resetting local DB state:

```bash
docker-compose down -v
docker-compose up -d
```

Then reseed from `backend/`:

```bash
npm run db:seed
```

## Helpful Commands

Backend:

```bash
cd backend
npm run dev
npm run db:seed
npm run db:migrate
```

Frontend:

```bash
npm run dev
npm run build
```

Database:

```bash
docker-compose up -d
docker-compose ps
docker-compose down
docker-compose down -v
```

## Current Architectural Notes

- Auth is real and API-backed. The frontend no longer uses mock auth.
- The Job Agent is implemented end to end and depends on DB-backed profiles, connector configs, runs, and matches.
- AI provider keys are validated and then encrypted before storage.
- The backend starts the scheduler automatically, so background job-agent activity is part of normal local startup.

## Suggested Next Reads

- Overview: [README.md](/Users/aminbassam/Documents/Cursor/Job Finder/README.md)
- DB design: [docs/postgres-db-design.md](/Users/aminbassam/Documents/Cursor/Job Finder/docs/postgres-db-design.md)
- Agent pipeline: [backend/src/services/pipeline.ts](/Users/aminbassam/Documents/Cursor/Job Finder/backend/src/services/pipeline.ts)
- Auth flow: [backend/src/routes/auth.ts](/Users/aminbassam/Documents/Cursor/Job Finder/backend/src/routes/auth.ts)
