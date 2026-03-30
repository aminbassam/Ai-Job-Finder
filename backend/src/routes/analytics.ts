import { Router, Request, Response } from "express";
import { query } from "../db/pool";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

function parseCount(value: string | undefined) {
  return Number.parseInt(value ?? "0", 10) || 0;
}

// ── GET /api/analytics/dashboard ─────────────────────────────────────────────

router.get("/dashboard", async (req: Request, res: Response): Promise<void> => {
  const uid = req.userId;

  try {
    const [jobsToday, highMatch, resumesGenerated, applicationsSent] = await Promise.all([
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM job_matches
         WHERE user_id = $1 AND created_at >= CURRENT_DATE`,
        [uid]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM job_matches
         WHERE user_id = $1
           AND COALESCE(ai_score, 0) >= 70`,
        [uid]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM documents
         WHERE user_id = $1
           AND kind = 'resume'
           AND resume_type = 'tailored'`,
        [uid]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM job_matches
         WHERE user_id = $1
           AND status = 'applied'`,
        [uid]
      ),
    ]);

    res.json({
      jobsFoundToday: parseCount(jobsToday[0]?.count),
      highMatchJobs: parseCount(highMatch[0]?.count),
      resumesGenerated: parseCount(resumesGenerated[0]?.count),
      applicationsSent: parseCount(applicationsSent[0]?.count),
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
      `SELECT
         date_trunc('week', created_at)::date::text AS week_start,
         COUNT(*)::text AS jobs_found
       FROM job_matches
       WHERE user_id = $1
       GROUP BY date_trunc('week', created_at)::date
       ORDER BY date_trunc('week', created_at)::date DESC
       LIMIT 8`,
      [req.userId]
    );

    const data = rows.reverse().map((row, index) => ({
      week: `Week ${index + 1}`,
      jobs: parseCount(row.jobs_found),
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
      `SELECT
         COALESCE(NULLIF(source, ''), 'Unknown') AS source_name,
         COUNT(*)::text AS jobs_found,
         ROUND(AVG(COALESCE(ai_score, 0))::numeric, 2)::text AS avg_match_score
       FROM job_matches
       WHERE user_id = $1
       GROUP BY COALESCE(NULLIF(source, ''), 'Unknown')
       ORDER BY COUNT(*) DESC, source_name ASC`,
      [req.userId]
    );

    res.json(rows.map((row) => ({
      source: row.source_name,
      jobs: parseCount(row.jobs_found),
      avgScore: Number.parseFloat(row.avg_match_score ?? "0") || 0,
    })));
  } catch (err) {
    console.error("[analytics/source-performance]", err);
    res.status(500).json({ message: "Failed to fetch source performance." });
  }
});

// ── GET /api/analytics/funnel ────────────────────────────────────────────────

router.get("/funnel", async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await query<{ stage: string; total: string }>(
      `SELECT 'Jobs Found'::text AS stage, COUNT(*)::text AS total
       FROM job_matches
       WHERE user_id = $1
       UNION ALL
       SELECT 'High Match'::text AS stage, COUNT(*)::text AS total
       FROM job_matches
       WHERE user_id = $1
         AND COALESCE(ai_score, 0) >= 70
       UNION ALL
       SELECT 'Applied'::text AS stage, COUNT(*)::text AS total
       FROM job_matches
       WHERE user_id = $1
         AND status = 'applied'
       UNION ALL
       SELECT 'Interview'::text AS stage, COUNT(*)::text AS total
       FROM applications
       WHERE user_id = $1
         AND status IN ('interview', 'offer', 'accepted')
       UNION ALL
       SELECT 'Offer'::text AS stage, COUNT(*)::text AS total
       FROM applications
       WHERE user_id = $1
         AND status IN ('offer', 'accepted')`,
      [req.userId]
    );

    const order = ["Jobs Found", "High Match", "Applied", "Interview", "Offer"];
    const map = Object.fromEntries(rows.map((row) => [row.stage, parseCount(row.total)]));

    res.json(order.map((stage) => ({
      stage,
      count: map[stage] ?? 0,
    })));
  } catch (err) {
    console.error("[analytics/funnel]", err);
    res.status(500).json({ message: "Failed to fetch funnel data." });
  }
});

// ── GET /api/analytics/score-distribution ────────────────────────────────────

router.get("/score-distribution", async (req: Request, res: Response): Promise<void> => {
  try {
    const [row] = await query<{
      bucket_90_100: string;
      bucket_80_89: string;
      bucket_70_79: string;
      bucket_60_69: string;
      bucket_below_60: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE COALESCE(ai_score, 0) >= 90)::text AS bucket_90_100,
         COUNT(*) FILTER (
           WHERE COALESCE(ai_score, 0) >= 80
             AND COALESCE(ai_score, 0) < 90
         )::text AS bucket_80_89,
         COUNT(*) FILTER (
           WHERE COALESCE(ai_score, 0) >= 70
             AND COALESCE(ai_score, 0) < 80
         )::text AS bucket_70_79,
         COUNT(*) FILTER (
           WHERE COALESCE(ai_score, 0) >= 60
             AND COALESCE(ai_score, 0) < 70
         )::text AS bucket_60_69,
         COUNT(*) FILTER (WHERE COALESCE(ai_score, 0) < 60)::text AS bucket_below_60
       FROM job_matches
       WHERE user_id = $1`,
      [req.userId]
    );

    res.json([
      { range: "90-100", count: parseCount(row?.bucket_90_100) },
      { range: "80-89", count: parseCount(row?.bucket_80_89) },
      { range: "70-79", count: parseCount(row?.bucket_70_79) },
      { range: "60-69", count: parseCount(row?.bucket_60_69) },
      { range: "<60", count: parseCount(row?.bucket_below_60) },
    ]);
  } catch (err) {
    console.error("[analytics/score-distribution]", err);
    res.status(500).json({ message: "Failed to fetch score distribution." });
  }
});

export default router;
