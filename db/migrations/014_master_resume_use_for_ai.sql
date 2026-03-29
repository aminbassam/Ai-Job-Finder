ALTER TABLE master_resume_profiles
ADD COLUMN IF NOT EXISTS use_for_ai boolean NOT NULL DEFAULT true;

UPDATE master_resume_profiles
SET use_for_ai = true
WHERE use_for_ai IS DISTINCT FROM true;

CREATE INDEX IF NOT EXISTS idx_master_resume_profiles_ai_enabled
ON master_resume_profiles(master_resume_id, use_for_ai, is_active, updated_at DESC);
