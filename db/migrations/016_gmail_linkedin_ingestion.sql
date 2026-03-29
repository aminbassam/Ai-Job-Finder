CREATE TABLE IF NOT EXISTS gmail_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES account_users(id) ON DELETE CASCADE,
  email text NOT NULL,
  encrypted_access_token text NOT NULL,
  access_token_iv text NOT NULL,
  access_token_tag text NOT NULL,
  encrypted_refresh_token text NOT NULL,
  refresh_token_iv text NOT NULL,
  refresh_token_tag text NOT NULL,
  token_expires_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gmail_synced_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_account_id uuid NOT NULL REFERENCES gmail_accounts(id) ON DELETE CASCADE,
  gmail_message_id text NOT NULL,
  gmail_thread_id text,
  subject text,
  sender text,
  received_at timestamptz,
  status text NOT NULL DEFAULT 'imported',
  imported_job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  parsed_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (gmail_account_id, gmail_message_id)
);

CREATE INDEX IF NOT EXISTS idx_gmail_accounts_user ON gmail_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_gmail_synced_messages_account ON gmail_synced_messages(gmail_account_id, created_at DESC);
