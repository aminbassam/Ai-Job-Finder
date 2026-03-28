-- Migration 001: email verification tokens
-- Run once: psql $DATABASE_URL -f db/migrations/001_email_verification.sql

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  code_hash   text NOT NULL,          -- SHA-256 of the 6-digit OTP
  attempts    smallint NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id
  ON email_verification_tokens(user_id, created_at DESC);
