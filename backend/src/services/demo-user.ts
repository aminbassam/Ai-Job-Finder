import bcrypt from "bcryptjs";
import { pool } from "../db/pool";

export const DEMO_EMAIL = "demo@jobflow.ai";
export const DEMO_USERNAME = "demo";
export const DEMO_PASSWORD = "Demo@123456";

const DEMO_CREDIT_REASON = "demo_seed_bonus";
const DEMO_WINDOW_HOURS = 24;

type DemoJobSeed = {
  externalKey: string;
  stage: "new" | "saved" | "ready" | "applied" | "interview";
  isSaved?: boolean;
  score?: number;
  recommendation?: "strong_fit" | "maybe" | "reject";
  explanation?: string;
  strengths?: string[];
  gaps?: string[];
  notes?: string;
};

const DEMO_JOB_SEEDS: DemoJobSeed[] = [
  {
    externalKey: "demo-stripe-spm",
    stage: "ready",
    isSaved: true,
    score: 92,
    recommendation: "strong_fit",
    explanation: "Excellent alignment across product strategy, fintech domain experience, and remote preference.",
    strengths: ["Strong product strategy fit", "Fintech background overlap", "Leadership and stakeholder alignment"],
    gaps: ["Highlight larger-budget ownership"],
    notes: "High-priority target for the demo pipeline.",
  },
  {
    externalKey: "demo-vercel-tpm",
    stage: "interview",
    isSaved: true,
    score: 89,
    recommendation: "strong_fit",
    explanation: "Great match for technical product work with developer tools and infrastructure themes.",
    strengths: ["Technical PM overlap", "Developer tools relevance", "Remote-friendly role"],
    gaps: ["Add more cloud-scale metrics"],
    notes: "Interview loop scheduled in the sample data.",
  },
  {
    externalKey: "demo-notion-sm",
    stage: "applied",
    isSaved: true,
    score: 81,
    recommendation: "strong_fit",
    explanation: "Solid fit for agile delivery leadership and team facilitation.",
    strengths: ["Scrum leadership", "Cross-functional coaching", "Strong delivery discipline"],
    gaps: ["Surface enterprise transformation examples"],
    notes: "Applied last week from the demo account.",
  },
  {
    externalKey: "demo-openai-aipm",
    stage: "saved",
    isSaved: true,
    score: 78,
    recommendation: "maybe",
    explanation: "Strong product fit with good AI context, but it would benefit from sharper 0-1 launch examples.",
    strengths: ["AI/ML product interest", "Strong PM base", "Clear compensation fit"],
    gaps: ["More AI launch examples", "Deeper ML fluency"],
    notes: "Worth tailoring a stronger AI narrative before applying.",
  },
  {
    externalKey: "demo-figma-gpm",
    stage: "new",
    isSaved: false,
    score: 74,
    recommendation: "maybe",
    explanation: "Good growth and experimentation overlap with a slightly weaker design-tools story.",
    strengths: ["Growth orientation", "Strong experimentation mindset"],
    gaps: ["Design collaboration depth"],
  },
];

