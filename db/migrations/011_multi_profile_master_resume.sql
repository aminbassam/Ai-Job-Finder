CREATE TABLE IF NOT EXISTS master_resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES account_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS master_resume_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('linkedin', 'upload')),
  source_url text,
  file_name text,
  raw_text text NOT NULL,
  parsed_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS master_resume_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_resume_id uuid NOT NULL REFERENCES master_resumes(id) ON DELETE CASCADE,
  source_import_id uuid REFERENCES master_resume_imports(id) ON DELETE SET NULL,
  name text NOT NULL,
  target_roles text[] NOT NULL DEFAULT '{}'::text[],
  summary text,
  experience_years integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS master_resume_experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES master_resume_profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  company text NOT NULL,
  start_date date,
  end_date date,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS master_resume_bullets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id uuid NOT NULL REFERENCES master_resume_experiences(id) ON DELETE CASCADE,
  action text,
  method text,
  result text,
  metric text,
  tools text[] NOT NULL DEFAULT '{}'::text[],
  keywords text[] NOT NULL DEFAULT '{}'::text[],
  original_text text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS master_resume_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES master_resume_profiles(id) ON DELETE CASCADE,
  core text[] NOT NULL DEFAULT '{}'::text[],
  tools text[] NOT NULL DEFAULT '{}'::text[],
  soft text[] NOT NULL DEFAULT '{}'::text[],
  certifications text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS master_resume_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES master_resume_profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text,
  description text,
  tools text[] NOT NULL DEFAULT '{}'::text[],
  team_size integer,
  outcome text,
  metrics text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS master_resume_leadership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES master_resume_profiles(id) ON DELETE CASCADE,
  team_size integer,
  scope text,
  stakeholders text[] NOT NULL DEFAULT '{}'::text[],
  budget text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_master_resume_profiles_one_default
ON master_resume_profiles(master_resume_id)
WHERE is_default;

CREATE INDEX IF NOT EXISTS idx_master_resume_profiles_master_resume
ON master_resume_profiles(master_resume_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_master_resume_profiles_active
ON master_resume_profiles(master_resume_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_master_resume_imports_user_created
ON master_resume_imports(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_master_resume_experiences_profile
ON master_resume_experiences(profile_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS idx_master_resume_projects_profile
ON master_resume_projects(profile_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS idx_master_resume_bullets_experience
ON master_resume_bullets(experience_id, sort_order, created_at);

CREATE TRIGGER trg_master_resumes_updated_at
BEFORE UPDATE ON master_resumes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_master_resume_profiles_updated_at
BEFORE UPDATE ON master_resume_profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_master_resume_experiences_updated_at
BEFORE UPDATE ON master_resume_experiences
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_master_resume_bullets_updated_at
BEFORE UPDATE ON master_resume_bullets
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_master_resume_skills_updated_at
BEFORE UPDATE ON master_resume_skills
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_master_resume_projects_updated_at
BEFORE UPDATE ON master_resume_projects
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_master_resume_leadership_updated_at
BEFORE UPDATE ON master_resume_leadership
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
