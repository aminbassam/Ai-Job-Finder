ALTER TABLE account_users
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
