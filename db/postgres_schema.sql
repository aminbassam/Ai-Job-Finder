CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE account_plan AS ENUM ('free', 'pro', 'agency');
CREATE TYPE auth_provider AS ENUM ('local', 'google', 'linkedin');
CREATE TYPE work_mode AS ENUM ('remote', 'hybrid', 'onsite', 'unknown');
CREATE TYPE employment_type AS ENUM ('full_time', 'part_time', 'contract', 'temporary', 'internship', 'freelance', 'other');
CREATE TYPE seniority_level AS ENUM ('entry', 'mid', 'senior', 'lead', 'director', 'executive', 'unknown');
CREATE TYPE job_source_kind AS ENUM ('linkedin', 'indeed', 'company', 'angellist', 'manual', 'other');
CREATE TYPE job_stage AS ENUM ('new', 'saved', 'ready', 'applied', 'interview', 'offer', 'accepted', 'rejected', 'archived');
CREATE TYPE application_status AS ENUM ('draft', 'ready', 'applied', 'interview', 'offer', 'accepted', 'rejected', 'withdrawn');
CREATE TYPE document_kind AS ENUM ('resume', 'cover_letter');
CREATE TYPE document_origin AS ENUM ('uploaded', 'manual', 'ai_generated', 'cloned');
CREATE TYPE resume_type AS ENUM ('master', 'tailored');
CREATE TYPE ai_provider AS ENUM ('openai', 'anthropic', 'other');
CREATE TYPE ai_run_kind AS ENUM ('job_import', 'job_score', 'resume_generation', 'cover_letter_generation', 'insight_generation', 'other');
CREATE TYPE activity_type AS ENUM ('job_found', 'match_found', 'resume_generated', 'cover_letter_generated', 'application_sent', 'application_status_changed', 'job_saved', 'search_run', 'profile_updated');
CREATE TYPE billing_interval AS ENUM ('month', 'year');

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE account_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  password_hash text,
  auth_source auth_provider NOT NULL DEFAULT 'local',
  first_name text NOT NULL,
  last_name text NOT NULL,
  location_text text,
  current_job_title text,
  linkedin_url text,
  avatar_url text,
  timezone text NOT NULL DEFAULT 'UTC',
  is_active boolean NOT NULL DEFAULT true,
  email_verified_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT local_auth_requires_password CHECK (
    auth_source <> 'local' OR password_hash IS NOT NULL
  )
);

CREATE TABLE user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  user_agent text,
  ip_address inet,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE subscription_plans (
  code account_plan PRIMARY KEY,
  display_name text NOT NULL,
  monthly_price_cents integer NOT NULL DEFAULT 0,
  yearly_price_cents integer NOT NULL DEFAULT 0,
  monthly_ai_credits integer NOT NULL DEFAULT 0,
  features jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  plan_code account_plan NOT NULL REFERENCES subscription_plans(code),
  status text NOT NULL DEFAULT 'active',
  billing_interval billing_interval,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE user_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  delta integer NOT NULL,
  reason text NOT NULL,
  reference_type text,
  reference_id uuid,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE user_profiles (
  user_id uuid PRIMARY KEY REFERENCES account_users(id) ON DELETE CASCADE,
  professional_summary text,
  years_experience numeric(4,1),
  preferred_location_text text,
  remote_only boolean NOT NULL DEFAULT false,
  min_salary_usd integer,
  max_salary_usd integer,
  default_resume_id uuid,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT salary_range_valid CHECK (
    min_salary_usd IS NULL
    OR max_salary_usd IS NULL
    OR min_salary_usd <= max_salary_usd
  )
);

CREATE TABLE user_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  skill_name text NOT NULL,
  proficiency_score smallint,
  years_experience numeric(4,1),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, skill_name),
  CONSTRAINT proficiency_score_valid CHECK (
    proficiency_score IS NULL OR proficiency_score BETWEEN 0 AND 100
  )
);

