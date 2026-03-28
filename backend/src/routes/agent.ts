/**
 * /api/agent — Autonomous Job Agent routes
 *
 * Search Profiles  GET/POST /profiles, PUT/DELETE /profiles/:id, POST /profiles/:id/run
 * Connectors       GET /connectors, PUT /connectors/:connector
 * Results          GET /results, PATCH /results/:id/status
 * Import           POST /import
 * Runs             GET /runs
 */
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { pool } from "../db/pool";
import { runPipeline, PipelineProfile } from "../services/pipeline";

const router = Router();
router.use(requireAuth);

/* ═══════════════════════════ Search Profiles ══════════════════════════════ */

// GET /api/agent/profiles
router.get("/profiles", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT sp.*,
              (SELECT COUNT(*) FROM job_matches jm WHERE jm.profile_id = sp.id) AS total_matches,
              (SELECT COUNT(*) FROM job_matches jm WHERE jm.profile_id = sp.id AND jm.match_tier = 'strong') AS strong_matches
       FROM search_profiles sp
       WHERE sp.user_id = $1
       ORDER BY sp.created_at DESC`,
      [req.userId]
    );
    res.json(rows.map(toProfile));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load profiles." });
  }
});

// POST /api/agent/profiles
router.post("/profiles", async (req, res) => {
  const b = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO search_profiles (
        user_id, name, job_titles, locations, remote_only, include_nearby,
        salary_min, salary_max, experience_levels,
        must_have_keywords, nice_to_have_keywords,
        excluded_companies, included_companies, company_sizes,
        sources, search_mode, score_threshold, auto_resume, schedule, is_active
      ) VALUES ($1,$2,$3::text[],$4::text[],$5,$6,$7,$8,$9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::text[],$16,$17,$18,$19,$20)
      RETURNING *`,
      [
        req.userId,
        b.name ?? "Untitled Profile",
        b.jobTitles ?? [],
        b.locations ?? [],
        b.remoteOnly ?? false,
        b.includeNearby ?? false,
        b.salaryMin ?? null,
        b.salaryMax ?? null,
        b.experienceLevels ?? [],
        b.mustHaveKeywords ?? [],
        b.niceToHaveKeywords ?? [],
        b.excludedCompanies ?? [],
        b.includedCompanies ?? [],
        b.companySizes ?? [],
        b.sources ?? ["greenhouse", "lever"],
        b.searchMode ?? "balanced",
        b.scoreThreshold ?? 70,
        b.autoResume ?? false,
        b.schedule ?? "daily",
        b.isActive ?? true,
      ]
    );
    res.status(201).json(toProfile(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create profile." });
  }
});

// PUT /api/agent/profiles/:id
router.put("/profiles/:id", async (req, res) => {
  const b = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE search_profiles SET
        name = COALESCE($3, name),
        job_titles = COALESCE($4::text[], job_titles),
        locations = COALESCE($5::text[], locations),
        remote_only = COALESCE($6, remote_only),
        include_nearby = COALESCE($7, include_nearby),
        salary_min = $8,
        salary_max = $9,
        experience_levels = COALESCE($10::text[], experience_levels),
        must_have_keywords = COALESCE($11::text[], must_have_keywords),
        nice_to_have_keywords = COALESCE($12::text[], nice_to_have_keywords),
        excluded_companies = COALESCE($13::text[], excluded_companies),
        included_companies = COALESCE($14::text[], included_companies),
        company_sizes = COALESCE($15::text[], company_sizes),
        sources = COALESCE($16::text[], sources),
        search_mode = COALESCE($17, search_mode),
        score_threshold = COALESCE($18, score_threshold),
        auto_resume = COALESCE($19, auto_resume),
        schedule = COALESCE($20, schedule),
        is_active = COALESCE($21, is_active),
        updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [
        req.params.id, req.userId,
        b.name ?? null,
        b.jobTitles ?? null,
        b.locations ?? null,
        b.remoteOnly ?? null,
        b.includeNearby ?? null,
        b.salaryMin ?? null,
        b.salaryMax ?? null,
        b.experienceLevels ?? null,
        b.mustHaveKeywords ?? null,
        b.niceToHaveKeywords ?? null,
        b.excludedCompanies ?? null,
        b.includedCompanies ?? null,
        b.companySizes ?? null,
        b.sources ?? null,
        b.searchMode ?? null,
        b.scoreThreshold ?? null,
        b.autoResume ?? null,
        b.schedule ?? null,
        b.isActive ?? null,
      ]
    );
    if (!rows[0]) return res.status(404).json({ message: "Profile not found." });
    res.json(toProfile(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update profile." });
  }
});

