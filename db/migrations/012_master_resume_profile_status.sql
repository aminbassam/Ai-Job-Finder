ALTER TABLE master_resume_profiles
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_master_resume_profiles_active
ON master_resume_profiles(master_resume_id, is_active, created_at DESC);
