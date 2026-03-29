import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, queryOne, transaction } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { getGlobalAiSettings } from "../services/ai-global-settings";
import { markdownToPlainText, renderResumeHtml } from "../services/resume-renderer";

const router = Router();
router.use(requireAuth);

// ── Shared query helper ──────────────────────────────────────────────────────

async function getJobsWithUserContext(userId: string, filters: {
  query?: string;
  minScore?: number;
  status?: string;
  source?: string;
  remoteOnly?: boolean;
  limit?: number;
  offset?: number;
}) {
  const params: unknown[] = [userId];
  const conditions: string[] = ["j.is_active = true"];

  if (filters.query) {
    params.push(`%${filters.query.toLowerCase()}%`);
    conditions.push(
      `(lower(j.title) LIKE $${params.length} OR lower(c.display_name) LIKE $${params.length} OR lower(j.description) LIKE $${params.length})`
    );
  }
  if (filters.remoteOnly) {
    conditions.push(`j.work_mode = 'remote'`);
  }
  if (filters.source) {
    params.push(filters.source.toLowerCase());
    conditions.push(`lower(js.name) = $${params.length}`);
  }
  if (filters.status && filters.status !== "all") {
    params.push(filters.status);
    conditions.push(`COALESCE(ujs.stage, 'new') = $${params.length}`);
  }
  if (filters.minScore !== undefined) {
    params.push(filters.minScore);
    conditions.push(`COALESCE(latest_score.score, 0) >= $${params.length}`);
  }

  const whereClause = conditions.length > 0
    ? "WHERE " + conditions.join(" AND ")
    : "";

  const limitClause = `LIMIT ${filters.limit ?? 50} OFFSET ${filters.offset ?? 0}`;

  const sql = `
    SELECT
      j.id,
      j.title,
      j.description,
      j.location_text,
      j.work_mode,
      j.employment_type,
      j.seniority,
      j.min_salary_usd,
      j.max_salary_usd,
      j.posted_at,
      j.canonical_url,
      c.display_name AS company,
      js.name        AS source,
      COALESCE(ujs.stage::text, 'new')     AS status,
      ujs.is_saved,
      ujs.notes,
      COALESCE(latest_score.score, 0)      AS score,
      latest_score.recommendation,
      latest_score.strengths,
      latest_score.gaps,
      latest_score.explanation,
      COALESCE(
        array_agg(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL),
        ARRAY[]::text[]
      ) AS tags,
      COALESCE(
        array_agg(jr.requirement_text ORDER BY jr.display_order)
          FILTER (WHERE jr.requirement_text IS NOT NULL),
        ARRAY[]::text[]
      ) AS requirements
    FROM jobs j
    JOIN companies c ON c.id = j.company_id
    LEFT JOIN job_sources js ON js.id = j.source_id
    LEFT JOIN user_job_states ujs
      ON ujs.job_id = j.id AND ujs.user_id = $1
    LEFT JOIN LATERAL (
      SELECT score, recommendation, strengths, gaps, explanation
      FROM job_score_runs
      WHERE job_id = j.id AND user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    ) latest_score ON true
    LEFT JOIN job_tags jt ON jt.job_id = j.id
    LEFT JOIN tags t ON t.id = jt.tag_id
    LEFT JOIN job_requirements jr ON jr.job_id = j.id
    ${whereClause}
    GROUP BY
      j.id, c.display_name, js.name,
      ujs.stage, ujs.is_saved, ujs.notes,
      latest_score.score, latest_score.recommendation,
      latest_score.strengths, latest_score.gaps, latest_score.explanation
    ORDER BY j.imported_at DESC
    ${limitClause}
  `;

  const rows = await query<Record<string, unknown>>(sql, params);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    company: r.company,
    location: r.location_text,
    type: formatEmploymentType(r.employment_type as string),
    salary: formatSalary(r.min_salary_usd as number | null, r.max_salary_usd as number | null),
    score: Number(r.score),
    status: r.status as string,
    source: r.source as string ?? "Company",
    description: r.description,
    requirements: r.requirements as string[],
    tags: r.tags as string[],
    postedDate: r.posted_at ? String(r.posted_at).slice(0, 10) : null,
    isSaved: Boolean(r.is_saved),
    notes: r.notes,
    aiAnalysis: r.recommendation
      ? {
          strengths: r.strengths as string[] ?? [],
          gaps: r.gaps as string[] ?? [],
          recommendation: r.explanation as string ?? "",
        }
      : undefined,
  }));
}

// ── GET /api/jobs ────────────────────────────────────────────────────────────