// DELETE /api/agent/profiles/:id
router.delete("/profiles/:id", async (req, res) => {
  await pool.query(
    `DELETE FROM search_profiles WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.userId]
  );
  res.json({ ok: true });
});

// POST /api/agent/profiles/:id/run — manual trigger
router.post("/profiles/:id/run", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM search_profiles WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    );
    if (!rows[0]) return res.status(404).json({ message: "Profile not found." });
    const row = rows[0];

    const profile: PipelineProfile = {
      id: row.id,
      userId: row.user_id,
      jobTitles: row.job_titles ?? [],
      locations: row.locations ?? [],
      remoteOnly: row.remote_only,
      salaryMin: row.salary_min,
      salaryMax: row.salary_max,
      mustHaveKeywords: row.must_have_keywords ?? [],
      niceToHaveKeywords: row.nice_to_have_keywords ?? [],
      excludedCompanies: row.excluded_companies ?? [],
      sources: row.sources ?? ["greenhouse", "lever"],
      searchMode: row.search_mode ?? "balanced",
      scoreThreshold: row.score_threshold ?? 70,
      autoResume: row.auto_resume ?? false,
    };

    // Create run log
    const { rows: [run] } = await pool.query<{ id: string }>(
      `INSERT INTO agent_runs (user_id, profile_id, trigger, status)
       VALUES ($1, $2, 'manual', 'running') RETURNING id`,
      [req.userId, profile.id]
    );

    // Run pipeline (async — return immediately with runId)
    setImmediate(async () => {
      try {
        const result = await runPipeline(profile);
        await pool.query(
          `UPDATE agent_runs SET status='completed', jobs_found=$2, jobs_new=$3,
           jobs_scored=$4, strong_matches=$5, completed_at=now() WHERE id=$1`,
          [run.id, result.found, result.newJobs, result.scored, result.strongMatches]
        );
        await pool.query(
          `UPDATE search_profiles SET last_run_at=now(), updated_at=now() WHERE id=$1`,
          [profile.id]
        );
      } catch (err) {
        await pool.query(
          `UPDATE agent_runs SET status='failed', error=$2, completed_at=now() WHERE id=$1`,
          [run.id, (err as Error).message]
        ).catch(() => {});
      }
    });

    res.json({ runId: run.id, message: "Run started." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to start run." });
  }
});

/* ═══════════════════════════ Connector Configs ═══════════════════════════ */

// GET /api/agent/connectors
router.get("/connectors", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM connector_configs WHERE user_id = $1 ORDER BY connector`,
      [req.userId]
    );
    res.json(rows.map(toConnector));
  } catch {
    res.status(500).json({ message: "Failed to load connectors." });
  }
});

// PUT /api/agent/connectors/:connector
router.put("/connectors/:connector", async (req, res) => {
  const { connector } = req.params;
  const { isActive, config } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO connector_configs (user_id, connector, is_active, config)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, connector) DO UPDATE
         SET is_active = $3, config = $4, updated_at = now()
       RETURNING *`,
      [req.userId, connector, isActive ?? false, JSON.stringify(config ?? {})]
    );
    res.json(toConnector(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to save connector." });
  }
});

/* ══════════════════════════════ Results ══════════════════════════════════ */

// GET /api/agent/results?tier=strong&status=new&profileId=...&limit=50&offset=0
router.get("/results", async (req, res) => {
  const { tier, status, profileId, limit = "50", offset = "0" } = req.query as Record<string, string>;

  const where: string[] = ["jm.user_id = $1"];
  const params: unknown[] = [req.userId];
  let i = 2;

  if (tier) { where.push(`jm.match_tier = $${i++}`); params.push(tier); }
  if (status) { where.push(`jm.status = $${i++}`); params.push(status); }
  if (profileId) { where.push(`jm.profile_id = $${i++}`); params.push(profileId); }

  try {
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM job_matches jm WHERE ${where.join(" AND ")}`,
      params
    );

    params.push(parseInt(limit), parseInt(offset));
    const { rows } = await pool.query(
      `SELECT jm.*,
              sp.name AS profile_name
       FROM job_matches jm
       LEFT JOIN search_profiles sp ON sp.id = jm.profile_id
       WHERE ${where.join(" AND ")}
       ORDER BY jm.ai_score DESC NULLS LAST, jm.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      params
    );

    res.json({ matches: rows.map(toMatch), total: parseInt(countRows[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load results." });
  }
});

// PATCH /api/agent/results/:id/status
router.patch("/results/:id/status", async (req, res) => {
  const { status } = req.body;
  const valid = ["new", "viewed", "saved", "applied", "dismissed"];
  if (!valid.includes(status)) return res.status(400).json({ message: "Invalid status." });

  try {
    await pool.query(
      `UPDATE job_matches SET status = $3, updated_at = now()
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId, status]
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ message: "Failed to update status." });
  }
});

