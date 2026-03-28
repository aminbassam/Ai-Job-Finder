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
app.use(express.json({ limit: "2mb" }));

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

applyMigrations().then(() => {
  validateEnv();
  app.listen(PORT, () => {
    console.log(`JobFlow API running on http://localhost:${PORT}`);
    console.log(`  Environment : ${process.env.NODE_ENV ?? "development"}`);
    console.log(`  CORS origin : ${process.env.CORS_ORIGIN ?? "http://localhost:5678"}`);
  });
  startScheduler();
});

export default app;