router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const jobs = await getJobsWithUserContext(req.userId, {
      query: req.query.query as string,
      minScore: req.query.minScore ? Number(req.query.minScore) : undefined,
      status: req.query.status as string,
      source: req.query.source as string,
      remoteOnly: req.query.remoteOnly === "true",
      limit: req.query.limit ? Number(req.query.limit) : 50,
      offset: req.query.page ? (Number(req.query.page) - 1) * (Number(req.query.limit) || 50) : 0,
    });
    res.json(jobs);
  } catch (err) {
    console.error("[jobs/list]", err);
    res.status(500).json({ message: "Failed to fetch jobs." });
  }
});

// ── GET /api/jobs/:id ────────────────────────────────────────────────────────

router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await getJobsWithUserContext(req.userId, {});
    const job = rows.find((j) => j.id === req.params.id);
    if (!job) {
      res.status(404).json({ message: "Job not found." });
      return;
    }
    res.json(job);
  } catch (err) {
    console.error("[jobs/get]", err);
    res.status(500).json({ message: "Failed to fetch job." });
  }
});

// ── POST /api/jobs/import-link ───────────────────────────────────────────────

const importLinkSchema = z.object({
  url: z.string().url(),
});

router.post("/import-link", validate(importLinkSchema), async (req: Request, res: Response): Promise<void> => {
  const { url } = req.body as z.infer<typeof importLinkSchema>;

  // In production: fetch the URL, parse job data, upsert into jobs table.
  // For now we create a placeholder job the user can fill in.
  try {
    const manualSource = await queryOne<{ id: string }>(
      `SELECT id FROM job_sources WHERE kind = 'manual' LIMIT 1`
    );

    let companyRow = await queryOne<{ id: string }>(
      `SELECT id FROM companies WHERE normalized_name = 'unknown' LIMIT 1`
    );
    if (!companyRow) {
      const rows = await query<{ id: string }>(
        `INSERT INTO companies (normalized_name, display_name) VALUES ('unknown', 'Unknown') RETURNING id`
      );
      companyRow = rows[0];
    }

    const result = await query<{ id: string }>(
      `INSERT INTO jobs (company_id, source_id, external_job_key, title, description, canonical_url)
       VALUES ($1, $2, $3, 'Imported Job', 'Imported from link — edit to add details.', $4)
       RETURNING id`,
      [companyRow!.id, manualSource?.id ?? null, `manual_${Date.now()}`, url]
    );

    const jobId = result[0].id;

    // Create initial user_job_state
    await query(
      `INSERT INTO user_job_states (user_id, job_id, stage) VALUES ($1, $2, 'new')
       ON CONFLICT (user_id, job_id) DO NOTHING`,
      [req.userId, jobId]
    );

    res.status(201).json({ jobId });
  } catch (err) {
    console.error("[jobs/import-link]", err);
    res.status(500).json({ message: "Failed to import job." });
  }
});

// ── POST /api/jobs/:id/score ─────────────────────────────────────────────────

router.post("/:id/score", async (req: Request, res: Response): Promise<void> => {
  const jobId = req.params.id;

  try {
    const job = await queryOne<{ id: string; title: string; description: string }>(
      `SELECT id, title, description FROM jobs WHERE id = $1`, [jobId]
    );
    if (!job) {
      res.status(404).json({ message: "Job not found." });
      return;
    }

    // In production: call the AI gateway with user profile + job description.
    // For now we return a deterministic mock score based on job data length.
    const score = Math.min(100, 60 + (job.description.length % 35));
    const recommendation = score >= 70 ? "strong_fit" : score >= 50 ? "maybe" : "reject";
    const strengths = ["Strong skill alignment detected", "Location preferences match", "Seniority level is appropriate"];
    const gaps = ["Consider emphasizing leadership experience", "Add quantified metrics to resume"];
    const explanation = `This role scored ${score}/100 based on your profile and job requirements.`;

    const [scoreRun] = await query<{ id: string }>(
      `INSERT INTO job_score_runs
         (user_id, job_id, ai_provider, score, recommendation, explanation, strengths, gaps, model_name)
       VALUES ($1, $2, 'openai', $3, $4, $5, $6::jsonb, $7::jsonb, 'gpt-4o')
       RETURNING id`,
      [req.userId, jobId, score, recommendation, explanation,
       JSON.stringify(strengths), JSON.stringify(gaps)]
    );

    // Update user_job_state stage
    await query(
      `INSERT INTO user_job_states (user_id, job_id, stage)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, job_id)
       DO UPDATE SET stage = EXCLUDED.stage, updated_at = NOW()`,
      [req.userId, jobId, score >= 70 ? "ready" : "new"]
    );

    // Deduct 1 credit
    await query(
      `INSERT INTO user_credit_ledger (user_id, delta, reason, reference_type, reference_id)
       VALUES ($1, -1, 'job_score', 'job_score_runs', $2)`,
      [req.userId, scoreRun.id]
    );

    // Log activity
    await query(
      `INSERT INTO activity_events (user_id, type, title, description, job_id)
       VALUES ($1, 'match_found', $2, $3, $4)`,
      [req.userId, `Job Scored: ${job.title}`, `Score: ${score}/100 — ${recommendation.replace("_", " ")}`, jobId]
    );

    res.json({ score, recommendation, strengths, gaps, explanation });
  } catch (err) {
    console.error("[jobs/score]", err);
    res.status(500).json({ message: "Failed to score job." });
  }
});