/* ══════════════════════════════ Import ═══════════════════════════════════ */

// POST /api/agent/import — manual job import (from extension or paste)
router.post("/import", async (req, res) => {
  const { title, company, sourceUrl, source = "manual", description, location, remote } = req.body;
  if (!title) return res.status(400).json({ message: "title is required." });

  try {
    const externalId = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { rows } = await pool.query(
      `INSERT INTO job_matches (
        user_id, external_id, source, source_url, title, company,
        location, remote, description, match_tier, scored_at, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'new',now(),'new')
      RETURNING *`,
      [req.userId, externalId, source, sourceUrl ?? null, title, company ?? null,
       location ?? null, remote ?? false, description ?? null]
    );
    res.status(201).json(toMatch(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to import job." });
  }
});

/* ══════════════════════════════ Runs ════════════════════════════════════ */

// GET /api/agent/runs
router.get("/runs", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ar.*, sp.name AS profile_name
       FROM agent_runs ar
       LEFT JOIN search_profiles sp ON sp.id = ar.profile_id
       WHERE ar.user_id = $1
       ORDER BY ar.started_at DESC
       LIMIT 50`,
      [req.userId]
    );
    res.json(rows.map(toRun));
  } catch {
    res.status(500).json({ message: "Failed to load runs." });
  }
});

/* ═════════════════════════ Row mappers ════════════════════════════════════ */

function toProfile(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    jobTitles: r.job_titles,
    locations: r.locations,
    remoteOnly: r.remote_only,
    includeNearby: r.include_nearby,
    salaryMin: r.salary_min,
    salaryMax: r.salary_max,
    experienceLevels: r.experience_levels,
    mustHaveKeywords: r.must_have_keywords,
    niceToHaveKeywords: r.nice_to_have_keywords,
    excludedCompanies: r.excluded_companies,
    includedCompanies: r.included_companies,
    companySizes: r.company_sizes,
    sources: r.sources,
    searchMode: r.search_mode,
    scoreThreshold: r.score_threshold,
    autoResume: r.auto_resume,
    schedule: r.schedule,
    isActive: r.is_active,
    lastRunAt: r.last_run_at,
    nextRunAt: r.next_run_at,
    createdAt: r.created_at,
    totalMatches: r.total_matches ? parseInt(r.total_matches as string) : 0,
    strongMatches: r.strong_matches ? parseInt(r.strong_matches as string) : 0,
  };
}

function toMatch(r: Record<string, unknown>) {
  return {
    id: r.id,
    profileId: r.profile_id,
    profileName: r.profile_name,
    externalId: r.external_id,
    source: r.source,
    sourceUrl: r.source_url,
    title: r.title,
    company: r.company,
    location: r.location,
    remote: r.remote,
    jobType: r.job_type,
    description: r.description,
    salaryMin: r.salary_min,
    salaryMax: r.salary_max,
    requirements: r.requirements,
    aiScore: r.ai_score,
    scoreBreakdown: r.score_breakdown,
    matchTier: r.match_tier,
    scoredAt: r.scored_at,
    status: r.status,
    resumeGenerated: r.resume_generated,
    notes: r.notes,
    postedAt: r.posted_at,
    createdAt: r.created_at,
  };
}

function toConnector(r: Record<string, unknown>) {
  return {
    connector: r.connector,
    isActive: r.is_active,
    config: r.config,
    lastSyncAt: r.last_sync_at,
    lastError: r.last_error,
    jobCount: r.job_count,
  };
}

function toRun(r: Record<string, unknown>) {
  return {
    id: r.id,
    profileId: r.profile_id,
    profileName: r.profile_name,
    trigger: r.trigger,
    status: r.status,
    jobsFound: r.jobs_found,
    jobsNew: r.jobs_new,
    jobsScored: r.jobs_scored,
    strongMatches: r.strong_matches,
    error: r.error,
    startedAt: r.started_at,
    completedAt: r.completed_at,
  };
}

export default router;
