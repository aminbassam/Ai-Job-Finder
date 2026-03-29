ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS resume_title_font text NOT NULL DEFAULT 'Playfair Display',
  ADD COLUMN IF NOT EXISTS resume_body_font text NOT NULL DEFAULT 'Source Sans 3',
  ADD COLUMN IF NOT EXISTS resume_accent_color text NOT NULL DEFAULT '#2563EB',
  ADD COLUMN IF NOT EXISTS resume_template text NOT NULL DEFAULT 'modern',
  ADD COLUMN IF NOT EXISTS resume_density text NOT NULL DEFAULT 'balanced';

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS content_html text;

ALTER TABLE document_versions
  ADD COLUMN IF NOT EXISTS content_html text;
