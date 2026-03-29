-- Profile activity log — records all actions on a search profile.
-- Actions: created, updated, paused, resumed, deleted,
--          run_started, run_completed, run_failed, run_cancelled
CREATE TABLE IF NOT EXISTS profile_activity_logs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  profile_id     uuid        REFERENCES search_profiles(id) ON DELETE SET NULL,
  profile_name   text        NOT NULL DEFAULT '',
  action         text        NOT NULL,
  detail         jsonb       NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pal_profile_id
  ON profile_activity_logs (profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pal_user_id
  ON profile_activity_logs (user_id, created_at DESC);
