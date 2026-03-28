-- 006_agent_profile_filters.sql
-- Adds richer Job Agent profile filters and scheduling options.

ALTER TABLE search_profiles
  ADD COLUMN IF NOT EXISTS job_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS posted_within_days integer,
  ADD COLUMN IF NOT EXISTS schedule_interval_minutes integer;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'search_profiles_schedule_check'
  ) THEN
    ALTER TABLE search_profiles DROP CONSTRAINT search_profiles_schedule_check;
  END IF;

  ALTER TABLE search_profiles
    ADD CONSTRAINT search_profiles_schedule_check
    CHECK (schedule IN ('6h', 'daily', 'weekdays', 'custom', 'manual'));
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'search_profiles_posted_within_days_check'
  ) THEN
    ALTER TABLE search_profiles
      ADD CONSTRAINT search_profiles_posted_within_days_check
      CHECK (posted_within_days IS NULL OR posted_within_days > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'search_profiles_schedule_interval_minutes_check'
  ) THEN
    ALTER TABLE search_profiles
      ADD CONSTRAINT search_profiles_schedule_interval_minutes_check
      CHECK (
        schedule_interval_minutes IS NULL
        OR schedule_interval_minutes BETWEEN 15 AND 10080
      );
  END IF;
END $$;
