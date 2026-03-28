-- Migration 002: admin role flag
ALTER TABLE account_users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_account_users_is_admin
  ON account_users(is_admin) WHERE is_admin = true;
