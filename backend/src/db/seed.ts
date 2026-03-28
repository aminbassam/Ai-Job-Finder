/**
 * Seed script — inserts reference data needed for the app to work.
 * Run with: npm run db:seed
 *
 * Safe to re-run (uses INSERT … ON CONFLICT DO NOTHING).
 */
import dotenv from "dotenv";
dotenv.config();

import bcrypt from "bcryptjs";
import { pool } from "./pool";

async function seed() {
  console.log("Seeding database…");

  // ── Subscription plans ──────────────────────────────────────────────────────
  await pool.query(`
    INSERT INTO subscription_plans (code, display_name, monthly_price_cents, yearly_price_cents, monthly_ai_credits, features)
    VALUES
      ('free',   'Free',   0,      0,      100,  '{"sources":2,"resumes":3,"daily_crawl":false}'::jsonb),
      ('pro',    'Pro',    2900,   24900,  1000, '{"sources":null,"resumes":null,"daily_crawl":true,"cover_letters":true}'::jsonb),
      ('agency', 'Agency', 9900,   89900,  5000, '{"sources":null,"resumes":null,"daily_crawl":true,"cover_letters":true,"team_seats":5}'::jsonb)
    ON CONFLICT (code) DO NOTHING
  `);

  // ── Job sources ─────────────────────────────────────────────────────────────
  await pool.query(`
    INSERT INTO job_sources (kind, name, base_url)
    VALUES
      ('linkedin',  'LinkedIn',  'https://www.linkedin.com'),
      ('indeed',    'Indeed',    'https://www.indeed.com'),
      ('company',   'Company',   NULL),
      ('angellist', 'AngelList', 'https://wellfound.com'),
      ('manual',    'Manual',    NULL)
    ON CONFLICT (kind, name) DO NOTHING
  `);

  // ── Tags ────────────────────────────────────────────────────────────────────
  const tags = [
    ["Remote", "work_mode"], ["Hybrid", "work_mode"], ["On-site", "work_mode"],
    ["Senior", "seniority"], ["Mid-level", "seniority"], ["Entry-level", "seniority"], ["Leadership", "seniority"],
    ["Visa Sponsor", "benefit"], ["High Growth", "company_type"], ["Open Source", "company_type"],
    ["Technical", "role_type"], ["AI/ML", "domain"], ["Fintech", "domain"], ["Design Tools", "domain"],
    ["Growth", "role_type"],
  ];
  for (const [name, category] of tags) {
    await pool.query(
      `INSERT INTO tags (name, category) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`,
      [name, category]
    );
  }

  // ── Demo companies ──────────────────────────────────────────────────────────
  const companies = [
    ["stripe",       "Stripe",        "https://stripe.com",        "fintech"],
    ["notion",       "Notion",        "https://notion.so",         "productivity"],
    ["vercel",       "Vercel",        "https://vercel.com",        "developer-tools"],
    ["shopify",      "Shopify",       "https://shopify.com",       "e-commerce"],
    ["openai",       "OpenAI",        "https://openai.com",        "artificial-intelligence"],
    ["automattic",   "Automattic",    "https://automattic.com",    "cms"],
    ["linear-app",   "Linear",        "https://linear.app",        "developer-tools"],
    ["figma-design", "Figma",         "https://figma.com",         "design-tools"],
  ];
  for (const [normalized_name, display_name, website_url, industry] of companies) {
    await pool.query(
      `INSERT INTO companies (normalized_name, display_name, website_url, industry)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (normalized_name) DO NOTHING`,
      [normalized_name, display_name, website_url, industry]
    );
  }

  // ── Demo jobs ───────────────────────────────────────────────────────────────
  const { rows: sourceRows } = await pool.query(
    `SELECT id, kind FROM job_sources`
  );
  const sourceMap: Record<string, string> = {};
  for (const r of sourceRows) sourceMap[r.kind] = r.id;

  const { rows: companyRows } = await pool.query(
    `SELECT id, normalized_name FROM companies`
  );
  const companyMap: Record<string, string> = {};
  for (const r of companyRows) companyMap[r.normalized_name] = r.id;

  const jobs = [
    {
      external_key: "demo-stripe-spm",
      company: "stripe", source: "linkedin",
      title: "Senior Product Manager",
      location: "San Francisco, CA (Remote)", work_mode: "remote",
      employment_type: "full_time", seniority: "senior",
      min_salary: 180000, max_salary: 240000,
      description: "We're looking for an experienced Product Manager to lead our payments infrastructure team. You'll work on building tools that power millions of businesses globally.",
      requirements: ["5+ years of product management experience", "Experience with B2B SaaS products", "Strong technical background", "Excellent communication skills"],
      tags: ["Remote", "Senior", "Visa Sponsor"],
      posted_at: "2026-03-25",
    },
    {
      external_key: "demo-notion-sm",
      company: "notion", source: "indeed",
      title: "Scrum Master / Agile Coach",
      location: "New York, NY", work_mode: "hybrid",
      employment_type: "full_time", seniority: "mid",
      min_salary: 130000, max_salary: 170000,
      description: "Join our growing product team as a Scrum Master. You'll facilitate agile ceremonies and coach teams on best practices.",
      requirements: ["CSM or equivalent certification", "3+ years as Scrum Master", "Experience with distributed teams", "Strong facilitation skills"],
      tags: ["Hybrid", "Mid-level"],
      posted_at: "2026-03-26",
    },
    {
      external_key: "demo-vercel-tpm",
      company: "vercel", source: "company",
      title: "Technical Product Manager",
      location: "Remote (US)", work_mode: "remote",
      employment_type: "full_time", seniority: "senior",
      min_salary: 160000, max_salary: 210000,
      description: "Lead the development of our edge infrastructure platform. Work closely with engineering to build the future of web deployment.",
      requirements: ["Strong technical background (CS degree or equivalent)", "4+ years PM experience", "Experience with developer tools", "Understanding of cloud infrastructure"],
      tags: ["Remote", "Technical", "Visa Sponsor"],
      posted_at: "2026-03-24",
    },
    {
      external_key: "demo-shopify-seo",
      company: "shopify", source: "linkedin",
      title: "Senior SEO Manager",
      location: "Toronto, Canada", work_mode: "onsite",
      employment_type: "full_time", seniority: "senior",
      min_salary: 120000, max_salary: 160000,
      description: "Drive organic growth through SEO strategy and execution. Work with content, product, and engineering teams.",
      requirements: ["5+ years SEO experience", "Experience with technical SEO", "Data-driven approach", "E-commerce experience preferred"],
      tags: ["On-site", "Senior"],
      posted_at: "2026-03-27",
    },
    {
      external_key: "demo-openai-aipm",
      company: "openai", source: "angellist",
      title: "Product Manager, AI/ML",
      location: "San Francisco, CA", work_mode: "onsite",
      employment_type: "full_time", seniority: "mid",
      min_salary: 200000, max_salary: 280000,
      description: "Shape the future of AI products. Work on cutting-edge language models and AI applications.",
      requirements: ["3+ years PM experience", "Understanding of ML/AI concepts", "Experience launching 0-1 products", "Technical background required"],
      tags: ["On-site", "AI/ML", "High Growth"],
      posted_at: "2026-03-23",
    },
    {
      external_key: "demo-automattic-wp",
      company: "automattic", source: "company",
      title: "WordPress Developer",
      location: "Remote (Global)", work_mode: "remote",
      employment_type: "full_time", seniority: "mid",
      min_salary: 90000, max_salary: 140000,
      description: "Build themes and plugins for WordPress.com. Work with a distributed team of passionate developers.",
      requirements: ["Strong PHP and WordPress experience", "Experience with React", "Open source contributions", "Self-motivated and remote-friendly"],
      tags: ["Remote", "Open Source"],
      posted_at: "2026-03-28",
    },
    {
      external_key: "demo-linear-dop",
      company: "linear-app", source: "linkedin",
      title: "Director of Product",
      location: "Remote (US/EU)", work_mode: "remote",
      employment_type: "full_time", seniority: "director",
      min_salary: 220000, max_salary: 300000,
      description: "Lead our product organization and define the future of issue tracking and project management.",
      requirements: ["8+ years PM experience", "3+ years in leadership", "B2B SaaS experience", "Strong design sensibility"],
      tags: ["Remote", "Leadership", "Senior"],
      posted_at: "2026-03-20",
    },
    {
      external_key: "demo-figma-gpm",
      company: "figma-design", source: "company",
      title: "Growth Product Manager",
      location: "San Francisco, CA", work_mode: "hybrid",
      employment_type: "full_time", seniority: "mid",
      min_salary: 170000, max_salary: 230000,
      description: "Drive user acquisition and retention through data-driven product improvements.",
      requirements: ["4+ years PM experience", "Growth or marketing background", "Strong analytical skills", "A/B testing experience"],
      tags: ["Hybrid", "Growth", "Design Tools"],
      posted_at: "2026-03-26",
    },
  ];

  for (const job of jobs) {
    const companyId = companyMap[job.company];
    const sourceId = sourceMap[job.source];
    if (!companyId || !sourceId) continue;

    const { rows: existing } = await pool.query(
      `SELECT id FROM jobs WHERE external_job_key = $1 AND source_id = $2`,
      [job.external_key, sourceId]
    );
    if (existing.length > 0) continue;

    const { rows: jobRows } = await pool.query(
      `INSERT INTO jobs (
        company_id, source_id, external_job_key, title, location_text,
        work_mode, employment_type, seniority, min_salary_usd, max_salary_usd,
        description, posted_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING id`,
      [
        companyId, sourceId, job.external_key, job.title, job.location,
        job.work_mode, job.employment_type, job.seniority,
        job.min_salary, job.max_salary, job.description, job.posted_at,
      ]
    );
    const jobId = jobRows[0].id;

    for (let i = 0; i < job.requirements.length; i++) {
      await pool.query(
        `INSERT INTO job_requirements (job_id, requirement_text, display_order) VALUES ($1, $2, $3)`,
        [jobId, job.requirements[i], i]
      );
    }

    for (const tagName of job.tags) {
      const { rows: tagRows } = await pool.query(
        `SELECT id FROM tags WHERE name = $1`, [tagName]
      );
      if (tagRows[0]) {
        await pool.query(
          `INSERT INTO job_tags (job_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [jobId, tagRows[0].id]
        );
      }
    }
  }

  // ── Superadmin account ───────────────────────────────────────────────────────
  const ADMIN_EMAIL    = "admin@jobflow.ai";
  const ADMIN_PASSWORD = "Admin@123456";

  const { rows: existingAdmin } = await pool.query(
    `SELECT id FROM account_users WHERE email = $1`,
    [ADMIN_EMAIL]
  );

  if (existingAdmin.length === 0) {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

    const { rows: adminRows } = await pool.query(
      `INSERT INTO account_users
         (email, password_hash, first_name, last_name, email_verified_at, is_admin)
       VALUES ($1, $2, 'Super', 'Admin', NOW(), true)
       RETURNING id`,
      [ADMIN_EMAIL, passwordHash]
    );
    const adminId = adminRows[0].id;

    await pool.query(`INSERT INTO user_profiles (user_id) VALUES ($1)`, [adminId]);
    await pool.query(`INSERT INTO user_preferences (user_id) VALUES ($1)`, [adminId]);
    await pool.query(
      `INSERT INTO user_subscriptions (user_id, plan_code, status) VALUES ($1, 'agency', 'active')`,
      [adminId]
    );
    await pool.query(
      `INSERT INTO user_credit_ledger (user_id, delta, reason) VALUES ($1, 5000, 'superadmin_grant')`,
      [adminId]
    );

    console.log("Superadmin created:");
    console.log(`  Email   : ${ADMIN_EMAIL}`);
    console.log(`  Password: ${ADMIN_PASSWORD}`);
  } else {
    console.log(`Superadmin already exists (${ADMIN_EMAIL}) — skipped.`);
  }

  console.log("Seed complete.");
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
