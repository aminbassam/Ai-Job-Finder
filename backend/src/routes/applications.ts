import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, queryOne } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";

const router = Router();
router.use(requireAuth);

// ── GET /api/applications ────────────────────────────────────────────────────

router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await query<Record<string, unknown>>(
      `SELECT
         a.id, a.status, a.applied_at, a.notes, a.application_url,
         j.title AS job_title, c.display_name AS company,
         js.name AS source,
         COALESCE(latest_score.score, 0) AS score,
         d.id AS resume_id, d.title AS resume_title
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       JOIN companies c ON c.id = j.company_id
       LEFT JOIN job_sources js ON js.id = j.source_id
       LEFT JOIN documents d ON d.id = a.resume_document_id
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
    }

    res.json({ message: "Application updated." });
  } catch (err) {
    console.error("[applications/update]", err);
    res.status(500).json({ message: "Failed to update application." });
  }
});

export default router;
