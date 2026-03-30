import "./config/load-env";

import { readFileSync } from "fs";
import { join } from "path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { pool } from "./db/pool";

import authRouter        from "./routes/auth";
import jobsRouter        from "./routes/jobs";
import profileRouter     from "./routes/profile";
import applicationsRouter from "./routes/applications";
import activityRouter    from "./routes/activity";
import analyticsRouter   from "./routes/analytics";
import settingsRouter    from "./routes/settings";
import documentsRouter   from "./routes/documents";
import adminRouter       from "./routes/admin";
import agentRouter       from "./routes/agent";
import aiRouter          from "./routes/ai";
import gmailRouter       from "./routes/gmail";
import masterResumeRouter from "./routes/master-resume";
import { startScheduler } from "./services/scheduler";
import { ensureDemoUserAndSeedData } from "./services/demo-user";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3001", 10);

// ── Security headers ─────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:5678",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "12mb" }));

// ── Rate limiting on auth routes ─────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.AUTH_RATE_LIMIT ?? "20", 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again later." },
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/auth",         authLimiter, authRouter);
app.use("/api/jobs",         jobsRouter);
app.use("/api/profile",      profileRouter);
app.use("/api/applications", applicationsRouter);
app.use("/api/activity",     activityRouter);
app.use("/api/analytics",    analyticsRouter);
app.use("/api/settings",     settingsRouter);
app.use("/api/documents",    documentsRouter);
app.use("/api/admin",        adminRouter);
app.use("/api/agent",        agentRouter);
app.use("/api/ai",           aiRouter);
app.use("/api/gmail",        gmailRouter);
app.use("/api/master-resume", masterResumeRouter);

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ message: "Not found." });
});

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const isDev = (process.env.NODE_ENV ?? "development") !== "production";
  console.error("[unhandled error]", err.stack ?? err.message);
  res.status(500).json({
    message: isDev ? err.message : "Internal server error.",
    ...(isDev && { stack: err.stack }),
  });
});

// ── Start ────────────────────────────────────────────────────────────────────

/**
 * Split a SQL file into individual statements, correctly handling
 * dollar-quoted blocks (DO $$ ... $$) and standard semicolons.
 */
function splitSql(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inDollarQuote = false;
  let dollarTag = "";
  let i = 0;

  while (i < sql.length) {
    if (!inDollarQuote && sql.slice(i, i + 2) === "--") {
      i += 2;
      while (i < sql.length && sql[i] !== "\n") i++;
      continue;
    }
    if (!inDollarQuote && sql.slice(i, i + 2) === "/*") {
      i += 2;
      while (i < sql.length && sql.slice(i, i + 2) !== "*/") i++;
      i = Math.min(i + 2, sql.length);
      continue;
    }
    // Detect start/end of $$ or $tag$ dollar-quote blocks
    if (!inDollarQuote) {
      const tagMatch = sql.slice(i).match(/^(\$[^$]*\$)/);
      if (tagMatch) {
        inDollarQuote = true;
        dollarTag = tagMatch[1];
        current += tagMatch[1];
        i += tagMatch[1].length;
        continue;
      }
    } else {
      if (sql.slice(i).startsWith(dollarTag)) {
        current += dollarTag;
        i += dollarTag.length;
        inDollarQuote = false;
        dollarTag = "";
        continue;
      }
    }

    const ch = sql[i];
    if (!inDollarQuote && ch === ";") {
      const stmt = current.trim();
      if (stmt) statements.push(stmt);
      current = "";
    } else {
      current += ch;
    }
    i++;
  }
  const last = current.trim();
  if (last) statements.push(last);
  return statements;
}

