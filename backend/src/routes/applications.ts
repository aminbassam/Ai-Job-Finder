import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, queryOne, transaction } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";

const router = Router();
router.use(requireAuth);

// ── GET /api/applications ────────────────────────────────────────────────────

router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await query<Record<string, unknown>>(
      `SELECT
         a.id, a.job_id, a.status, a.applied_at, a.notes, a.application_url,
         j.title AS job_title, c.display_name AS company,
         js.name AS source,
         COALESCE(app_score.score, latest_score.score, 0) AS score,
         COALESCE((app_score.input_snapshot->>'jobFitScore')::int, latest_score.score, 0) AS job_fit_score,
         COALESCE((app_score.input_snapshot->>'resumeScore')::int, 0) AS resume_score,
         d.id AS resume_id, d.title AS resume_title
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       JOIN companies c ON c.id = j.company_id
       LEFT JOIN job_sources js ON js.id = j.source_id
       LEFT JOIN documents d ON d.id = a.resume_document_id
       LEFT JOIN job_score_runs app_score ON app_score.id = a.score_run_id
       LEFT JOIN LATERAL (
         SELECT score FROM job_score_runs
         WHERE job_id = a.job_id AND user_id = a.user_id
         ORDER BY created_at DESC LIMIT 1
       ) latest_score ON true
       WHERE a.user_id = $1
       ORDER BY a.last_status_changed_at DESC`,
      [req.userId]
    );

    const apps = rows.map((r) => ({
      id: r.id,
      jobId: r.job_id,
      jobTitle: r.job_title,
      company: r.company,
      status: r.status,
      score: Number(r.score),
      jobFitScore: Number(r.job_fit_score ?? 0),
      resumeScore: Number(r.resume_score ?? 0),
      resumeId: r.resume_id,
      resumeTitle: r.resume_title,
      appliedDate: r.applied_at ? String(r.applied_at).slice(0, 10) : null,
      source: r.source ?? "Unknown",
      notes: r.notes,
      applicationUrl: r.application_url,
    }));

    res.json(apps);
  } catch (err) {
    console.error("[applications/list]", err);
    res.status(500).json({ message: "Failed to fetch applications." });
  }
});

function normalizeCompanySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "company";
}

function mapSourceKind(source?: string | null): "linkedin" | "indeed" | "company" | "angellist" | "manual" | "other" {
  const normalized = (source ?? "").trim().toLowerCase();
  if (normalized === "linkedin") return "linkedin";
  if (normalized === "indeed") return "indeed";
  if (normalized === "manual") return "manual";
  if (normalized === "angellist" || normalized === "wellfound") return "angellist";
  if (["greenhouse", "lever", "ashby", "workday", "google", "company"].includes(normalized)) return "company";
  return "other";
}

function mapWorkMode(remote?: boolean, location?: string | null): "remote" | "hybrid" | "onsite" | "unknown" {
  if (remote) return "remote";
  const text = (location ?? "").toLowerCase();
  if (text.includes("hybrid")) return "hybrid";
  if (text.includes("onsite") || text.includes("on-site")) return "onsite";
  return "unknown";
}

function mapEmploymentType(jobType?: string | null): "full_time" | "part_time" | "contract" | "temporary" | "internship" | "freelance" | "other" {
  const text = (jobType ?? "").toLowerCase();
  if (text.includes("full")) return "full_time";
  if (text.includes("part")) return "part_time";
  if (text.includes("contract")) return "contract";
  if (text.includes("temporary") || text.includes("temp")) return "temporary";
  if (text.includes("intern")) return "internship";
  if (text.includes("freelance")) return "freelance";
  return "other";
}

