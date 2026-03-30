-- Migration 020: Add custom sections to master resume profiles
-- Replaces the old "Project Highlights & Leadership" card with user-named sections

CREATE TABLE IF NOT EXISTS master_resume_custom_sections (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID        NOT NULL REFERENCES master_resume_profiles(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  sort_order  INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_sections_profile_id
  ON master_resume_custom_sections (profile_id, sort_order);
