-- ──────────────────────────────────────────────────────────────────────────
-- 005_job_agent.sql  — Autonomous Job Agent tables
-- ──────────────────────────────────────────────────────────────────────────

-- Search profiles: reusable, scheduled search configurations
CREATE TABLE IF NOT EXISTS search_profiles (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  name                 text NOT NULL,
  job_titles           text[] NOT NULL DEFAULT '{}',
  locations            text[] NOT NULL DEFAULT '{}',
  remote_only          boolean NOT NULL DEFAULT false,
  include_nearby       boolean NOT NULL DEFAULT false,
  salary_min           integer,
  salary_max           integer,
  experience_levels    text[] NOT NULL DEFAULT '{}',
  must_have_keywords   text[] NOT NULL DEFAULT '{}',
  nice_to_have_keywords text[] NOT NULL DEFAULT '{}',
  excluded_companies   text[] NOT NULL DEFAULT '{}',
  included_companies   text[] NOT NULL DEFAULT '{}',
  company_sizes        text[] NOT NULL DEFAULT '{}',
  sources              text[] NOT NULL DEFAULT '{greenhouse,lever}',
  search_mode          text NOT NULL DEFAULT 'balanced'
                         CHECK (search_mode IN ('strict','balanced','broad')),
  score_threshold      integer NOT NULL DEFAULT 70,
  auto_resume          boolean NOT NULL DEFAULT false,
  schedule             text NOT NULL DEFAULT 'daily'
                         CHECK (schedule IN ('6h','daily','weekdays')),
  is_active            boolean NOT NULL DEFAULT true,
  last_run_at          timestamptz,
  next_run_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Normalized, scored job matches from the pipeline
CREATE TABLE IF NOT EXISTS job_matches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  profile_id        uuid REFERENCES search_profiles(id) ON DELETE SET NULL,
  -- source identity (dedup key)
  external_id       text,
  source            text NOT NULL,
  source_url        text,
  -- job fields
  title             text NOT NULL,
  company           text,
  location          text,
  salary_min        integer,
  salary_max        integer,
  salary_currency   text DEFAULT 'USD',
  remote            boolean DEFAULT false,
  job_type          text,
  description       text,
  requirements      text[] DEFAULT '{}',
  posted_at         timestamptz,
  raw_data          jsonb DEFAULT '{}',
  -- pipeline output
  ai_score          integer,
  score_breakdown   jsonb DEFAULT '{}',
  match_tier        text DEFAULT 'new'
                      CHECK (match_tier IN ('strong','maybe','weak','reject','new')),
  scored_at         timestamptz,
  -- user actions
  status            text NOT NULL DEFAULT 'new'
                      CHECK (status IN ('new','viewed','saved','applied','dismissed')),
  resume_generated  boolean DEFAULT false,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source, external_id)
);

-- Per-user connector / source configurations
CREATE TABLE IF NOT EXISTS connector_configs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  connector    text NOT NULL,
  is_active    boolean NOT NULL DEFAULT false,
  config       jsonb NOT NULL DEFAULT '{}',
  last_sync_at timestamptz,
  last_error   text,
  job_count    integer DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, connector)
);

-- Audit log of every agent run (scheduled or manual)
CREATE TABLE IF NOT EXISTS agent_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  profile_id     uuid REFERENCES search_profiles(id) ON DELETE SET NULL,
  trigger        text NOT NULL DEFAULT 'schedule'
                   CHECK (trigger IN ('schedule','manual')),
  status         text NOT NULL DEFAULT 'running'
                   CHECK (status IN ('running','completed','failed')),
  jobs_found     integer DEFAULT 0,
  jobs_new       integer DEFAULT 0,
  jobs_scored    integer DEFAULT 0,
  strong_matches integer DEFAULT 0,
  error          text,
  started_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_search_profiles_user      ON search_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_search_profiles_next_run  ON search_profiles(next_run_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_job_matches_user_tier      ON job_matches(user_id, match_tier);
CREATE INDEX IF NOT EXISTS idx_job_matches_user_status    ON job_matches(user_id, status);
CREATE INDEX IF NOT EXISTS idx_job_matches_profile        ON job_matches(profile_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_user            ON agent_runs(user_id, started_at DESC);
