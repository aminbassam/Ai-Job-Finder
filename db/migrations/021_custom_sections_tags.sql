-- Migration 021: Add tools and keywords arrays to custom sections
ALTER TABLE master_resume_custom_sections
  ADD COLUMN IF NOT EXISTS tools    TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS keywords TEXT[] NOT NULL DEFAULT '{}';
