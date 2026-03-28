-- 007_fix_ai_provider_columns.sql
-- Re-applies the ai_provider_connections columns from migration 004 that may
-- have silently failed due to multi-statement query execution issues.
-- All statements use IF NOT EXISTS so this is safe to run multiple times.

ALTER TABLE ai_provider_connections
  ADD COLUMN IF NOT EXISTS encrypted_key     text;

ALTER TABLE ai_provider_connections
  ADD COLUMN IF NOT EXISTS encryption_iv     text;

ALTER TABLE ai_provider_connections
  ADD COLUMN IF NOT EXISTS encryption_tag    text;

ALTER TABLE ai_provider_connections
  ADD COLUMN IF NOT EXISTS selected_model    text;

ALTER TABLE ai_provider_connections
  ADD COLUMN IF NOT EXISTS connection_status text NOT NULL DEFAULT 'disconnected';

ALTER TABLE ai_provider_connections
  ADD COLUMN IF NOT EXISTS last_error        text;