async function applyMigrations() {
  const ROOT = join(__dirname, "../../");
  const baseSchema = { name: "schema", file: join(ROOT, "db/postgres_schema.sql") };
  const migrations = [
    { name: "001_email_verification",     file: join(ROOT, "db/migrations/001_email_verification.sql") },
    { name: "002_admin_role",             file: join(ROOT, "db/migrations/002_admin_role.sql") },
    { name: "003_resume_preferences",     file: join(ROOT, "db/migrations/003_resume_preferences.sql") },
    { name: "004_ai_provider_fields",     file: join(ROOT, "db/migrations/004_ai_provider_fields.sql") },
    { name: "005_job_agent",              file: join(ROOT, "db/migrations/005_job_agent.sql") },
    { name: "006_agent_profile_filters",  file: join(ROOT, "db/migrations/006_agent_profile_filters.sql") },
    { name: "007_fix_ai_provider_columns", file: join(ROOT, "db/migrations/007_fix_ai_provider_columns.sql") },
    { name: "008_job_match_ai_summary",    file: join(ROOT, "db/migrations/008_job_match_ai_summary.sql") },
    { name: "009_global_ai_settings",      file: join(ROOT, "db/migrations/009_global_ai_settings.sql") },
    { name: "010_resume_rich_formatting",  file: join(ROOT, "db/migrations/010_resume_rich_formatting.sql") },
    { name: "011_multi_profile_master_resume", file: join(ROOT, "db/migrations/011_multi_profile_master_resume.sql") },
    { name: "012_master_resume_profile_status", file: join(ROOT, "db/migrations/012_master_resume_profile_status.sql") },
    { name: "013_legacy_resume_ai_source", file: join(ROOT, "db/migrations/013_legacy_resume_ai_source.sql") },
    { name: "014_master_resume_use_for_ai", file: join(ROOT, "db/migrations/014_master_resume_use_for_ai.sql") },
    { name: "015_master_resume_education", file: join(ROOT, "db/migrations/015_master_resume_education.sql") },
    { name: "016_gmail_linkedin_ingestion", file: join(ROOT, "db/migrations/016_gmail_linkedin_ingestion.sql") },
    { name: "017_profile_activity_logs", file: join(ROOT, "db/migrations/017_profile_activity_logs.sql") },
    { name: "018_account_usernames", file: join(ROOT, "db/migrations/018_account_usernames.sql") },
    { name: "019_demo_users", file: join(ROOT, "db/migrations/019_demo_users.sql") },
  ];
  const client = await pool.connect();
  try {
    const {
      rows: [schemaState],
    } = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'account_users'
       ) AS exists`
    );

    if (!schemaState?.exists) {
      console.log("[db] Applying base schema ...");
      const sql = readFileSync(baseSchema.file, "utf8");
      const statements = splitSql(sql);
      for (const stmt of statements) {
        await client.query(stmt);
      }
      console.log("[db] Base schema applied.");
    } else {
      console.log("[db] Base schema already present.");
    }

    for (const migration of migrations) {
      const sql = readFileSync(migration.file, "utf8");
      const statements = splitSql(sql);
      let skipped = 0;
      let applied = 0;

      for (const stmt of statements) {
        try {
          await client.query(stmt);
          applied++;
        } catch (err) {
          const message = (err as Error).message;
          const isAlreadyApplied =
            /must be owner of table/i.test(message) ||
            /must be owner of relation/i.test(message) ||
            /already exists/i.test(message);

          if (isAlreadyApplied) {
            skipped++;
            continue;
          }
          console.error(`[db] Migration ${migration.name} FAILED on statement:\n${stmt}\nError: ${message}`);
          throw err;
        }
      }

      if (applied > 0) {
        console.log(`[db] Migration applied: ${migration.name} (${applied} stmt${applied !== 1 ? "s" : ""}, ${skipped} skipped)`);
      } else {
        console.log(`[db] Migration already up to date: ${migration.name}`);
      }
    }
    console.log("[db] All migrations up to date.");
  } catch (err) {
    console.error("[db] Migration error:", (err as Error).message);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Directly ensures critical columns exist — runs after migrations as a
 * safety net in case the migration file runner skips a file.
 * Each ALTER is executed separately so one failure cannot block others.
 */
async function ensureCriticalColumns() {
  const critical = [
    `ALTER TABLE ai_provider_connections ADD COLUMN IF NOT EXISTS connection_status text NOT NULL DEFAULT 'disconnected'`,
    `ALTER TABLE ai_provider_connections ADD COLUMN IF NOT EXISTS encrypted_key     text`,
    `ALTER TABLE ai_provider_connections ADD COLUMN IF NOT EXISTS encryption_iv     text`,
    `ALTER TABLE ai_provider_connections ADD COLUMN IF NOT EXISTS encryption_tag    text`,
    `ALTER TABLE ai_provider_connections ADD COLUMN IF NOT EXISTS selected_model    text`,
    `ALTER TABLE ai_provider_connections ADD COLUMN IF NOT EXISTS last_error        text`,
    `ALTER TABLE search_profiles ADD COLUMN IF NOT EXISTS job_types                text[]  NOT NULL DEFAULT '{}'`,
    `ALTER TABLE search_profiles ADD COLUMN IF NOT EXISTS posted_within_days       integer`,
    `ALTER TABLE search_profiles ADD COLUMN IF NOT EXISTS schedule_interval_minutes integer`,
    `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS ai_tone text NOT NULL DEFAULT 'impact-driven'`,
    `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS resume_style text NOT NULL DEFAULT 'balanced'`,
    `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS bullet_style text NOT NULL DEFAULT 'metrics-heavy'`,
    `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS ats_level text NOT NULL DEFAULT 'balanced'`,
    `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS cover_letter_tone text NOT NULL DEFAULT 'confident'`,
    `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS cover_letter_length text NOT NULL DEFAULT 'medium'`,
    `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS cover_letter_personalization text NOT NULL DEFAULT 'medium'`,
    `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS no_fake_experience boolean NOT NULL DEFAULT true`,
    `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS no_change_titles boolean NOT NULL DEFAULT true`,
    `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS no_exaggerate_metrics boolean NOT NULL DEFAULT true`,
    `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS only_rephrase boolean NOT NULL DEFAULT true`,
    `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS ai_custom_roles text[] NOT NULL DEFAULT '{}'`,
    `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS ai_default_instructions text`,
    `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS resume_title_font text NOT NULL DEFAULT 'Playfair Display'`,
    `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS resume_body_font text NOT NULL DEFAULT 'Source Sans 3'`,
    `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS resume_accent_color text NOT NULL DEFAULT '#2563EB'`,
    `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS resume_template text NOT NULL DEFAULT 'modern'`,
    `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS resume_density text NOT NULL DEFAULT 'balanced'`,
    `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS use_legacy_resume_preferences_for_ai boolean NOT NULL DEFAULT false`,
    `ALTER TABLE account_users ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false`,
    `ALTER TABLE documents ADD COLUMN IF NOT EXISTS content_html text`,
    `ALTER TABLE document_versions ADD COLUMN IF NOT EXISTS content_html text`,
    `ALTER TABLE master_resume_profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true`,
    `ALTER TABLE master_resume_profiles ADD COLUMN IF NOT EXISTS use_for_ai boolean NOT NULL DEFAULT true`,
    `ALTER TABLE gmail_accounts ADD COLUMN IF NOT EXISTS email text`,
    `ALTER TABLE gmail_accounts ADD COLUMN IF NOT EXISTS encrypted_access_token text`,
    `ALTER TABLE gmail_accounts ADD COLUMN IF NOT EXISTS access_token_iv text`,
    `ALTER TABLE gmail_accounts ADD COLUMN IF NOT EXISTS access_token_tag text`,
    `ALTER TABLE gmail_accounts ADD COLUMN IF NOT EXISTS encrypted_refresh_token text`,
    `ALTER TABLE gmail_accounts ADD COLUMN IF NOT EXISTS refresh_token_iv text`,
    `ALTER TABLE gmail_accounts ADD COLUMN IF NOT EXISTS refresh_token_tag text`,
    `ALTER TABLE gmail_accounts ADD COLUMN IF NOT EXISTS token_expires_at timestamptz`,
    `ALTER TABLE gmail_accounts ADD COLUMN IF NOT EXISTS last_sync_at timestamptz`,
    `ALTER TABLE gmail_accounts ADD COLUMN IF NOT EXISTS last_error text`,
  ];
  const client = await pool.connect();
  try {
    for (const stmt of critical) {
      await client.query(stmt).catch((err: Error) => {
        // "already exists" is fine; anything else is worth logging but not fatal
        if (!/already exists/i.test(err.message)) {
          console.warn(`[db] ensureCriticalColumns warning: ${err.message}`);
        }
      });
    }
    console.log("[db] Critical columns verified.");
  } finally {
    client.release();
  }
}

/**
 * Creates the master resume tables if the migration path was skipped or the
 * local database was initialized from an older schema snapshot.
 */
async function ensureMasterResumeTables() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS master_resumes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL UNIQUE REFERENCES account_users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS master_resume_imports (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
      source_type text NOT NULL CHECK (source_type IN ('linkedin', 'upload')),
      source_url text,
      file_name text,
      raw_text text NOT NULL,
      parsed_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS master_resume_profiles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      master_resume_id uuid NOT NULL REFERENCES master_resumes(id) ON DELETE CASCADE,
      source_import_id uuid REFERENCES master_resume_imports(id) ON DELETE SET NULL,
      name text NOT NULL,
      target_roles text[] NOT NULL DEFAULT '{}'::text[],
      summary text,
      experience_years integer NOT NULL DEFAULT 0,
      is_active boolean NOT NULL DEFAULT true,
      use_for_ai boolean NOT NULL DEFAULT true,
      is_default boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS master_resume_experiences (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      profile_id uuid NOT NULL REFERENCES master_resume_profiles(id) ON DELETE CASCADE,
      title text NOT NULL,
      company text NOT NULL,
      start_date date,
      end_date date,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS master_resume_bullets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      experience_id uuid NOT NULL REFERENCES master_resume_experiences(id) ON DELETE CASCADE,
      action text,
      method text,
      result text,
      metric text,
      tools text[] NOT NULL DEFAULT '{}'::text[],
      keywords text[] NOT NULL DEFAULT '{}'::text[],
      original_text text,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS master_resume_skills (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      profile_id uuid NOT NULL UNIQUE REFERENCES master_resume_profiles(id) ON DELETE CASCADE,
      core text[] NOT NULL DEFAULT '{}'::text[],
      tools text[] NOT NULL DEFAULT '{}'::text[],
      soft text[] NOT NULL DEFAULT '{}'::text[],
      certifications text[] NOT NULL DEFAULT '{}'::text[],
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS master_resume_projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      profile_id uuid NOT NULL REFERENCES master_resume_profiles(id) ON DELETE CASCADE,
      name text NOT NULL,
      role text,
      description text,
      tools text[] NOT NULL DEFAULT '{}'::text[],
      team_size integer,
      outcome text,
      metrics text,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS master_resume_education (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      profile_id uuid NOT NULL REFERENCES master_resume_profiles(id) ON DELETE CASCADE,
      school text NOT NULL,
      degree text,
      field_of_study text,
      start_date date,
      end_date date,
      notes text,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS master_resume_leadership (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      profile_id uuid NOT NULL UNIQUE REFERENCES master_resume_profiles(id) ON DELETE CASCADE,
      team_size integer,
      scope text,
      stakeholders text[] NOT NULL DEFAULT '{}'::text[],
      budget text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_master_resume_profiles_one_default
     ON master_resume_profiles(master_resume_id)
     WHERE is_default`,
    `CREATE INDEX IF NOT EXISTS idx_master_resume_profiles_master_resume
     ON master_resume_profiles(master_resume_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_master_resume_profiles_active
     ON master_resume_profiles(master_resume_id, is_active, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_master_resume_profiles_ai_enabled
     ON master_resume_profiles(master_resume_id, use_for_ai, is_active, updated_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_master_resume_imports_user_created
     ON master_resume_imports(user_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_master_resume_experiences_profile
     ON master_resume_experiences(profile_id, sort_order, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_master_resume_projects_profile
     ON master_resume_projects(profile_id, sort_order, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_master_resume_education_profile
     ON master_resume_education(profile_id, sort_order, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_master_resume_bullets_experience
     ON master_resume_bullets(experience_id, sort_order, created_at)`,
    `DO $$
     BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_master_resumes_updated_at') THEN
         CREATE TRIGGER trg_master_resumes_updated_at
         BEFORE UPDATE ON master_resumes
         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
       END IF;
     END $$`,
    `DO $$
     BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_master_resume_profiles_updated_at') THEN
         CREATE TRIGGER trg_master_resume_profiles_updated_at
         BEFORE UPDATE ON master_resume_profiles
         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
       END IF;
     END $$`,
    `DO $$
     BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_master_resume_experiences_updated_at') THEN
         CREATE TRIGGER trg_master_resume_experiences_updated_at
         BEFORE UPDATE ON master_resume_experiences
         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
       END IF;
     END $$`,
    `DO $$
     BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_master_resume_bullets_updated_at') THEN
         CREATE TRIGGER trg_master_resume_bullets_updated_at
         BEFORE UPDATE ON master_resume_bullets
         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
       END IF;
     END $$`,
    `DO $$
     BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_master_resume_skills_updated_at') THEN
         CREATE TRIGGER trg_master_resume_skills_updated_at
         BEFORE UPDATE ON master_resume_skills
         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
       END IF;
     END $$`,
    `DO $$
     BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_master_resume_projects_updated_at') THEN
         CREATE TRIGGER trg_master_resume_projects_updated_at
         BEFORE UPDATE ON master_resume_projects
         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
       END IF;
     END $$`,
    `DO $$
     BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_master_resume_education_updated_at') THEN
         CREATE TRIGGER trg_master_resume_education_updated_at
         BEFORE UPDATE ON master_resume_education
         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
       END IF;
     END $$`,
    `DO $$
     BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_master_resume_leadership_updated_at') THEN
         CREATE TRIGGER trg_master_resume_leadership_updated_at
         BEFORE UPDATE ON master_resume_leadership
         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
       END IF;
     END $$`,
  ];

  const client = await pool.connect();
  try {
    for (const stmt of statements) {
      await client.query(stmt).catch((err: Error) => {
        if (!/already exists/i.test(err.message)) {
          console.warn(`[db] ensureMasterResumeTables warning: ${err.message}`);
        }
      });
    }
    console.log("[db] Master resume tables verified.");
  } finally {
    client.release();
  }
}

