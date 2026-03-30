ALTER TABLE account_users
  ADD COLUMN IF NOT EXISTS username citext;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'username_format_valid'
  ) THEN
    ALTER TABLE account_users
      ADD CONSTRAINT username_format_valid CHECK (
        username IS NULL
        OR username ~ '^[A-Za-z0-9](?:[A-Za-z0-9._-]{1,30}[A-Za-z0-9])?$'
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS account_users_username_unique_idx
  ON account_users (username)
  WHERE username IS NOT NULL;