CREATE TABLE user_job_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  seniority seniority_level NOT NULL DEFAULT 'unknown',
  work_mode work_mode NOT NULL DEFAULT 'unknown',
  employment_type employment_type NOT NULL DEFAULT 'full_time',
  target_title text,
  preferred_locations text[] NOT NULL DEFAULT ARRAY[]::text[],
  target_sources job_source_kind[] NOT NULL DEFAULT ARRAY[]::job_source_kind[],
  is_default boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE user_preferences (
  user_id uuid PRIMARY KEY REFERENCES account_users(id) ON DELETE CASCADE,
  auto_optimize_ats boolean NOT NULL DEFAULT true,
  include_cover_letters boolean NOT NULL DEFAULT true,
  notify_new_matches boolean NOT NULL DEFAULT true,
  notify_application_updates boolean NOT NULL DEFAULT true,
  notify_weekly_summary boolean NOT NULL DEFAULT true,
  notify_ai_insights boolean NOT NULL DEFAULT false,
  default_ai_provider ai_provider NOT NULL DEFAULT 'openai',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE ai_provider_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  provider ai_provider NOT NULL,
  encrypted_api_key bytea,
  key_hint text,
  is_connected boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  last_validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider)
);

CREATE TABLE job_search_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  query_text text NOT NULL,
  preferred_location_text text,
  remote_only boolean NOT NULL DEFAULT false,
  salary_min_k integer,
  salary_max_k integer,
  experience_levels seniority_level[] NOT NULL DEFAULT ARRAY[]::seniority_level[],
  enabled_sources job_source_kind[] NOT NULL DEFAULT ARRAY[]::job_source_kind[],
  status text NOT NULL DEFAULT 'completed',
  started_at timestamptz NOT NULL DEFAULT NOW(),
  finished_at timestamptz,
  result_count integer NOT NULL DEFAULT 0
);

CREATE TABLE saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  name text NOT NULL,
  query_text text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  website_url text,
  linkedin_url text,
  industry text,
  company_size_band text,
  founded_year integer,
  headquarters_location text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE job_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind job_source_kind NOT NULL,
  name text NOT NULL,
  base_url text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (kind, name)
);

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  source_id uuid REFERENCES job_sources(id) ON DELETE SET NULL,
  external_job_key text,
  canonical_url text,
  title text NOT NULL,
  location_text text,
  work_mode work_mode NOT NULL DEFAULT 'unknown',
  employment_type employment_type NOT NULL DEFAULT 'other',
  seniority seniority_level NOT NULL DEFAULT 'unknown',
  min_salary_usd integer,
  max_salary_usd integer,
  salary_currency char(3) NOT NULL DEFAULT 'USD',
  description text NOT NULL,
  requirements_text text,
  benefits_text text,
  posted_at date,
  imported_at timestamptz NOT NULL DEFAULT NOW(),
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT jobs_salary_range_valid CHECK (
    min_salary_usd IS NULL
    OR max_salary_usd IS NULL
    OR min_salary_usd <= max_salary_usd
  ),
  UNIQUE (source_id, external_job_key)
);

CREATE TABLE job_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  requirement_text text NOT NULL,
  display_order integer NOT NULL DEFAULT 0
);

CREATE TABLE tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  category text NOT NULL DEFAULT 'general',
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE job_tags (
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (job_id, tag_id)
);

CREATE TABLE user_job_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  stage job_stage NOT NULL DEFAULT 'new',
  is_saved boolean NOT NULL DEFAULT false,
  saved_at timestamptz,
  last_viewed_at timestamptz,
  hidden_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, job_id)
);

CREATE TABLE job_score_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  ai_provider ai_provider NOT NULL,
  score smallint NOT NULL,
  recommendation text NOT NULL,
  explanation text,
  strengths jsonb NOT NULL DEFAULT '[]'::jsonb,
  gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_name text,
  input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT score_between_0_and_100 CHECK (score BETWEEN 0 AND 100)
);