// ── POST /api/jobs/:id/generate-resume ──────────────────────────────────────

router.post("/:id/generate-resume", async (req: Request, res: Response): Promise<void> => {
  const jobId = req.params.id;

  try {
    const globalAi = await getGlobalAiSettings(req.userId!);
    const job = await queryOne<{ id: string; title: string }>(
      `SELECT id, title FROM jobs WHERE id = $1`, [jobId]
    );
    if (!job) {
      res.status(404).json({ message: "Job not found." });
      return;
    }

    const profile = await queryOne<Record<string, unknown>>(
      `SELECT u.first_name, u.last_name, u.email, u.location_text, u.current_job_title, u.linkedin_url,
              up.professional_summary,
              COALESCE(
                json_agg(us.skill_name ORDER BY us.years_experience DESC NULLS LAST)
                  FILTER (WHERE us.skill_name IS NOT NULL),
                '[]'
              ) AS skills
       FROM account_users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       LEFT JOIN user_skills us ON us.user_id = u.id
       WHERE u.id = $1
       GROUP BY u.id, u.first_name, u.last_name, u.email, u.location_text, u.current_job_title, u.linkedin_url, up.professional_summary`,
      [req.userId]
    );

    const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Candidate Name";
    const headerLines = [
      `# ${fullName}`,
      [profile?.location_text, profile?.email, profile?.linkedin_url].filter(Boolean).join(" • "),
    ].filter(Boolean);
    const skills = Array.isArray(profile?.skills) ? (profile.skills as string[]).slice(0, 12) : [];
    const markdown = [
      ...headerLines,
      "",
      "## Professional Summary",
      profile?.professional_summary
        ? `${String(profile.professional_summary)} Tailoring this version toward the ${job.title} opportunity.`
        : `Results-oriented professional pursuing the ${job.title} opportunity with a focus on clear communication, measurable impact, and strong cross-functional execution.`,
      "",
      "## Core Skills",
      ...(skills.length > 0 ? skills : ["Strategic planning", "Cross-functional collaboration", "Execution", "Stakeholder management"]).map((skill) => `- ${skill}`),
      "",
      "## Professional Experience",
      `- Current focus: ${String(profile?.current_job_title ?? "Recent professional experience tailored to this role")}`,
      "- Achievement bullets can be improved further with AI once deeper work history is added to the profile.",
      "",
      "## Education",
      "- Add education details in your profile to personalize this section.",
      "",
      "## Certifications",
      "- Add certifications in resume settings to personalize this section.",
    ].join("\n");
    const contentText = markdownToPlainText(markdown);
    const contentHtml = renderResumeHtml({
      title: `Tailored Resume — ${job.title}`,
      markdown,
      formatting: {
        titleFont: globalAi.resumeTitleFont,
        bodyFont: globalAi.resumeBodyFont,
        accentColor: globalAi.resumeAccentColor,
        template: globalAi.resumeTemplate,
        density: globalAi.resumeDensity,
      },
    });

    // In production: call the AI gateway to tailor resume content.
    const [aiRun] = await query<{ id: string }>(
      `INSERT INTO ai_runs (user_id, provider, kind, model_name, credit_delta, status)
       VALUES ($1, 'openai', 'resume_generation', 'gpt-4o', -5, 'completed')
       RETURNING id`,
      [req.userId]
    );

    const [doc] = await query<{ id: string }>(
      `INSERT INTO documents
         (user_id, job_id, kind, origin, resume_type, title, content_text, content_html, metadata)
       VALUES ($1, $2, 'resume', 'ai_generated', 'tailored', $3, $4, $5, $6::jsonb)
       RETURNING id`,
      [
        req.userId,
        jobId,
        `Tailored Resume — ${job.title}`,
        contentText,
        contentHtml,
        JSON.stringify({
          formatting: {
            titleFont: globalAi.resumeTitleFont,
            bodyFont: globalAi.resumeBodyFont,
            accentColor: globalAi.resumeAccentColor,
            template: globalAi.resumeTemplate,
            density: globalAi.resumeDensity,
          },
        }),
      ]
    );

    await query(
      `INSERT INTO document_versions (document_id, version_no, content_text, content_html, created_by_run_id)
       VALUES ($1, 1, $2, $3, $4)`,
      [doc.id, contentText, contentHtml, aiRun.id]
    );

    // Deduct credits
    await query(
      `INSERT INTO user_credit_ledger (user_id, delta, reason, reference_type, reference_id)
       VALUES ($1, -5, 'resume_generation', 'ai_runs', $2)`,
      [req.userId, aiRun.id]
    );

    await query(
      `INSERT INTO activity_events (user_id, type, title, description, job_id, document_id)
       VALUES ($1, 'resume_generated', $2, $3, $4, $5)`,
      [req.userId, "Resume Generated", `Tailored resume created for ${job.title}`, jobId, doc.id]
    );

    res.status(201).json({ resumeId: doc.id, downloadUrl: `/api/documents/${doc.id}/download` });
  } catch (err) {
    console.error("[jobs/generate-resume]", err);
    res.status(500).json({ message: "Failed to generate resume." });
  }
});

