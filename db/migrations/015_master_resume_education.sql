CREATE TABLE IF NOT EXISTS master_resume_education (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES master_resume_profiles(id) ON DELETE CASCADE,
  school text NOT NULL,
  degree text,
  field_of_study text,
  start_date date,
  end_date date,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_master_resume_education_profile
ON master_resume_education(profile_id, sort_order, created_at);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_master_resume_education_updated_at') THEN
    CREATE TRIGGER trg_master_resume_education_updated_at
    BEFORE UPDATE ON master_resume_education
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