async function ensureGmailTables() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS gmail_accounts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL UNIQUE REFERENCES account_users(id) ON DELETE CASCADE,
      email text NOT NULL DEFAULT '',
      encrypted_access_token text NOT NULL DEFAULT '',
      access_token_iv text NOT NULL DEFAULT '',
      access_token_tag text NOT NULL DEFAULT '',
      encrypted_refresh_token text NOT NULL DEFAULT '',
      refresh_token_iv text NOT NULL DEFAULT '',
      refresh_token_tag text NOT NULL DEFAULT '',
      token_expires_at timestamptz,
      last_sync_at timestamptz,
      last_error text,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS gmail_synced_messages (
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
    )`,
    `CREATE INDEX IF NOT EXISTS idx_gmail_accounts_user ON gmail_accounts(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_gmail_synced_messages_account
     ON gmail_synced_messages(gmail_account_id, created_at DESC)`,
    `DO $$
     BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gmail_accounts_updated_at') THEN
         CREATE TRIGGER trg_gmail_accounts_updated_at
         BEFORE UPDATE ON gmail_accounts
         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
       END IF;
     END $$`,
  ];

  const client = await pool.connect();
  try {
    for (const stmt of statements) {
      await client.query(stmt).catch((err: Error) => {
        if (!/already exists/i.test(err.message)) {
          console.warn(`[db] ensureGmailTables warning: ${err.message}`);
        }
      });
    }
    console.log("[db] Gmail ingestion tables verified.");
  } finally {
    client.release();
  }
}

// ── Startup env validation ───────────────────────────────────────────────────
function validateEnv() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    console.error("[startup] FATAL: ENCRYPTION_KEY is not set. AI provider keys cannot be stored.");
    console.error("[startup] Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
    process.exit(1);
  }
  const buf = Buffer.from(key, "hex");
  if (buf.length !== 32) {
    console.error(`[startup] FATAL: ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). Got ${key.length} chars / ${buf.length} bytes.`);
    process.exit(1);
  }
  if (!process.env.JWT_SECRET) {
    console.warn("[startup] WARNING: JWT_SECRET is not set. Using an insecure default. Set it in backend/.env.");
  }
}

applyMigrations()
  .then(() => ensureMasterResumeTables())
  .then(() => ensureGmailTables())
  .then(() => ensureCriticalColumns())
  .then(() => ensureDemoUserAndSeedData())
  .then(() => {
    validateEnv();
    app.listen(PORT, () => {
      console.log(`JobFlow API running on http://localhost:${PORT}`);
      console.log(`  Environment : ${process.env.NODE_ENV ?? "development"}`);
      console.log(`  CORS origin : ${process.env.CORS_ORIGIN ?? "http://localhost:5678"}`);
    });
    startScheduler();
  });

export default app;