// ── POST /api/jobs/:id/generate-cover-letter ─────────────────────────────────

router.post("/:id/generate-cover-letter", async (req: Request, res: Response): Promise<void> => {
  const jobId = req.params.id;

  try {
    const job = await queryOne<{ id: string; title: string }>(
      `SELECT id, title FROM jobs WHERE id = $1`, [jobId]
    );
    if (!job) {
      res.status(404).json({ message: "Job not found." });
      return;
    }

    const content = `Dear Hiring Manager,\n\nI am excited to apply for the ${job.title} position. Based on my background and experience, I believe I would be an excellent fit for this role.\n\n[Cover letter body — AI generation placeholder]\n\nBest regards,\n[Your Name]`;

    const [doc] = await query<{ id: string }>(
      `INSERT INTO documents (user_id, job_id, kind, origin, title, content_text)
       VALUES ($1, $2, 'cover_letter', 'ai_generated', $3, $4)
       RETURNING id`,
      [req.userId, jobId, `Cover Letter — ${job.title}`, content]
    );

    res.status(201).json({ documentId: doc.id, content });
  } catch (err) {
    console.error("[jobs/cover-letter]", err);
    res.status(500).json({ message: "Failed to generate cover letter." });
  }
});

// ── PUT /api/jobs/:id/state ──────────────────────────────────────────────────

const stateSchema = z.object({
  stage: z.enum(["new", "saved", "ready", "applied", "interview", "offer", "accepted", "rejected", "archived"]).optional(),
  isSaved: z.boolean().optional(),
  notes: z.string().max(5000).optional(),
});

router.put("/:id/state", validate(stateSchema), async (req: Request, res: Response): Promise<void> => {
  const jobId = req.params.id;
  const { stage, isSaved, notes } = req.body as z.infer<typeof stateSchema>;

  try {
    await query(
      `INSERT INTO user_job_states (user_id, job_id, stage, is_saved, notes)
       VALUES ($1, $2, COALESCE($3::job_stage, 'new'), COALESCE($4, false), $5)
       ON CONFLICT (user_id, job_id) DO UPDATE SET
         stage      = COALESCE($3::job_stage, user_job_states.stage),
         is_saved   = COALESCE($4,            user_job_states.is_saved),
         notes      = COALESCE($5,            user_job_states.notes),
         updated_at = NOW()`,
      [req.userId, jobId, stage ?? null, isSaved ?? null, notes ?? null]
    );
    res.json({ message: "State updated." });
  } catch (err) {
    console.error("[jobs/state]", err);
    res.status(500).json({ message: "Failed to update job state." });
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatEmploymentType(t: string): string {
  return t?.replace(/_/g, "-") ?? "Full-time";
}

function formatSalary(min: number | null, max: number | null): string | undefined {
  if (!min && !max) return undefined;
  const fmt = (n: number) => `$${Math.round(n / 1000)}k`;
  if (min && max) return `${fmt(min)} - ${fmt(max)}`;
  if (min) return `${fmt(min)}+`;
  if (max) return `Up to ${fmt(max)}`;
}

export default router;
