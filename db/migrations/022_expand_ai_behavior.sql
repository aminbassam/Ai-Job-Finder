ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS mirror_job_keywords boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS prioritize_recent_experience boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS keep_bullets_concise boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS avoid_first_person boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS emphasize_leadership boolean NOT NULL DEFAULT false;