CREATE TABLE job_score_breakdowns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  score_run_id uuid NOT NULL REFERENCES job_score_runs(id) ON DELETE CASCADE,
  category text NOT NULL,
  score smallint NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  CONSTRAINT breakdown_score_between_0_and_100 CHECK (score BETWEEN 0 AND 100)
);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  kind document_kind NOT NULL,
  origin document_origin NOT NULL,
  resume_type resume_type,
  title text NOT NULL,
  storage_path text,
  mime_type text,
  content_text text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_from_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  latest_version_no integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT resume_type_for_resumes_only CHECK (
    (kind = 'resume' AND resume_type IS NOT NULL)
    OR (kind = 'cover_letter' AND resume_type IS NULL)
  )
);

ALTER TABLE user_profiles
ADD CONSTRAINT user_profiles_default_resume_fk
FOREIGN KEY (default_resume_id) REFERENCES documents(id) ON DELETE SET NULL;

CREATE TABLE document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  storage_path text,
  content_text text,
  change_summary text,
  created_by_run_id uuid,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, version_no)
);

CREATE TABLE applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status application_status NOT NULL DEFAULT 'draft',
  score_run_id uuid REFERENCES job_score_runs(id) ON DELETE SET NULL,
  resume_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  cover_letter_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  application_url text,
  source_snapshot text,
  applied_at timestamptz,
  last_status_changed_at timestamptz NOT NULL DEFAULT NOW(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, job_id)
);

CREATE TABLE application_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  from_status application_status,
  to_status application_status NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT NOW(),
  reason text,
  notes text
);

CREATE TABLE ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  provider ai_provider NOT NULL,
  kind ai_run_kind NOT NULL,
  model_name text,
  prompt_tokens integer,
  completion_tokens integer,
  credit_delta integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  reference_type text,
  reference_id uuid,
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

ALTER TABLE document_versions
ADD CONSTRAINT document_versions_created_by_run_fk
FOREIGN KEY (created_by_run_id) REFERENCES ai_runs(id) ON DELETE SET NULL;

CREATE TABLE activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  type activity_type NOT NULL,
  title text NOT NULL,
  description text,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  application_id uuid REFERENCES applications(id) ON DELETE SET NULL,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE VIEW analytics_jobs_per_week AS
SELECT
  ujs.user_id,
  date_trunc('week', j.imported_at)::date AS week_start,
  COUNT(*) AS jobs_found
FROM user_job_states ujs
JOIN jobs j ON j.id = ujs.job_id
GROUP BY ujs.user_id, date_trunc('week', j.imported_at)::date;

CREATE VIEW analytics_source_performance AS
SELECT
  ujs.user_id,
  COALESCE(js.name, 'Unknown') AS source_name,
  COUNT(*) AS jobs_found,
  ROUND(AVG(jsr.score)::numeric, 2) AS avg_match_score
FROM user_job_states ujs
JOIN jobs j ON j.id = ujs.job_id
LEFT JOIN job_sources js ON js.id = j.source_id
LEFT JOIN LATERAL (
  SELECT score
  FROM job_score_runs s
  WHERE s.user_id = ujs.user_id
    AND s.job_id = ujs.job_id
  ORDER BY s.created_at DESC
  LIMIT 1
) jsr ON true
GROUP BY ujs.user_id, COALESCE(js.name, 'Unknown');

