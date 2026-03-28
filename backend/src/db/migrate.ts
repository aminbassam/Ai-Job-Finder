/**
 * Migration runner — applies schema + all migration files in order.
 * Usage: npm run db:migrate
 */
import { readFileSync } from "fs";
import { join } from "path";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ROOT = join(__dirname, "../../../");

const baseSchema = { name: "schema", file: join(ROOT, "db/postgres_schema.sql") };

const migrations = [
  { name: "001_email_verification", file: join(ROOT, "db/migrations/001_email_verification.sql") },
  { name: "002_admin_role",         file: join(ROOT, "db/migrations/002_admin_role.sql") },
  { name: "003_resume_preferences", file: join(ROOT, "db/migrations/003_resume_preferences.sql") },
  { name: "004_ai_provider_fields", file: join(ROOT, "db/migrations/004_ai_provider_fields.sql") },
  { name: "005_job_agent",          file: join(ROOT, "db/migrations/005_job_agent.sql") },
  { name: "006_agent_profile_filters", file: join(ROOT, "db/migrations/006_agent_profile_filters.sql") },
];

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
      await client.query(sql);
      console.log("[migrate] Done: schema");
    } else {
      console.log("[migrate] Base schema already present, skipping schema step.");
    }

    for (const m of migrations) {
      console.log(`[migrate] Applying: ${m.name} ...`);
      const sql = readFileSync(m.file, "utf8");
      try {
        await client.query(sql);
        console.log(`[migrate] Done: ${m.name}`);
      } catch (err) {
        const message = (err as Error).message;
        const isOwnershipRerunIssue =
          /must be owner of table/i.test(message) ||
          /must be owner of relation/i.test(message) ||
          /already exists/i.test(message);

        if (isOwnershipRerunIssue) {
          console.warn(`[migrate] Skipping ${m.name}: ${message}`);
          continue;
        }
        throw err;
      }
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