async function ensureDemoAccount(): Promise<string> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM account_users WHERE email = $1 LIMIT 1`,
    [DEMO_EMAIL]
  );

  let userId: string;
  if (existing.rows[0]) {
    userId = existing.rows[0].id;
    await pool.query(
      `UPDATE account_users
       SET username = $2,
           password_hash = $3,
           first_name = 'Demo',
           last_name = 'User',
           current_job_title = 'Senior Product Manager',
           location_text = 'Austin, TX',
           email_verified_at = COALESCE(email_verified_at, NOW()),
           is_demo = true,
           is_active = true,
           updated_at = NOW()
       WHERE id = $1`,
      [userId, DEMO_USERNAME, passwordHash]
    );
  } else {
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO account_users
         (email, username, password_hash, first_name, last_name, current_job_title, location_text, email_verified_at, is_demo)
       VALUES ($1, $2, $3, 'Demo', 'User', 'Senior Product Manager', 'Austin, TX', NOW(), true)
       RETURNING id`,
      [DEMO_EMAIL, DEMO_USERNAME, passwordHash]
    );
    userId = inserted.rows[0].id;
  }

  await pool.query(
    `INSERT INTO user_profiles (user_id, professional_summary, years_experience, preferred_location_text, remote_only, min_salary_usd, max_salary_usd)
     VALUES ($1, $2, 8, 'Remote (US)', true, 140000, 230000)
     ON CONFLICT (user_id) DO UPDATE SET
       professional_summary = EXCLUDED.professional_summary,
       years_experience = EXCLUDED.years_experience,
       preferred_location_text = EXCLUDED.preferred_location_text,
       remote_only = EXCLUDED.remote_only,
       min_salary_usd = EXCLUDED.min_salary_usd,
       max_salary_usd = EXCLUDED.max_salary_usd,
       updated_at = NOW()`,
    [
      userId,
      "Demo user for client walkthroughs. Focused on product, operations, and growth leadership roles with measurable business impact.",
    ]
  );

  await pool.query(
    `INSERT INTO user_preferences (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );

  await pool.query(
    `UPDATE user_subscriptions
     SET plan_code = 'pro', status = 'active', updated_at = NOW()
     WHERE user_id = $1`,
    [userId]
  );

  await pool.query(
    `INSERT INTO user_subscriptions (user_id, plan_code, status)
     SELECT $1, 'pro', 'active'
     WHERE NOT EXISTS (
       SELECT 1 FROM user_subscriptions WHERE user_id = $1
     )`,
    [userId]
  );

  await pool.query(
    `INSERT INTO user_credit_ledger (user_id, delta, reason)
     SELECT $1, 1000, $2
     WHERE NOT EXISTS (
       SELECT 1 FROM user_credit_ledger WHERE user_id = $1 AND reason = $2
     )`,
    [userId, DEMO_CREDIT_REASON]
  );

  await pool.query(`DELETE FROM user_skills WHERE user_id = $1 AND created_at < NOW() - INTERVAL '24 hours'`, [userId]);
  for (const skill of [
    "Product Strategy",
    "Agile Delivery",
    "Roadmapping",
    "Stakeholder Management",
    "A/B Testing",
    "Go-to-Market",
  ]) {
    await pool.query(
      `INSERT INTO user_skills (user_id, skill_name)
       VALUES ($1, $2)
       ON CONFLICT (user_id, skill_name) DO NOTHING`,
      [userId, skill]
    );
  }

  return userId;
}

async function ensureDemoJobContext(userId: string) {
  const jobs = await pool.query<{ id: string; external_job_key: string; title: string }>(
    `SELECT id, external_job_key, title
     FROM jobs
     WHERE external_job_key = ANY($1::text[])`,
    [DEMO_JOB_SEEDS.map((job) => job.externalKey)]
  );
  const jobMap = new Map(jobs.rows.map((row) => [row.external_job_key, row]));

  for (const seed of DEMO_JOB_SEEDS) {
    const job = jobMap.get(seed.externalKey);
    if (!job) continue;

    await pool.query(
      `INSERT INTO user_job_states (user_id, job_id, stage, is_saved, saved_at, notes)
       VALUES ($1, $2, $3::job_stage, $4, CASE WHEN $4 THEN NOW() ELSE NULL END, $5)
       ON CONFLICT (user_id, job_id) DO NOTHING`,
      [userId, job.id, seed.stage, seed.isSaved ?? false, seed.notes ?? null]
    );

    if (seed.score && seed.recommendation) {
      const existingScore = await pool.query(
        `SELECT id
         FROM job_score_runs
         WHERE user_id = $1
           AND job_id = $2
           AND input_snapshot->>'seededDemo' = 'true'
         LIMIT 1`,
        [userId, job.id]
      );

      if (!existingScore.rows[0]) {
        await pool.query(
          `INSERT INTO job_score_runs
             (user_id, job_id, ai_provider, score, recommendation, explanation, strengths, gaps, model_name, input_snapshot)
           VALUES ($1, $2, 'openai', $3, $4, $5, $6::jsonb, $7::jsonb, 'gpt-4o', '{"seededDemo": true}'::jsonb)`,
          [
            userId,
            job.id,
            seed.score,
            seed.recommendation,
            seed.explanation ?? null,
            JSON.stringify(seed.strengths ?? []),
            JSON.stringify(seed.gaps ?? []),
          ]
        );
      }
    }
  }

  const vercel = jobMap.get("demo-vercel-tpm");
  const notion = jobMap.get("demo-notion-sm");
  if (!vercel || !notion) return;

  let resumeId: string | null = null;
  const existingResume = await pool.query<{ id: string }>(
    `SELECT id
     FROM documents
     WHERE user_id = $1
       AND metadata->>'seededDemoKey' = 'baseline_resume'
     LIMIT 1`,
    [userId]
  );

  if (existingResume.rows[0]) {
    resumeId = existingResume.rows[0].id;
  } else {
    const insertedResume = await pool.query<{ id: string }>(
      `INSERT INTO documents
         (user_id, job_id, kind, origin, resume_type, title, content_text, metadata)
       VALUES ($1, $2, 'resume', 'manual', 'tailored', 'Demo Resume — Product Leadership', $3, '{"seededDemoKey":"baseline_resume"}'::jsonb)
       RETURNING id`,
      [
        userId,
        vercel.id,
        "Demo product leader resume tailored for technical and growth-focused roles.",
      ]
    );
    resumeId = insertedResume.rows[0].id;
    await pool.query(
      `INSERT INTO document_versions (document_id, version_no, content_text, change_summary)
       VALUES ($1, 1, $2, 'Seeded demo resume baseline')`,
      [resumeId, "Demo product leader resume tailored for technical and growth-focused roles."]
    );
  }

  const scoreRows = await pool.query<{ id: string; job_id: string }>(
    `SELECT id, job_id
     FROM job_score_runs
     WHERE user_id = $1
       AND job_id = ANY($2::uuid[])
     ORDER BY created_at DESC`,
    [userId, [vercel.id, notion.id]]
  );
  const scoreByJob = new Map(scoreRows.rows.map((row) => [row.job_id, row.id]));

  for (const [jobId, status, url] of [
    [vercel.id, "interview", "https://jobfinder.aminbassam.com/jobs"],
    [notion.id, "applied", "https://jobfinder.aminbassam.com/jobs"],
  ] as const) {
    await pool.query(
      `INSERT INTO applications
         (user_id, job_id, status, score_run_id, resume_document_id, application_url, applied_at, notes, source_snapshot)
       VALUES ($1, $2, $3::application_status, $4, $5, $6, NOW() - INTERVAL '3 days', 'Seeded demo application.', 'demo_seed')
       ON CONFLICT (user_id, job_id) DO NOTHING`,
      [userId, jobId, status, scoreByJob.get(jobId) ?? null, resumeId, url]
    );
  }

  const apps = await pool.query<{ id: string; job_id: string; status: string }>(
    `SELECT id, job_id, status::text FROM applications WHERE user_id = $1 AND source_snapshot = 'demo_seed'`,
    [userId]
  );
  for (const app of apps.rows) {
    await pool.query(
      `INSERT INTO application_status_history (application_id, from_status, to_status, reason)
       SELECT $1, NULL, $2::application_status, 'Seeded demo status'
       WHERE NOT EXISTS (
         SELECT 1 FROM application_status_history WHERE application_id = $1
       )`,
      [app.id, app.status]
    );
  }

  const demoEvents = [
    {
      type: "application_sent",
      title: "Application Sent",
      description: "Applied to Scrum Master / Agile Coach at Notion.",
      jobId: notion.id,
      key: "application_notion",
    },
    {
      type: "match_found",
      title: "High Match Found",
      description: "Vercel Technical Product Manager scored 89/100 for the demo profile.",
      jobId: vercel.id,
      key: "match_vercel",
    },
    {
      type: "resume_generated",
      title: "Resume Generated",
      description: "A tailored resume is ready for the Vercel opportunity.",
      jobId: vercel.id,
      key: "resume_vercel",
    },
  ] as const;

  for (const event of demoEvents) {
    await pool.query(
      `INSERT INTO activity_events (user_id, type, title, description, job_id, metadata)
       SELECT $1, $2::activity_type, $3, $4, $5, $6::jsonb
       WHERE NOT EXISTS (
         SELECT 1
         FROM activity_events
         WHERE user_id = $1
           AND metadata->>'seededDemoKey' = $7
       )`,
      [
        userId,
        event.type,
        event.title,
        event.description,
        event.jobId,
        JSON.stringify({ seededDemoKey: event.key }),
        event.key,
      ]
    );
  }
}

export async function ensureDemoUserAndSeedData(): Promise<void> {
  const userId = await ensureDemoAccount();
  await ensureDemoJobContext(userId);
}

export async function cleanupExpiredDemoUserData(): Promise<void> {
  const users = await pool.query<{ id: string }>(
    `SELECT id FROM account_users WHERE is_demo = true`
  );
  if (users.rows.length === 0) return;

  const cutoff = new Date(Date.now() - DEMO_WINDOW_HOURS * 60 * 60 * 1000);
  const cleanupStatements = [
    { label: "profile_activity_logs", sql: `DELETE FROM profile_activity_logs WHERE user_id = $1 AND created_at < $2` },
    { label: "agent_runs", sql: `DELETE FROM agent_runs WHERE user_id = $1 AND created_at < $2` },
    { label: "search_profiles", sql: `DELETE FROM search_profiles WHERE user_id = $1 AND created_at < $2` },
    { label: "activity_events", sql: `DELETE FROM activity_events WHERE user_id = $1 AND created_at < $2` },
    { label: "applications", sql: `DELETE FROM applications WHERE user_id = $1 AND created_at < $2` },
    { label: "documents", sql: `DELETE FROM documents WHERE user_id = $1 AND created_at < $2` },
    { label: "ai_runs", sql: `DELETE FROM ai_runs WHERE user_id = $1 AND created_at < $2` },
    { label: "job_score_runs", sql: `DELETE FROM job_score_runs WHERE user_id = $1 AND created_at < $2` },
    { label: "user_job_states", sql: `DELETE FROM user_job_states WHERE user_id = $1 AND created_at < $2` },
    { label: "gmail_accounts", sql: `DELETE FROM gmail_accounts WHERE user_id = $1 AND created_at < $2` },
    { label: "master_resume_imports", sql: `DELETE FROM master_resume_imports WHERE user_id = $1 AND created_at < $2` },
    { label: "master_resumes", sql: `DELETE FROM master_resumes WHERE user_id = $1 AND created_at < $2` },
    { label: "user_credit_ledger", sql: `DELETE FROM user_credit_ledger WHERE user_id = $1 AND created_at < $2` },
    { label: "user_skills", sql: `DELETE FROM user_skills WHERE user_id = $1 AND created_at < $2` },
  ] as const;

  for (const user of users.rows) {
    let deletedRows = 0;

    for (const statement of cleanupStatements) {
      try {
        const result = await pool.query(statement.sql, [user.id, cutoff]);
        deletedRows += result.rowCount ?? 0;
      } catch (err) {
        console.error(
          `[demo-user] Cleanup failed for ${statement.label}:`,
          (err as Error).message
        );
      }
    }

    if (deletedRows > 0) {
      console.log(`[demo-user] Removed ${deletedRows} expired demo rows for user ${user.id}`);
    }
  }

  await ensureDemoUserAndSeedData();
}
