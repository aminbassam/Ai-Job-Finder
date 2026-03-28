import { Router, Request, Response } from "express";
import { query } from "../db/pool";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// ── GET /api/analytics/dashboard ─────────────────────────────────────────────

router.get("/dashboard", async (req: Request, res: Response): Promise<void> => {
  const uid = req.userId;

  try {
    const [jobsToday, highMatch, resumesGenerated, applicationsSent] = await Promise.all([
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM user_job_states
         WHERE user_id = $1 AND created_at >= CURRENT_DATE`,
        [uid]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM (
           SELECT DISTINCT job_id FROM job_score_runs
           WHERE user_id = $1 AND score >= 70
         ) sq`,
        [uid]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM documents
         WHERE user_id = $1 AND kind = 'resume' AND resume_type = 'tailored'`,
        [uid]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM applications
         WHERE user_id = $1 AND status NOT IN ('draft')`,
        [uid]
      ),
    ]);

    res.json({
      jobsFoundToday:   parseInt(jobsToday[0]?.count ?? "0", 10),
      highMatchJobs:    parseInt(highMatch[0]?.count ?? "0", 10),
      resumesGenerated: parseInt(resumesGenerated[0]?.count ?? "0", 10),
      applicationsSent: parseInt(applicationsSent[0]?.count ?? "0", 10),
    });
  } catch (err) {
    console.error("[analytics/dashboard]", err);
    res.status(500).json({ message: "Failed to fetch dashboard stats." });
  }
});

// ── GET /api/analytics/jobs-per-week ─────────────────────────────────────────

router.get("/jobs-per-week", async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await query<{ week_start: string; jobs_found: string }>(
      `SELECT week_start::text, jobs_found::text
       FROM analytics_jobs_per_week
       WHERE user_id = $1
       ORDER BY week_start DESC
       LIMIT 8`,
      [req.userId]
    );
    const data = rows.reverse().map((r, i) => ({
      week: `Week ${i + 1}`,
      jobs: parseInt(r.jobs_found, 10),
    }));
    res.json(data);
  } catch (err) {
    console.error("[analytics/jobs-per-week]", err);
    res.status(500).json({ message: "Failed to fetch jobs per week." });
  }
});

// ── GET /api/analytics/source-performance ────────────────────────────────────

router.get("/source-performance", async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await query<{ source_name: string; jobs_found: string; avg_match_score: string }>(
      `SELECT source_name, jobs_found::text, COALESCE(avg_match_score, 0)::text AS avg_match_score
       FROM analytics_source_performance
       WHERE user_id = $1`,
      [req.userId]
    );
    const data = rows.map((r) => ({
      source: r.source_name,
      jobs: parseInt(r.jobs_found, 10),
      avgScore: parseFloat(r.avg_match_score),
    }));
    res.json(data);
  } catch (err) {
    console.error("[analytics/source-performance]", err);
    res.status(500).json({ message: "Failed to fetch source performance." });
  }
});

// ── GET /api/analytics/funnel ────────────────────────────────────────────────

router.get("/funnel", async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await query<{ stage: string; total: string }>(
      `SELECT stage, total::text FROM analytics_application_funnel WHERE user_id = $1`,
      [req.userId]
    );

    const order = ["Jobs Found", "High Match", "Applied", "Interview", "Offer"];
    const map = Object.fromEntries(rows.map((r) => [r.stage, parseInt(r.total, 10)]));
    const data = order.map((stage) => ({ stage, count: map[stage] ?? 0 }));

    res.json(data);
  } catch (err) {
    console.error("[analytics/funnel]", err);
    res.status(500).json({ message: "Failed to fetch funnel data." });
  }
});

// ── GET /api/analytics/score-distribution ────────────────────────────────────

router.get("/score-distribution", async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await query<{ range: string; count: string }>(
      `SELECT
         CASE
           WHEN score >= 90 THEN '90-100'
           WHEN score >= 80 THEN '80-89'
           WHEN score >= 70 THEN '70-79'
           WHEN score >= 60 THEN '60-69'
           ELSE '<60'
         END AS range,
         COUNT(*)::text AS count
       FROM (
         SELECT DISTINCT ON (job_id) score
         FROM job_score_runs
         WHERE user_id = $1
         ORDER BY job_id, created_at DESC
       ) latest_scores
       GROUP BY range
       ORDER BY range DESC`,
      [req.userId]
    );
    res.json(rows.map((r) => ({ range: r.range, count: parseInt(r.count, 10) })));
  } catch (err) {
    console.error("[analytics/score-distribution]", err);
    res.status(500).json({ message: "Failed to fetch score distribution." });
  }
});

export default router;
