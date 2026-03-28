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

const migrations = [
  { name: "schema", file: join(ROOT, "db/postgres_schema.sql") },
  { name: "001_email_verification", file: join(ROOT, "db/migrations/001_email_verification.sql") },
];

async function run() {
  const client = await pool.connect();
  try {
    for (const m of migrations) {
      console.log(`[migrate] Applying: ${m.name} ...`);
      const sql = readFileSync(m.file, "utf8");
      await client.query(sql);
      console.log(`[migrate] Done: ${m.name}`);
    }
    console.log("[migrate] All migrations applied successfully.");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("[migrate] Failed:", err.message);
  process.exit(1);
});
