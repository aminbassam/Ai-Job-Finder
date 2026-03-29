# Master Resume System

The Master Resume is now a structured career intelligence layer, not a single static document.

## What It Does

- supports multiple Master Resume profiles per user
- stores structured experience, bullets, skills, projects, and leadership
- imports source data from:
  - LinkedIn profile URL
  - uploaded PDF/DOCX resume
- parses raw source data into structured JSON
- normalizes imported data into reusable Master Resume profiles
- powers AI job scoring and tailored resume generation through the default profile

## Core Model

The system is centered around one `master_resumes` record per user, with one or more child profiles in `master_resume_profiles`.

Each profile can contain:

- target roles
- summary
- experience years
- experiences
- bullets
- skills
- projects
- leadership context

Imports are stored separately in `master_resume_imports` so the raw parse record can be reviewed and reused later.

## Tables

Added in [011_multi_profile_master_resume.sql](/Users/aminbassam/Documents/Cursor/Job%20Finder/db/migrations/011_multi_profile_master_resume.sql):

- `master_resumes`
- `master_resume_imports`
- `master_resume_profiles`
- `master_resume_experiences`
- `master_resume_bullets`
- `master_resume_skills`
- `master_resume_projects`
- `master_resume_leadership`

## Backend APIs

### Master Resume CRUD

- `GET /api/master-resume/profiles`
- `GET /api/master-resume/profiles/:id`
- `POST /api/master-resume/profiles`
- `PUT /api/master-resume/profiles/:id`
- `DELETE /api/master-resume/profiles/:id`
- `GET /api/master-resume/imports`
- `POST /api/master-resume/profiles/from-import`

### AI + Import APIs

- `POST /api/ai/parse-linkedin`
- `POST /api/ai/parse-resume`
- `POST /api/ai/generate-summary`
- `POST /api/ai/generate-bullets`
- `POST /api/ai/score-resume`

## Import Flow

### LinkedIn Import

1. User submits a LinkedIn profile URL.
2. Backend attempts extraction with Playwright first.
3. If Playwright is unavailable or blocked, backend falls back to HTML fetch + text extraction.
4. Extracted text is sent through the connected OpenAI provider.
5. AI returns structured JSON.
6. Raw text and parsed JSON are saved to `master_resume_imports`.
7. User can create a structured profile immediately or later from the saved import.

### Resume Upload

1. User uploads a PDF or DOCX file.
2. Backend extracts text using:
   - `pdf-parse` for PDF
   - `mammoth` for DOCX
3. Extracted text is sent through the connected OpenAI provider.
4. Parsed JSON is saved to `master_resume_imports`.
5. User can create a structured profile from the parsed result.

## AI Behavior

The Master Resume system uses the connected OpenAI provider and inherits the global AI behavior configured in Settings.

That means these settings apply here too:

- AI behavior control
- optimization settings
- AI safety rules
- custom AI roles
- default AI instructions

## Resume Scoring

The resume scoring endpoint returns:

- ATS score
- impact score
- completeness score
- MQ match score
- matched skills
- missing skills
- suggestions

Current scoring is deterministic and uses:

- keyword coverage from the job description
- bullet metric detection
- section completeness checks
- minimum qualification gap analysis

## Frontend UX

The `/resume` page is now a Master Resume hub with three areas:

- `Profiles`
  - structured profile builder
  - AI summary generation
  - AI bullet generation
  - score panel
- `Import`
  - LinkedIn import
  - PDF/DOCX upload
  - parsed JSON preview
  - import history
- `Legacy Preferences`
  - compatibility bridge for older resume-preference workflows

## Platform Integration

The default Master Resume profile is merged into the rest of the system:

- AI job scoring uses it as additional candidate context
- tailored resume generation uses it as structured candidate context
- this makes the Master Resume the shared source of truth across the platform

## Local Notes

- `npm run build` passes for both backend and frontend with this feature set
- the database migration still requires a reachable local PostgreSQL instance
- if `npm run db:migrate` fails with a `pg` connection error, start Postgres and rerun it
