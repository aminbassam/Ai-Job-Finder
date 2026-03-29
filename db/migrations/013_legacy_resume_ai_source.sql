ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS use_legacy_resume_preferences_for_ai boolean NOT NULL DEFAULT false;
