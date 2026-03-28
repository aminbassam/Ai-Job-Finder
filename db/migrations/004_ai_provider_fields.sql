-- Migration 004: missing profile columns + AI provider encryption/model/status

-- Ensure current_job_title and linkedin_url exist on account_users
-- (these may be absent in databases created before the full schema was applied)
ALTER TABLE account_users
  ADD COLUMN IF NOT EXISTS current_job_title text,
  ADD COLUMN IF NOT EXISTS linkedin_url      text;

-- Add encryption fields + model selection + status tracking to ai_provider_connections
ALTER TABLE ai_provider_connections
  ADD COLUMN IF NOT EXISTS encrypted_key    text,
  ADD COLUMN IF NOT EXISTS encryption_iv    text,
  ADD COLUMN IF NOT EXISTS encryption_tag   text,
  ADD COLUMN IF NOT EXISTS selected_model   text,
  ADD COLUMN IF NOT EXISTS connection_status text NOT NULL DEFAULT 'disconnected',
  ADD COLUMN IF NOT EXISTS last_error        text;

-- Add CHECK constraint for connection_status (safe if already exists via DO $$)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_provider_connections_status_check'
  ) THEN
    ALTER TABLE ai_provider_connections
      ADD CONSTRAINT ai_provider_connections_status_check
      CHECK (connection_status IN ('disconnected','validating','connected','error'));
  END IF;
END $$;
