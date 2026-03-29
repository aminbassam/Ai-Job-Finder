# Gmail LinkedIn Email Ingestion

This feature turns LinkedIn job alert emails into a passive job discovery source for JobFlow AI.

## What It Does

Once Gmail is connected in Settings → Integrations:

- JobFlow reads LinkedIn job alert emails with the `gmail.readonly` scope
- extracts job title, company, location, URL, and snippet content
- falls back to AI extraction when the email structure is weak
- writes the result into the canonical `jobs` layer
- matches the job against active Search Profiles that include the `linkedin-email` source
- saves the best match into `job_matches` so it appears in Job Board / Job Agent
- updates `job_score_runs` and `user_job_states`

## Required Environment Variables

Add these to `backend/.env`:

```env
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/api/gmail/callback
```

Google Cloud OAuth configuration must allow the same redirect URI.

## Database

Schema additions:

- `gmail_accounts`
- `gmail_synced_messages`

See:

- [db/migrations/016_gmail_linkedin_ingestion.sql](/Users/aminbassam/Documents/Cursor/Job Finder/db/migrations/016_gmail_linkedin_ingestion.sql)
- [db/postgres_schema.sql](/Users/aminbassam/Documents/Cursor/Job Finder/db/postgres_schema.sql)

## Backend Entry Points

- OAuth + sync routes:
  - [backend/src/routes/gmail.ts](/Users/aminbassam/Documents/Cursor/Job Finder/backend/src/routes/gmail.ts)
- Core ingestion pipeline:
  - [backend/src/services/gmail-linkedin-ingestion.ts](/Users/aminbassam/Documents/Cursor/Job Finder/backend/src/services/gmail-linkedin-ingestion.ts)
- AI fallback extraction:
  - [backend/src/routes/ai.ts](/Users/aminbassam/Documents/Cursor/Job Finder/backend/src/routes/ai.ts)
- Scheduler:
  - [backend/src/services/scheduler.ts](/Users/aminbassam/Documents/Cursor/Job Finder/backend/src/services/scheduler.ts)

## Frontend Entry Points

- Settings integration UI:
  - [src/app/pages/settings/IntegrationsTab.tsx](/Users/aminbassam/Documents/Cursor/Job Finder/src/app/pages/settings/IntegrationsTab.tsx)
- Settings shell:
  - [src/app/pages/Settings.tsx](/Users/aminbassam/Documents/Cursor/Job Finder/src/app/pages/Settings.tsx)
- Settings API client:
  - [src/app/services/settings.service.ts](/Users/aminbassam/Documents/Cursor/Job Finder/src/app/services/settings.service.ts)

## Operational Notes

- Sync runs automatically every 15 minutes
- Manual sync is available from Settings → Integrations
- The source is exposed to Search Profiles as `linkedin-email` only when the connector is active
- Imported jobs avoid direct LinkedIn scraping and rely on email content instead
- Platform health and failures are visible in `/admin/logs`
