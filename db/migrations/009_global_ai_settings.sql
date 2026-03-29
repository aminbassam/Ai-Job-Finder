-- 009_global_ai_settings.sql
-- Moves shared AI behavior and guardrails into user_preferences so all AI
-- features can follow the same default instructions.

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS ai_tone text NOT NULL DEFAULT 'impact-driven',
  ADD COLUMN IF NOT EXISTS resume_style text NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS bullet_style text NOT NULL DEFAULT 'metrics-heavy',
  ADD COLUMN IF NOT EXISTS ats_level text NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS cover_letter_tone text NOT NULL DEFAULT 'confident',
  ADD COLUMN IF NOT EXISTS cover_letter_length text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS cover_letter_personalization text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS no_fake_experience boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS no_change_titles boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS no_exaggerate_metrics boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS only_rephrase boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_custom_roles text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_default_instructions text;

INSERT INTO user_preferences (user_id)
SELECT user_id
FROM resume_preferences
ON CONFLICT (user_id) DO NOTHING;

UPDATE user_preferences up
SET
  ai_tone = COALESCE(rp.ai_tone, up.ai_tone),
  resume_style = COALESCE(rp.resume_style, up.resume_style),
  bullet_style = COALESCE(rp.bullet_style, up.bullet_style),
  ats_level = COALESCE(rp.ats_level, up.ats_level),
  include_cover_letters = COALESCE(rp.include_cover_letters, up.include_cover_letters),
  cover_letter_tone = COALESCE(rp.cover_letter_tone, up.cover_letter_tone),
  cover_letter_length = COALESCE(rp.cover_letter_length, up.cover_letter_length),
  cover_letter_personalization = COALESCE(rp.cover_letter_personalization, up.cover_letter_personalization),
  no_fake_experience = COALESCE(rp.no_fake_experience, up.no_fake_experience),
  no_change_titles = COALESCE(rp.no_change_titles, up.no_change_titles),
  no_exaggerate_metrics = COALESCE(rp.no_exaggerate_metrics, up.no_exaggerate_metrics),
  only_rephrase = COALESCE(rp.only_rephrase, up.only_rephrase),
  updated_at = NOW()
FROM resume_preferences rp
WHERE rp.user_id = up.user_id;
