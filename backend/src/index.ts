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

async function applyMigrations() {
  const ROOT = join(__dirname, "../../");
  const migrations = [
    { name: "001_email_verification", file: join(ROOT, "db/migrations/001_email_verification.sql") },
    { name: "002_admin_role",         file: join(ROOT, "db/migrations/002_admin_role.sql") },
    { name: "003_resume_preferences", file: join(ROOT, "db/migrations/003_resume_preferences.sql") },
    { name: "004_ai_provider_fields", file: join(ROOT, "db/migrations/004_ai_provider_fields.sql") },
    { name: "005_job_agent",          file: join(ROOT, "db/migrations/005_job_agent.sql") },
    { name: "006_agent_profile_filters", file: join(ROOT, "db/migrations/006_agent_profile_filters.sql") },
  ];
  const client = await pool.connect();
  try {
    for (const migration of migrations) {
      try {
        const sql = readFileSync(migration.file, "utf8");
        await client.query(sql);
      } catch (err) {
        const message = (err as Error).message;
        const isOwnershipRerunIssue =
          /must be owner of table/i.test(message) ||
          /must be owner of relation/i.test(message) ||
          /already exists/i.test(message);

        if (isOwnershipRerunIssue) {
          console.warn(`[db] Migration ${migration.name} skipped: ${message}`);
          continue;
        }
        throw err;
      }
    }
    console.log("[db] Migrations applied.");
  } catch (err) {
    console.error("[db] Migration warning:", (err as Error).message);
  } finally {
    client.release();
  }
}

applyMigrations().then(() => {
  app.listen(PORT, () => {
    console.log(`JobFlow API running on http://localhost:${PORT}`);
    console.log(`  Environment : ${process.env.NODE_ENV ?? "development"}`);
    console.log(`  CORS origin : ${process.env.CORS_ORIGIN ?? "http://localhost:5678"}`);
  });
  startScheduler();
});

export default app;
