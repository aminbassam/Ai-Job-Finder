import dotenv from "dotenv";
dotenv.config();

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
import masterResumeRouter from "./routes/master-resume";
import { startScheduler } from "./services/scheduler";

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
app.use("/api/master-resume", masterResumeRouter);

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
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
  ];
  const client = await pool.connect();
  try {
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
    `ALTER TABLE documents ADD COLUMN IF NOT EXISTS content_html text`,
    `ALTER TABLE document_versions ADD COLUMN IF NOT EXISTS content_html text`,
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
  .then(() => ensureCriticalColumns())
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
