# PostgreSQL Database Design for Job Finder

## What the code review showed

The current repo is a React frontend with mock data and mocked service layers. There is no backend persistence yet, but the UI already implies a fairly rich domain:

- Auth with sessions, signup, login, logout, and password reset.
- Search runs with source filters, salary range, location, remote-only, and experience level.
- A job board where jobs have sources, tags, requirements, scores, and user-specific states.
- Resume vault support for both master resumes and AI-tailored resumes.
- Application pipeline tracking with table and kanban views.
- Settings for profile, resume preferences, AI providers, notifications, and billing.
- Dashboard and analytics that should be derived from operational data instead of static mocks.

## Key modeling decisions

### 1. Separate global job data from user-specific state

The same job posting can appear for many users, but each user has their own:

- saved/not saved state
- fit score
- stage on the board
- notes
- application progress

That is why the schema separates:

- `jobs`, `companies`, `job_sources`, `job_requirements`, `job_tags`
- `user_job_states`, `job_score_runs`, `applications`

### 2. Treat scoring and generation as historical runs

The UI already exposes AI scoring, resume generation, and cover-letter generation. Those are not static fields. They are outputs of time-based runs that may change as:

- the user updates their profile
- the model changes
- the prompt changes
- the job posting changes

So the schema stores them as history:

- `job_score_runs`
- `job_score_breakdowns`
- `ai_runs`
- `documents`
- `document_versions`

### 3. Keep applications normalized, but snapshot what matters

Applications point to the canonical `job`, selected `resume`, optional `cover_letter`, and latest `score_run`. If you later need a legal/audit trail for exactly what was submitted, the `documents` and `document_versions` tables already support that cleanly.

### 4. Store analytics as derived data, not hand-maintained counters

The current dashboard and analytics screens can be produced from operational tables. The schema includes starter views:

- `analytics_jobs_per_week`
- `analytics_source_performance`
- `analytics_application_funnel`

These should be queried per `user_id` by the backend API.

### 5. Never store provider keys in plaintext

The settings page currently displays provider API key fields. In PostgreSQL, these should be stored encrypted at rest, or preferably stored outside the DB in a secret manager with only a reference in PostgreSQL. The schema uses `encrypted_api_key bytea` as the DB-side placeholder.

## Table groups

### Identity and billing

- `account_users`
- `user_sessions`
- `password_reset_tokens`
- `subscription_plans`
- `user_subscriptions`
- `user_credit_ledger`

### User profile and settings

- `user_profiles`
- `user_skills`
- `user_job_preferences`
- `user_preferences`
- `ai_provider_connections`
- `saved_searches`
- `job_search_runs`

### Job catalog

- `companies`
- `job_sources`
- `jobs`
- `job_requirements`
- `tags`
- `job_tags`

### User job workflow

- `user_job_states`
- `job_score_runs`
- `job_score_breakdowns`

### Documents and applications

- `documents`
- `document_versions`
- `applications`
- `application_status_history`

### AI operations and timeline

- `ai_runs`
- `activity_events`

## How this maps to the current frontend

### `SearchJobs.tsx`

Backed by:

- `saved_searches`
- `job_search_runs`
- `user_job_preferences`

### `JobBoard.tsx` and `JobDetail.tsx`

Backed by:

- `jobs`
- `companies`
- `job_sources`
- `job_requirements`
- `tags`
- `job_tags`
- `user_job_states`
- `job_score_runs`
- `job_score_breakdowns`

### `ResumeVault.tsx`

Backed by:

- `documents`
- `document_versions`

Use `kind = 'resume'` and `resume_type IN ('master', 'tailored')`.

### `Applications.tsx`

Backed by:

- `applications`
- `application_status_history`
- `documents`
- `job_score_runs`

### `Settings.tsx`

Backed by:

- `account_users`
- `user_profiles`
- `user_preferences`
- `ai_provider_connections`
- `user_subscriptions`
- `subscription_plans`

### `Dashboard.tsx` and `Analytics.tsx`

Backed by:

- `activity_events`
- the analytics views
- `documents`
- `applications`
- `user_job_states`
- `job_score_runs`

## Important improvements over the current mock model

### Job status vs application status

The mock data uses one status vocabulary across both jobs and applications. That will become limiting quickly. The schema splits them into:

- `job_stage` for job-board lifecycle
- `application_status` for actual application pipeline lifecycle

This makes it easier to support states like:

- a job can be `saved` without an application existing yet
- an application can be `draft` while the job is still `ready`
- an application can be `withdrawn` even if the job still exists

### Applications should not duplicate job title and company as source of truth

The mock application objects repeat `jobTitle`, `company`, `score`, and `source`. In the real system, those should resolve from related tables. If you need immutable submission snapshots later, add explicit snapshot columns deliberately rather than making duplication the default model.

### Resume data needs versioning

A single resume file is not enough because the product already implies:

- upload master resume
- generate tailored versions
- clone existing resume
- re-generate with AI

That is why the schema uses `documents` plus `document_versions`.

## Recommended API-to-table mapping

- `POST /api/auth/signup` -> `account_users`, `user_profiles`, `user_preferences`, `user_subscriptions`
- `POST /api/auth/login` -> `user_sessions`
- `POST /api/auth/forgot-password` -> `password_reset_tokens`
- `GET /api/jobs` -> `jobs` joined with latest `user_job_states` and latest `job_score_runs`
- `GET /api/jobs/:id` -> same plus `job_requirements`, `job_tags`, `job_score_breakdowns`
- `POST /api/jobs/import-link` -> upsert `companies`, `jobs`, `job_requirements`, `job_tags`, `user_job_states`, plus `ai_runs`
- `POST /api/jobs/:id/score` -> `job_score_runs`, `job_score_breakdowns`, `ai_runs`
- `POST /api/jobs/:id/generate-resume` -> `documents`, `document_versions`, `ai_runs`, `activity_events`
- `POST /api/jobs/:id/generate-cover-letter` -> `documents`, `document_versions`, `ai_runs`, `activity_events`

## Suggested implementation order

1. Ship auth, users, sessions, and password reset tables.
2. Ship companies, job_sources, jobs, requirements, tags, and user_job_states.
3. Ship scoring tables and wire `GET /jobs` plus `POST /jobs/:id/score`.
4. Ship documents and applications.
5. Ship preferences, provider connections, and billing tables.
6. Add analytics endpoints using the starter views.

## Files added

- SQL schema: [db/postgres_schema.sql](/Users/aminbassam/Documents/Cursor/Job Finder/db/postgres_schema.sql)

