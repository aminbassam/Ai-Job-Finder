/**
 * Migration runner — applies schema + all migration files in order.
 * Usage: npm run db:migrate
 */
import "../config/load-env";
import { readFileSync } from "fs";
import { join } from "path";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ROOT = join(__dirname, "../../../");

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
  { name: "017_profile_activity_logs",   file: join(ROOT, "db/migrations/017_profile_activity_logs.sql") },
  { name: "018_account_usernames",       file: join(ROOT, "db/migrations/018_account_usernames.sql") },
  { name: "019_demo_users",              file: join(ROOT, "db/migrations/019_demo_users.sql") },
  { name: "020_resume_custom_sections",  file: join(ROOT, "db/migrations/020_resume_custom_sections.sql") },
  { name: "021_custom_sections_tags",    file: join(ROOT, "db/migrations/021_custom_sections_tags.sql") },
];

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
    if (!inDollarQuote) {
      const tagMatch = sql.slice(i).match(/^(\$[^$]*\$)/);
      if (tagMatch) {
        inDollarQuote = true;
        dollarTag = tagMatch[1];
        current += tagMatch[1];
        i += tagMatch[1].length;
        continue;
      }
    } else if (sql.slice(i).startsWith(dollarTag)) {
      current += dollarTag;
      i += dollarTag.length;
      inDollarQuote = false;
      dollarTag = "";
      continue;
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

async function run() {
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
      console.log("[migrate] Applying: schema ...");
      const sql = readFileSync(baseSchema.file, "utf8");
      const stmts = splitSql(sql);
      for (const stmt of stmts) await client.query(stmt);
      console.log("[migrate] Done: schema");
    } else {
      console.log("[migrate] Base schema already present, skipping schema step.");
    }

    for (const m of migrations) {
      console.log(`[migrate] Applying: ${m.name} ...`);
      const sql = readFileSync(m.file, "utf8");
      const statements = splitSql(sql);
      let applied = 0;
      let skipped = 0;
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
          if (isAlreadyApplied) { skipped++; continue; }
          console.error(`[migrate] ${m.name} FAILED on:\n${stmt}\nError: ${message}`);
          throw err;
        }
      }
      console.log(`[migrate] Done: ${m.name} (${applied} applied, ${skipped} skipped)`);
    }
    console.log("[migrate] All migrations applied successfully.");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("[migrate] Failed:", err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
