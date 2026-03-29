-- 008_job_match_ai_summary.sql
-- Adds AI-generated summary column to job_matches for displaying
-- the GPT-written job summary in the Results tab.

ALTER TABLE job_matches
  ADD COLUMN IF NOT EXISTS ai_summary text;
