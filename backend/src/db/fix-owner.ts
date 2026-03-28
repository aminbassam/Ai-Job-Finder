/**
 * fix-owner.ts
 * Transfers ownership of all public tables and sequences to the DATABASE_URL
 * user. Run this once when tables were created by a different superuser
 * (e.g., the macOS Postgres.app user instead of the app user).
 *
 * Usage: npm run db:fix-owner
 */
import dotenv from "dotenv";
dotenv.config();

import { Pool } from "pg";

// Connect as the current OS user (superuser in Postgres.app / native installs)
// by omitting credentials — pg falls back to peer/trust auth.
const superPool = new Pool({
  host:     "localhost",
  port:     5432,
  database: "jobflow",
  // No user/password — relies on peer/trust auth as the OS superuser
});

async function run() {
  const client = await superPool.connect();
  try {
    // Determine target owner from DATABASE_URL
    const url = process.env.DATABASE_URL ?? "";
    const match = url.match(/\/\/([^:@]+)(?::[^@]+)?@/);
    const targetUser = match?.[1] ?? "jobflow";
    console.log(`[fix-owner] Transferring all public table ownership to: ${targetUser}`);

    await client.query(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tableowner != '${targetUser}'
        LOOP
          EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' OWNER TO ${targetUser}';
          RAISE NOTICE 'Transferred: %', r.tablename;
        END LOOP;
      END $$
    `);

    await client.query(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'
        LOOP
          EXECUTE 'ALTER SEQUENCE ' || quote_ident(r.sequence_name) || ' OWNER TO ${targetUser}';
        END LOOP;
      END $$
    `);

    const { rows } = await client.query(
      `SELECT tableowner, count(*) FROM pg_tables WHERE schemaname = 'public' GROUP BY tableowner`
    );
    console.log("[fix-owner] Table ownership summary:", rows);
    console.log("[fix-owner] Done. Restart the backend now.");
  } finally {
    client.release();
    await superPool.end();
  }
}

run().catch((err) => {
  console.error("[fix-owner] Failed:", err.message);
  console.error("Tip: run this script from a terminal where psql connects without a password (Postgres.app or native install).");
  process.exit(1);
});
