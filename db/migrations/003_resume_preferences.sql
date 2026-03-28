-- Migration 003: resume_preferences table
-- Stores extended AI resume configuration per user

CREATE TABLE IF NOT EXISTS resume_preferences (
  user_id uuid PRIMARY KEY REFERENCES account_users(id) ON DELETE CASCADE,

  -- Experience details
  key_achievements         text,
  certifications           text,
  tools_technologies       text[]      NOT NULL DEFAULT '{}',
  soft_skills              text[]      NOT NULL DEFAULT '{}',

  -- Target strategy
  target_roles             text[]      NOT NULL DEFAULT '{}',
  seniority_level          text        DEFAULT 'mid'
    CHECK (seniority_level IN ('junior','mid','senior','lead','executive')),
  industry_focus           text[]      NOT NULL DEFAULT '{}',
  must_have_keywords       text[]      NOT NULL DEFAULT '{}',

  -- AI behaviour
  ai_tone                  text        NOT NULL DEFAULT 'impact-driven'
    CHECK (ai_tone IN ('concise','impact-driven','technical')),
  resume_style             text        NOT NULL DEFAULT 'balanced'
    CHECK (resume_style IN ('ats-safe','balanced','human-friendly')),
  bullet_style             text        NOT NULL DEFAULT 'metrics-heavy'
    CHECK (bullet_style IN ('metrics-heavy','responsibility-focused')),

  -- ATS & cover letter
  ats_level                text        NOT NULL DEFAULT 'balanced'
    CHECK (ats_level IN ('basic','balanced','aggressive')),
  include_cover_letters    boolean     NOT NULL DEFAULT true,
  cover_letter_tone        text        NOT NULL DEFAULT 'confident'
    CHECK (cover_letter_tone IN ('formal','friendly','confident')),
  cover_letter_length      text        NOT NULL DEFAULT 'medium'
    CHECK (cover_letter_length IN ('short','medium','detailed')),
  cover_letter_personalization text    NOT NULL DEFAULT 'medium'
    CHECK (cover_letter_personalization IN ('low','medium','high')),

  -- AI safety guardrails
  no_fake_experience       boolean     NOT NULL DEFAULT true,
  no_change_titles         boolean     NOT NULL DEFAULT true,
  no_exaggerate_metrics    boolean     NOT NULL DEFAULT true,
  only_rephrase            boolean     NOT NULL DEFAULT true,

  updated_at               timestamptz NOT NULL DEFAULT NOW()
);