function safeDate(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function mapApplicationStatusToJobStage(status: string): "new" | "ready" | "applied" | "interview" | "offer" | "accepted" | "rejected" | "archived" {
  switch (status) {
    case "draft":
      return "new";
    case "ready":
      return "ready";
    case "applied":
      return "applied";
    case "interview":
      return "interview";
    case "offer":
      return "offer";
    case "accepted":
      return "accepted";
    case "rejected":
      return "rejected";
    case "withdrawn":
      return "archived";
    default:
      return "new";
  }
}

// ── POST /api/applications ───────────────────────────────────────────────────

const createSchema = z.object({
  jobId:       z.string().uuid(),
  resumeId:    z.string().uuid().optional(),
  notes:       z.string().max(5000).optional(),
  applicationUrl: z.string().url().optional(),
});

router.post("/", validate(createSchema), async (req: Request, res: Response): Promise<void> => {
  const { jobId, resumeId, notes, applicationUrl } = req.body as z.infer<typeof createSchema>;

  try {
    const existing = await queryOne(
      `SELECT id FROM applications WHERE user_id = $1 AND job_id = $2`,
      [req.userId, jobId]
    );
    if (existing) {
      res.status(409).json({ message: "Application already exists for this job." });
      return;
    }

    const [app] = await query<{ id: string }>(
      `INSERT INTO applications
         (user_id, job_id, status, resume_document_id, notes, application_url, applied_at)
       VALUES ($1, $2, 'applied', $3, $4, $5, NOW())
       RETURNING id`,
      [req.userId, jobId, resumeId ?? null, notes ?? null, applicationUrl ?? null]
    );

    // Update job state
    await query(
      `INSERT INTO user_job_states (user_id, job_id, stage)
       VALUES ($1, $2, 'applied')
       ON CONFLICT (user_id, job_id)
       DO UPDATE SET stage = 'applied', updated_at = NOW()`,
      [req.userId, jobId]
    );

    // Log status history
    await query(
      `INSERT INTO application_status_history (application_id, from_status, to_status)
       VALUES ($1, NULL, 'applied')`,
      [app.id]
    );

    // Log activity
    const job = await queryOne<{ title: string; company_id: string }>(
      `SELECT j.title, c.display_name AS company
       FROM jobs j JOIN companies c ON c.id = j.company_id WHERE j.id = $1`,
      [jobId]
    );
    await query(
      `INSERT INTO activity_events (user_id, type, title, description, job_id, application_id)
       VALUES ($1, 'application_sent', $2, $3, $4, $5)`,
      [req.userId, "Application Sent", `Applied to ${(job as Record<string, string>)?.title} at ${(job as Record<string, string>)?.company}`, jobId, app.id]
    ).catch(() => {});

    res.status(201).json({ id: app.id });
  } catch (err) {
    console.error("[applications/create]", err);
    res.status(500).json({ message: "Failed to create application." });
  }
});

const createFromMatchSchema = z.object({
  jobMatchId: z.string().uuid(),
});

router.post("/from-match", validate(createFromMatchSchema), async (req: Request, res: Response): Promise<void> => {
  const { jobMatchId } = req.body as z.infer<typeof createFromMatchSchema>;

  try {
    const match = await queryOne<Record<string, unknown>>(
      `SELECT jm.*,
              rd.id AS resume_id,
              rd.metadata AS resume_metadata
       FROM job_matches jm
       LEFT JOIN LATERAL (
         SELECT d.id, d.metadata
         FROM documents d
         WHERE d.user_id = jm.user_id
           AND d.kind = 'resume'
           AND d.resume_type = 'tailored'
           AND d.metadata->>'jobMatchId' = jm.id::text
         ORDER BY d.updated_at DESC
         LIMIT 1
       ) rd ON true
       WHERE jm.id = $1 AND jm.user_id = $2`,
      [jobMatchId, req.userId]
    );

    if (!match) {
      res.status(404).json({ message: "Job match not found." });
      return;
    }

    const result = await transaction(async (q) => {
      const companyName = String(match.company ?? "Unknown Company").trim() || "Unknown Company";
      const companySlug = normalizeCompanySlug(companyName);
      const companyRows = await q(
        `INSERT INTO companies (normalized_name, display_name)
         VALUES ($1, $2)
         ON CONFLICT (normalized_name)
         DO UPDATE SET display_name = EXCLUDED.display_name
         RETURNING id`,
        [companySlug, companyName]
      );
      const companyId = String((companyRows[0] as { id: string }).id);

      const sourceKind = mapSourceKind(typeof match.source === "string" ? match.source : null);
      const sourceName = typeof match.source === "string" && match.source.trim()
        ? `${match.source}`.charAt(0).toUpperCase() + `${match.source}`.slice(1)
        : "Imported";
      const sourceRows = await q(
        `INSERT INTO job_sources (kind, name, base_url)
         VALUES ($1::job_source_kind, $2, NULL)
         ON CONFLICT (kind, name)
         DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [sourceKind, sourceName]
      );
      const sourceId = String((sourceRows[0] as { id: string }).id);

      const externalKey = String(match.external_id ?? match.source_url ?? `${companySlug}-${String(match.title ?? "job").toLowerCase()}` );
      const requirementsText = Array.isArray(match.requirements)
        ? (match.requirements as string[]).filter(Boolean).join("\n")
        : null;

      let jobId: string;
      const existingJob = await q(
        `SELECT id
         FROM jobs
         WHERE source_id = $1 AND external_job_key = $2
         LIMIT 1`,
        [sourceId, externalKey]
      );

      if (existingJob[0]) {
        jobId = String((existingJob[0] as { id: string }).id);
        await q(
          `UPDATE jobs
           SET company_id = $2,
               canonical_url = $3,
               title = $4,
               location_text = $5,
               work_mode = $6::work_mode,
               employment_type = $7::employment_type,
               min_salary_usd = $8,
               max_salary_usd = $9,
               description = $10,
               requirements_text = $11,
               posted_at = COALESCE($12::date, posted_at),
               raw_payload = $13::jsonb,
               updated_at = NOW()
           WHERE id = $1`,
          [
            jobId,
            companyId,
            match.source_url ?? null,
            String(match.title ?? "Untitled Job"),
            match.location ?? null,
            mapWorkMode(Boolean(match.remote), typeof match.location === "string" ? match.location : null),
            mapEmploymentType(typeof match.job_type === "string" ? match.job_type : null),
            typeof match.salary_min === "number" ? match.salary_min : null,
            typeof match.salary_max === "number" ? match.salary_max : null,
            String(match.description ?? ""),
            requirementsText,
            safeDate(typeof match.posted_at === "string" ? match.posted_at : null),
            JSON.stringify(match.raw_data ?? {}),
          ]
        );
      } else {
        const insertedJobs = await q(
          `INSERT INTO jobs (
             company_id, source_id, external_job_key, canonical_url, title, location_text,
             work_mode, employment_type, min_salary_usd, max_salary_usd, description,
             requirements_text, posted_at, raw_payload
           ) VALUES (
             $1, $2, $3, $4, $5, $6,
             $7::work_mode, $8::employment_type, $9, $10, $11,
             $12, $13::date, $14::jsonb
           )
           RETURNING id`,
          [
            companyId,
            sourceId,
            externalKey,
            match.source_url ?? null,
            String(match.title ?? "Untitled Job"),
            match.location ?? null,
            mapWorkMode(Boolean(match.remote), typeof match.location === "string" ? match.location : null),
            mapEmploymentType(typeof match.job_type === "string" ? match.job_type : null),
            typeof match.salary_min === "number" ? match.salary_min : null,
            typeof match.salary_max === "number" ? match.salary_max : null,
            String(match.description ?? ""),
            requirementsText,
            safeDate(typeof match.posted_at === "string" ? match.posted_at : null),
            JSON.stringify(match.raw_data ?? {}),
          ]
        );
        jobId = String((insertedJobs[0] as { id: string }).id);
      }

      const resumeMetadata = (match.resume_metadata as Record<string, unknown> | null) ?? {};
      const jobFitScore = Number(match.ai_score ?? 0);
      const resumeScore = Number(resumeMetadata.resumeScore ?? resumeMetadata.profileResumeScore ?? jobFitScore ?? 0);
      const combinedScore = Math.max(0, Math.min(100, Math.round((jobFitScore * 0.55) + (resumeScore * 0.45))));

      const scoreRows = await q(
        `INSERT INTO job_score_runs (
           user_id, job_id, ai_provider, score, recommendation, explanation, strengths, gaps, model_name, input_snapshot
         ) VALUES (
           $1, $2, 'other', $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9::jsonb
         )
         RETURNING id`,
        [
          req.userId,
          jobId,
          combinedScore,
          combinedScore >= 75 ? "Strongly proceed" : combinedScore >= 60 ? "Proceed with edits" : "Needs improvement",
          "Application score combines job-fit scoring with the tailored resume score used for this application.",
          JSON.stringify(["Job fit score applied", "Tailored resume quality included"]),
          JSON.stringify([]),
          "application-composite-v1",
          JSON.stringify({
            source: "job_match_application",
            jobMatchId,
            jobFitScore,
            resumeScore,
            combinedScore,
            resumeId: match.resume_id ?? null,
          }),
        ]
      );
      const scoreRunId = String((scoreRows[0] as { id: string }).id);

      const existingApplication = await q(
        `SELECT id, status
         FROM applications
         WHERE user_id = $1 AND job_id = $2
         LIMIT 1`,
        [req.userId, jobId]
      );

      let applicationId: string;
      if (existingApplication[0]) {
        applicationId = String((existingApplication[0] as { id: string }).id);
        await q(
          `UPDATE applications
           SET status = 'applied',
               score_run_id = $2,
               resume_document_id = COALESCE($3, resume_document_id),
               source_snapshot = $4,
               applied_at = COALESCE(applied_at, NOW()),
               last_status_changed_at = NOW(),
               updated_at = NOW()
           WHERE id = $1`,
          [applicationId, scoreRunId, match.resume_id ?? null, String(match.source_url ?? "")]
        );
        await q(
          `INSERT INTO application_status_history (application_id, from_status, to_status, notes)
           VALUES ($1, $2::application_status, 'applied', 'Marked applied from Job Board')`,
          [applicationId, String((existingApplication[0] as { status: string }).status)]
        );
      } else {
        const applicationRows = await q(
          `INSERT INTO applications (
             user_id, job_id, status, score_run_id, resume_document_id, source_snapshot, applied_at
           ) VALUES ($1, $2, 'applied', $3, $4, $5, NOW())
           RETURNING id`,
          [req.userId, jobId, scoreRunId, match.resume_id ?? null, String(match.source_url ?? "")]
        );
        applicationId = String((applicationRows[0] as { id: string }).id);
        await q(
          `INSERT INTO application_status_history (application_id, from_status, to_status, notes)
           VALUES ($1, NULL, 'applied', 'Marked applied from Job Board')`,
          [applicationId]
        );
      }

      await q(
        `INSERT INTO user_job_states (user_id, job_id, stage)
         VALUES ($1, $2, 'applied')
         ON CONFLICT (user_id, job_id)
         DO UPDATE SET stage = 'applied', updated_at = NOW()`,
        [req.userId, jobId]
      );

      await q(
        `UPDATE job_matches
         SET status = 'applied', updated_at = NOW()
         WHERE id = $1 AND user_id = $2`,
        [jobMatchId, req.userId]
      );

      if (match.resume_id) {
        await q(
          `UPDATE documents
           SET job_id = COALESCE(job_id, $2), updated_at = NOW()
           WHERE id = $1 AND user_id = $3`,
          [match.resume_id, jobId, req.userId]
        );
      }

      return {
        applicationId,
        score: combinedScore,
        jobFitScore,
        resumeScore,
      };
    });

    res.status(201).json({
      id: result.applicationId,
      score: result.score,
      jobFitScore: result.jobFitScore,
      resumeScore: result.resumeScore,
      message: "Application created from Job Board match.",
    });
  } catch (err) {
    console.error("[applications/from-match]", err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to create application from job match." });
  }
});

// ── PUT /api/applications/:id ────────────────────────────────────────────────

const updateSchema = z.object({
  status: z.enum(["draft", "ready", "applied", "interview", "offer", "accepted", "rejected", "withdrawn"]).optional(),
  notes:  z.string().max(5000).optional(),
  applicationUrl: z.string().url().optional(),
});

router.put("/:id", validate(updateSchema), async (req: Request, res: Response): Promise<void> => {
  const { status, notes, applicationUrl } = req.body as z.infer<typeof updateSchema>;

  try {
    const existing = await queryOne<{ id: string; status: string; job_id: string }>(
      `SELECT id, status, job_id FROM applications WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    );
    if (!existing) {
      res.status(404).json({ message: "Application not found." });
      return;
    }

    await query(
      `UPDATE applications SET
         status               = COALESCE($2::application_status, status),
         notes                = COALESCE($3, notes),
         application_url      = COALESCE($4, application_url),
         applied_at           = CASE WHEN $2 = 'applied' AND applied_at IS NULL THEN NOW() ELSE applied_at END,
         last_status_changed_at = NOW(),
         updated_at           = NOW()
       WHERE id = $1`,
      [req.params.id, status ?? null, notes ?? null, applicationUrl ?? null]
    );

    if (status && status !== existing.status) {
      await query(
        `INSERT INTO application_status_history (application_id, from_status, to_status)
         VALUES ($1, $2::application_status, $3::application_status)`,
        [req.params.id, existing.status, status]
      );

      const stage = mapApplicationStatusToJobStage(status);
      await query(
        `INSERT INTO user_job_states (user_id, job_id, stage)
         VALUES ($1, $2, $3::job_stage)
         ON CONFLICT (user_id, job_id)
         DO UPDATE SET stage = EXCLUDED.stage, updated_at = NOW()`,
        [req.userId, existing.job_id, stage]
      ).catch(() => undefined);
    }

    res.json({ message: "Application updated." });
  } catch (err) {
    console.error("[applications/update]", err);
    res.status(500).json({ message: "Failed to update application." });
  }
});

export default router;