CREATE VIEW analytics_application_funnel AS
SELECT user_id, 'Jobs Found'::text AS stage, COUNT(*)::bigint AS total
FROM user_job_states
GROUP BY user_id
UNION ALL
SELECT ujs.user_id, 'High Match', COUNT(*)::bigint AS total
FROM user_job_states ujs
WHERE EXISTS (
  SELECT 1
  FROM job_score_runs jsr
  WHERE jsr.user_id = ujs.user_id
    AND jsr.job_id = ujs.job_id
    AND jsr.score >= 70
)
GROUP BY ujs.user_id
UNION ALL
SELECT user_id, 'Applied', COUNT(*)::bigint AS total
FROM applications
WHERE status IN ('applied', 'interview', 'offer', 'accepted')
GROUP BY user_id
UNION ALL
SELECT user_id, 'Interview', COUNT(*)::bigint AS total
FROM applications
WHERE status IN ('interview', 'offer', 'accepted')
GROUP BY user_id
UNION ALL
SELECT user_id, 'Offer', COUNT(*)::bigint AS total
FROM applications
WHERE status IN ('offer', 'accepted')
GROUP BY user_id;

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX idx_user_credit_ledger_user_created ON user_credit_ledger(user_id, created_at DESC);
CREATE INDEX idx_user_skills_user_id ON user_skills(user_id);
CREATE UNIQUE INDEX idx_user_job_preferences_one_default
ON user_job_preferences(user_id)
WHERE is_default;
CREATE INDEX idx_job_search_runs_user_started ON job_search_runs(user_id, started_at DESC);
CREATE INDEX idx_saved_searches_user_id ON saved_searches(user_id);
CREATE INDEX idx_jobs_company_id ON jobs(company_id);
CREATE INDEX idx_jobs_source_id ON jobs(source_id);
CREATE INDEX idx_jobs_posted_at ON jobs(posted_at DESC);
CREATE INDEX idx_jobs_active_posted ON jobs(is_active, posted_at DESC);
CREATE INDEX idx_jobs_location_gin ON jobs USING gin (to_tsvector('english', COALESCE(location_text, '')));
CREATE INDEX idx_jobs_search_gin ON jobs USING gin (
  to_tsvector(
    'english',
    COALESCE(title, '') || ' ' || COALESCE(description, '') || ' ' || COALESCE(requirements_text, '')
  )
);
CREATE INDEX idx_job_requirements_job_id ON job_requirements(job_id, display_order);
CREATE INDEX idx_job_tags_tag_id ON job_tags(tag_id);
CREATE INDEX idx_user_job_states_user_stage ON user_job_states(user_id, stage);
CREATE INDEX idx_user_job_states_saved ON user_job_states(user_id, is_saved);
CREATE INDEX idx_job_score_runs_user_job_created ON job_score_runs(user_id, job_id, created_at DESC);
CREATE INDEX idx_documents_user_kind ON documents(user_id, kind, updated_at DESC);
CREATE INDEX idx_documents_job_id ON documents(job_id);
CREATE INDEX idx_document_versions_document_id ON document_versions(document_id, version_no DESC);
CREATE INDEX idx_applications_user_status ON applications(user_id, status);
CREATE INDEX idx_applications_job_id ON applications(job_id);
CREATE INDEX idx_application_status_history_application_id ON application_status_history(application_id, changed_at DESC);
CREATE INDEX idx_ai_runs_user_created ON ai_runs(user_id, created_at DESC);
CREATE INDEX idx_activity_events_user_created ON activity_events(user_id, created_at DESC);
CREATE UNIQUE INDEX idx_ai_provider_connections_one_default
ON ai_provider_connections(user_id)
WHERE is_default;

CREATE TRIGGER trg_account_users_updated_at
BEFORE UPDATE ON account_users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_user_subscriptions_updated_at
BEFORE UPDATE ON user_subscriptions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_user_profiles_updated_at
BEFORE UPDATE ON user_profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_user_job_preferences_updated_at
BEFORE UPDATE ON user_job_preferences
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_user_preferences_updated_at
BEFORE UPDATE ON user_preferences
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_ai_provider_connections_updated_at
BEFORE UPDATE ON ai_provider_connections
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_saved_searches_updated_at
BEFORE UPDATE ON saved_searches
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_companies_updated_at
BEFORE UPDATE ON companies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_jobs_updated_at
BEFORE UPDATE ON jobs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_user_job_states_updated_at
BEFORE UPDATE ON user_job_states
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_documents_updated_at
BEFORE UPDATE ON documents
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_applications_updated_at
BEFORE UPDATE ON applications
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
