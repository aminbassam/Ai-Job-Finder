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
import { fetchImportedJobDetails } from "../services/import-metadata";
import { buildAiPreferenceNotes, buildAiSystemPrompt, getGlobalAiSettings } from "../services/ai-global-settings";
import { getDefaultMasterResumeContext } from "../services/master-resume";
import { scoreJobWithAi } from "../services/ai-scorer";
import { markdownToPlainText, renderResumeHtml } from "../services/resume-renderer";
import { decrypt } from "../utils/encryption";

const router = Router();
router.use(requireAuth);

const DEFAULT_SOURCES = ["greenhouse", "lever", "google"];
const VALID_SCHEDULES = new Set(["6h", "daily", "weekdays", "custom", "manual"]);

function isPlaceholderImportTitle(value: unknown): boolean {
  if (typeof value !== "string") return true;
  const title = value.trim();
  if (!title) return true;
  return /^(LinkedIn Job|Indeed Job|Greenhouse Job|Lever Job|Ashby Job|Workday Job|Job at )/i.test(title);
}

function isPlaceholderCompany(value: unknown): boolean {
  if (typeof value !== "string") return true;
  const company = value.trim();
  if (!company) return true;
  return /listing$/i.test(company) || /^(Indeed|LinkedIn|Greenhouse|Lever|Ashby|Workday)$/i.test(company);
}

function normalizeTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function normalizeOptionalNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nextRunAt(schedule: unknown, scheduleIntervalMinutes: unknown, isActive: unknown): Date | null {
  if (!isActive) return null;

  const normalizedSchedule =
    typeof schedule === "string" && VALID_SCHEDULES.has(schedule) ? schedule : "daily";

  if (normalizedSchedule === "manual") {
    return null;
  }

  const now = new Date();
  if (normalizedSchedule === "6h") {
    return new Date(now.getTime() + 6 * 60 * 60 * 1000);
  }
  if (normalizedSchedule === "custom") {
    const minutes = Math.max(normalizeOptionalNumber(scheduleIntervalMinutes) ?? 60, 15);
    return new Date(now.getTime() + minutes * 60 * 1000);
  }

  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(8, 0, 0, 0);

  if (normalizedSchedule === "weekdays") {
    while (next.getDay() === 0 || next.getDay() === 6) {
      next.setDate(next.getDate() + 1);
    }
  }

  return next;
}

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
    const schedule = typeof b.schedule === "string" && VALID_SCHEDULES.has(b.schedule) ? b.schedule : "daily";
    const isActive = b.isActive ?? true;
    const scheduleIntervalMinutes =
      schedule === "custom" ? normalizeOptionalNumber(b.scheduleIntervalMinutes) ?? 60 : null;
    const nextRun = nextRunAt(schedule, scheduleIntervalMinutes, isActive);
    const { rows } = await pool.query(
      `INSERT INTO search_profiles (
        user_id, name, job_titles, locations, remote_only, include_nearby,
        salary_min, salary_max, experience_levels,
        job_types, posted_within_days, schedule_interval_minutes,
        must_have_keywords, nice_to_have_keywords,
        excluded_companies, included_companies, company_sizes,
        sources, search_mode, score_threshold, auto_resume, schedule, is_active, next_run_at
      ) VALUES ($1,$2,$3::text[],$4::text[],$5,$6,$7,$8,$9::text[],$10::text[],$11,$12,$13::text[],$14::text[],$15::text[],$16::text[],$17::text[],$18::text[],$19,$20,$21,$22,$23,$24)
      RETURNING *`,
      [
        req.userId,
        b.name ?? "Untitled Profile",
        normalizeTextList(b.jobTitles),
        normalizeTextList(b.locations),
        b.remoteOnly ?? false,
        b.includeNearby ?? false,
        normalizeOptionalNumber(b.salaryMin),
        normalizeOptionalNumber(b.salaryMax),
        normalizeTextList(b.experienceLevels),
        normalizeTextList(b.jobTypes),
        normalizeOptionalNumber(b.postedWithinDays),
        scheduleIntervalMinutes,
        normalizeTextList(b.mustHaveKeywords),
        normalizeTextList(b.niceToHaveKeywords),
        normalizeTextList(b.excludedCompanies),
        normalizeTextList(b.includedCompanies),
        normalizeTextList(b.companySizes),
        normalizeTextList(b.sources).length > 0 ? normalizeTextList(b.sources) : DEFAULT_SOURCES,
        b.searchMode ?? "balanced",
        b.scoreThreshold ?? 70,
        b.autoResume ?? false,
        schedule,
        isActive,
        nextRun,
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
    const { rows: currentRows } = await pool.query(
      `SELECT *
       FROM search_profiles
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    );
    if (!currentRows[0]) return res.status(404).json({ message: "Profile not found." });

    const current = currentRows[0];
    const incomingSchedule =
      typeof b.schedule === "string" && VALID_SCHEDULES.has(b.schedule) ? b.schedule : null;
    const incomingIsActive =
      typeof b.isActive === "boolean" ? b.isActive : null;
    const incomingScheduleIntervalMinutes =
      incomingSchedule === "custom"
        ? normalizeOptionalNumber(b.scheduleIntervalMinutes)
        : Object.prototype.hasOwnProperty.call(b, "scheduleIntervalMinutes")
          ? normalizeOptionalNumber(b.scheduleIntervalMinutes)
          : null;

    const resolvedName = typeof b.name === "string" ? b.name : current.name;
    const resolvedJobTitles = Object.prototype.hasOwnProperty.call(b, "jobTitles")
      ? normalizeTextList(b.jobTitles)
      : current.job_titles;
    const resolvedLocations = Object.prototype.hasOwnProperty.call(b, "locations")
      ? normalizeTextList(b.locations)
      : current.locations;
    const resolvedRemoteOnly =
      typeof b.remoteOnly === "boolean" ? b.remoteOnly : current.remote_only;
    const resolvedIncludeNearby =
      typeof b.includeNearby === "boolean" ? b.includeNearby : current.include_nearby;
    const resolvedSalaryMin = Object.prototype.hasOwnProperty.call(b, "salaryMin")
      ? normalizeOptionalNumber(b.salaryMin)
      : current.salary_min;
    const resolvedSalaryMax = Object.prototype.hasOwnProperty.call(b, "salaryMax")
      ? normalizeOptionalNumber(b.salaryMax)
      : current.salary_max;
    const resolvedExperienceLevels = Object.prototype.hasOwnProperty.call(b, "experienceLevels")
      ? normalizeTextList(b.experienceLevels)
      : current.experience_levels;
    const resolvedJobTypes = Object.prototype.hasOwnProperty.call(b, "jobTypes")
      ? normalizeTextList(b.jobTypes)
      : current.job_types;
    const resolvedPostedWithinDays = Object.prototype.hasOwnProperty.call(b, "postedWithinDays")
      ? normalizeOptionalNumber(b.postedWithinDays)
      : current.posted_within_days;
    const resolvedMustHaveKeywords = Object.prototype.hasOwnProperty.call(b, "mustHaveKeywords")
      ? normalizeTextList(b.mustHaveKeywords)
      : current.must_have_keywords;
    const resolvedNiceToHaveKeywords = Object.prototype.hasOwnProperty.call(b, "niceToHaveKeywords")
      ? normalizeTextList(b.niceToHaveKeywords)
      : current.nice_to_have_keywords;
    const resolvedExcludedCompanies = Object.prototype.hasOwnProperty.call(b, "excludedCompanies")
      ? normalizeTextList(b.excludedCompanies)
      : current.excluded_companies;
    const resolvedIncludedCompanies = Object.prototype.hasOwnProperty.call(b, "includedCompanies")
      ? normalizeTextList(b.includedCompanies)
      : current.included_companies;
    const resolvedCompanySizes = Object.prototype.hasOwnProperty.call(b, "companySizes")
      ? normalizeTextList(b.companySizes)
      : current.company_sizes;
    const resolvedSources = Object.prototype.hasOwnProperty.call(b, "sources")
      ? (normalizeTextList(b.sources).length > 0 ? normalizeTextList(b.sources) : DEFAULT_SOURCES)
      : current.sources;
    const resolvedSearchMode = typeof b.searchMode === "string" ? b.searchMode : current.search_mode;
    const resolvedScoreThreshold = b.scoreThreshold ?? current.score_threshold;
    const resolvedAutoResume =
      typeof b.autoResume === "boolean" ? b.autoResume : current.auto_resume;
    const resolvedSchedule = incomingSchedule ?? current.schedule;
    const resolvedIsActive = incomingIsActive ?? current.is_active;
    const resolvedScheduleIntervalMinutes =
      resolvedSchedule === "custom"
        ? incomingScheduleIntervalMinutes ?? current.schedule_interval_minutes ?? 60
        : resolvedSchedule === "manual"
          ? null
          : null;
    const resolvedNextRunAt = nextRunAt(
      resolvedSchedule,
      resolvedScheduleIntervalMinutes,
      resolvedIsActive
    );

    const { rows } = await pool.query(
      `UPDATE search_profiles SET
        name = $3,
        job_titles = $4::text[],
        locations = $5::text[],
        remote_only = $6,
        include_nearby = $7,
        salary_min = $8,
        salary_max = $9,
        experience_levels = $10::text[],
        job_types = $11::text[],
        posted_within_days = $12,
        schedule_interval_minutes = $13,
        must_have_keywords = $14::text[],
        nice_to_have_keywords = $15::text[],
        excluded_companies = $16::text[],
        included_companies = $17::text[],
        company_sizes = $18::text[],
        sources = $19::text[],
        search_mode = $20,
        score_threshold = $21,
        auto_resume = $22,
        schedule = $23,
        is_active = $24,
        next_run_at = $25,
        updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [
        req.params.id, req.userId,
        resolvedName,
        resolvedJobTitles,
        resolvedLocations,
        resolvedRemoteOnly,
        resolvedIncludeNearby,
        resolvedSalaryMin,
        resolvedSalaryMax,
        resolvedExperienceLevels,
        resolvedJobTypes,
        resolvedPostedWithinDays,
        resolvedScheduleIntervalMinutes,
        resolvedMustHaveKeywords,
        resolvedNiceToHaveKeywords,
        resolvedExcludedCompanies,
        resolvedIncludedCompanies,
        resolvedCompanySizes,
        resolvedSources,
        resolvedSearchMode,
        resolvedScoreThreshold,
        resolvedAutoResume,
        resolvedSchedule,
        resolvedIsActive,
        resolvedNextRunAt,
      ]
    );
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
      jobTypes: row.job_types ?? [],
      postedWithinDays: row.posted_within_days,
      mustHaveKeywords: row.must_have_keywords ?? [],
      niceToHaveKeywords: row.nice_to_have_keywords ?? [],
      excludedCompanies: row.excluded_companies ?? [],
      sources: row.sources ?? DEFAULT_SOURCES,
      searchMode: row.search_mode ?? "balanced",
      scoreThreshold: row.score_threshold ?? 70,
      autoResume: row.auto_resume ?? false,
      schedule: row.schedule ?? "daily",
      scheduleIntervalMinutes: row.schedule_interval_minutes,
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
          `UPDATE search_profiles
           SET last_run_at = now(), next_run_at = $2, updated_at = now()
           WHERE id = $1`,
          [profile.id, nextRunAt(profile.schedule, profile.scheduleIntervalMinutes, profile.schedule !== "manual")]
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
              sp.name AS profile_name,
              rd.id AS resume_id,
              rd.title AS resume_title,
              rd.updated_at AS resume_updated_at,
              rd.resume_type AS resume_type
       FROM job_matches jm
       LEFT JOIN search_profiles sp ON sp.id = jm.profile_id
       LEFT JOIN LATERAL (
         SELECT d.id, d.title, d.updated_at, d.resume_type
         FROM documents d
         WHERE d.user_id = jm.user_id
           AND d.kind = 'resume'
           AND d.resume_type = 'tailored'
           AND d.metadata->>'jobMatchId' = jm.id::text
         ORDER BY d.updated_at DESC
         LIMIT 1
       ) rd ON true
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

// GET /api/agent/results/:id
router.get("/results/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT jm.*,
              sp.name AS profile_name,
              rd.id AS resume_id,
              rd.title AS resume_title,
              rd.updated_at AS resume_updated_at,
              rd.resume_type AS resume_type
       FROM job_matches jm
       LEFT JOIN search_profiles sp ON sp.id = jm.profile_id
       LEFT JOIN LATERAL (
         SELECT d.id, d.title, d.updated_at, d.resume_type
         FROM documents d
         WHERE d.user_id = jm.user_id
           AND d.kind = 'resume'
           AND d.resume_type = 'tailored'
           AND d.metadata->>'jobMatchId' = jm.id::text
         ORDER BY d.updated_at DESC
         LIMIT 1
       ) rd ON true
       WHERE jm.id = $1 AND jm.user_id = $2
       LIMIT 1`,
      [req.params.id, req.userId]
    );

    if (!rows[0]) {
      return res.status(404).json({ message: "Job not found." });
    }

    res.json(toMatch(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load job." });
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

// DELETE /api/agent/results/:id
router.delete("/results/:id", async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM job_matches
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    );

    if (!rowCount) {
      return res.status(404).json({ message: "Job not found." });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to delete job." });
  }
});

/* ══════════════════════════════ Import ═══════════════════════════════════ */

// POST /api/agent/import — manual job import (from extension or paste)
router.post("/import", async (req, res) => {
  const {
    title,
    company,
    sourceUrl,
    source = "manual",
    description,
    location,
    remote,
    externalId: clientExternalId,
  } = req.body;

  const imported =
    typeof sourceUrl === "string" && sourceUrl.trim()
      ? await fetchImportedJobDetails(sourceUrl.trim())
      : null;

  // Auto-generate title from URL if not supplied
  let resolvedTitle =
    imported?.title && isPlaceholderImportTitle(title)
      ? imported.title
      : (title ?? "").trim() || (imported?.title ?? "");
  if (!resolvedTitle && sourceUrl) {
    try {
      const u = new URL(sourceUrl);
      const host = u.hostname.replace(/^www\./, "").replace(/^jobs\./, "").split(".")[0];
      resolvedTitle = `Job at ${host.charAt(0).toUpperCase()}${host.slice(1)}`;
    } catch {
      resolvedTitle = "Imported Job";
    }
  }
  if (!resolvedTitle) {
    return res.status(400).json({ message: "Provide a job title or a valid URL." });
  }

  const resolvedCompany =
    (imported?.company && isPlaceholderCompany(company) ? imported.company : undefined) ??
    (typeof company === "string" && company.trim() ? company.trim() : undefined) ??
    imported?.company ??
    null;
  const resolvedLocation =
    (typeof location === "string" && location.trim() ? location.trim() : undefined) ??
    imported?.location ??
    null;
  const resolvedDescription =
    (typeof description === "string" && description.trim() ? description.trim() : undefined) ??
    imported?.description ??
    null;
  const resolvedRemote =
    typeof remote === "boolean"
      ? remote
      : imported?.remote ?? false;
  const resolvedRequirements = imported?.requirements ?? [];
  const resolvedJobType = imported?.jobType ?? null;
  const resolvedSalaryMin = imported?.salaryMin ?? null;
  const resolvedSalaryMax = imported?.salaryMax ?? null;
  const resolvedPostedAt = imported?.postedAt ?? null;
  const resolvedSourceUrl = imported?.sourceUrl ?? sourceUrl ?? null;
  const rawData = imported?.rawData ?? {};

  // Use client-provided externalId for deduplication (e.g. indeed_jk, linkedin_jobid)
  // or fall back to a random unique string
  const externalId =
    typeof clientExternalId === "string" && clientExternalId.trim()
      ? clientExternalId.trim()
      : `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    const { rows } = await pool.query(
      `INSERT INTO job_matches (
        user_id, external_id, source, source_url, title, company,
        location, remote, job_type, description, requirements,
        salary_min, salary_max, posted_at, raw_data,
        match_tier, scored_at, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::text[],$12,$13,$14,$15,'new',now(),'new')
      ON CONFLICT (user_id, source, external_id) DO UPDATE
        SET source_url = EXCLUDED.source_url,
            title = COALESCE(NULLIF(job_matches.title, ''), EXCLUDED.title),
            company = COALESCE(job_matches.company, EXCLUDED.company),
            location = COALESCE(job_matches.location, EXCLUDED.location),
            remote = COALESCE(job_matches.remote, EXCLUDED.remote),
            job_type = COALESCE(job_matches.job_type, EXCLUDED.job_type),
            description = COALESCE(job_matches.description, EXCLUDED.description),
            requirements = CASE
              WHEN COALESCE(array_length(job_matches.requirements, 1), 0) = 0 THEN EXCLUDED.requirements
              ELSE job_matches.requirements
            END,
            salary_min = COALESCE(job_matches.salary_min, EXCLUDED.salary_min),
            salary_max = COALESCE(job_matches.salary_max, EXCLUDED.salary_max),
            posted_at = COALESCE(job_matches.posted_at, EXCLUDED.posted_at),
            raw_data = CASE
              WHEN COALESCE(job_matches.raw_data, '{}'::jsonb) = '{}'::jsonb THEN EXCLUDED.raw_data
              ELSE job_matches.raw_data || EXCLUDED.raw_data
            END,
            updated_at = now()
      RETURNING *`,
      [
        req.userId,
        externalId,
        source,
        resolvedSourceUrl,
        resolvedTitle,
        resolvedCompany,
        resolvedLocation,
        resolvedRemote,
        resolvedJobType,
        resolvedDescription,
        resolvedRequirements,
        resolvedSalaryMin,
        resolvedSalaryMax,
        resolvedPostedAt,
        JSON.stringify(rawData),
      ]
    );
    const saved = rows[0];
    // Respond immediately — AI scoring runs in the background
    res.status(201).json(toMatch(saved));

    // ── Background AI scoring ──────────────────────────────────────────────
    setImmediate(async () => {
      try {
        const outcome = await scoreJobWithAi(req.userId!, {
          title: saved.title,
          company: saved.company,
          description: saved.description,
          requirements: saved.requirements,
          location: saved.location,
          remote: saved.remote,
          jobType: saved.job_type,
          salaryMin: saved.salary_min,
          salaryMax: saved.salary_max,
        });
        if (!outcome.ok) {
          // Mark as scored-with-error so the UI stops polling and shows the message
          await pool.query(
            `UPDATE job_matches
             SET match_tier = 'new', score_breakdown = $2, scored_at = now(), updated_at = now()
             WHERE id = $1`,
            [saved.id, JSON.stringify({ error: outcome.error.message })]
          );
          console.warn(`[import] AI scoring failed for ${saved.id}: ${outcome.error.message}`);
          return;
        }
        const { result } = outcome;
        await pool.query(
          `UPDATE job_matches
           SET ai_score = $2, match_tier = $3, score_breakdown = $4,
               ai_summary = $5, scored_at = now(), updated_at = now()
           WHERE id = $1`,
          [
            saved.id,
            result.score,
            result.tier,
            JSON.stringify(result.breakdown),
            result.summary,
          ]
        );
        console.log(`[import] AI scored job ${saved.id}: ${result.score} (${result.tier})`);
      } catch (err) {
        console.error("[import] AI scoring failed:", (err as Error).message);
      }
    });
  } catch (err) {
    const msg = (err as Error).message;
    console.error("[import]", msg);
    res.status(500).json({ message: `Import failed: ${msg}` });
  }
});

/* ══════════════════════ Generate Resume ════════════════════════════════ */

// POST /api/agent/results/:id/generate-resume
router.post("/results/:id/generate-resume", async (req, res) => {
  const matchId = req.params.id;

  try {
    const globalAi = await getGlobalAiSettings(req.userId!);

    // 1. Fetch job_matches row
    const { rows: matchRows } = await pool.query(
      `SELECT * FROM job_matches WHERE id = $1 AND user_id = $2`,
      [matchId, req.userId]
    );
    if (!matchRows[0]) {
      return res.status(404).json({ message: "Job match not found." });
    }
    const job = matchRows[0] as Record<string, unknown>;

    // 2. Get user's connected OpenAI key
    const { rows: keyRows } = await pool.query<{
      encrypted_key: string;
      encryption_iv: string;
      encryption_tag: string;
      selected_model: string;
    }>(
      `SELECT encrypted_key, encryption_iv, encryption_tag, selected_model
       FROM ai_provider_connections
       WHERE user_id = $1 AND provider = 'openai' AND is_connected = true
       LIMIT 1`,
      [req.userId]
    );

    if (!keyRows[0]?.encrypted_key) {
      return res.status(400).json({ message: "No OpenAI API key connected." });
    }

    const apiKey = decrypt({
      encrypted: keyRows[0].encrypted_key,
      iv: keyRows[0].encryption_iv,
      tag: keyRows[0].encryption_tag,
    });
    const model = keyRows[0].selected_model ?? "gpt-4o-mini";

    // 3. Load resume_preferences + user_profiles + user_skills
    const { rows: prefRows } = await pool.query<Record<string, unknown>>(
      `SELECT target_roles, seniority_level, must_have_keywords, tools_technologies,
              soft_skills, industry_focus, key_achievements, certifications, executive_skills
       FROM resume_preferences WHERE user_id = $1`,
      [req.userId]
    );
    const prefs = prefRows[0] ?? {};

    const { rows: profileRows } = await pool.query<Record<string, unknown>>(
      `SELECT u.first_name, u.last_name, u.email, u.location_text,
              u.current_job_title, u.linkedin_url,
              up.professional_summary, up.years_experience,
              up.min_salary_usd, up.max_salary_usd,
              COALESCE(
                json_agg(us.skill_name ORDER BY us.years_experience DESC NULLS LAST)
                  FILTER (WHERE us.skill_name IS NOT NULL),
                '[]'
              ) AS skills
       FROM account_users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       LEFT JOIN user_skills us ON us.user_id = u.id
       WHERE u.id = $1
       GROUP BY u.id, u.first_name, u.last_name, u.email, u.location_text,
                u.current_job_title, u.linkedin_url,
                up.professional_summary, up.years_experience, up.min_salary_usd, up.max_salary_usd`,
      [req.userId]
    );
    const profile = profileRows[0] ?? {};

    // 4. Build resume generation prompt
    const candidateLines: string[] = [];
    const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
    if (fullName) candidateLines.push(`Full name: ${fullName}`);
    if (profile.email) candidateLines.push(`Email: ${profile.email}`);
    if (profile.location_text) candidateLines.push(`Location: ${profile.location_text}`);
    if (profile.current_job_title) candidateLines.push(`Current title: ${profile.current_job_title}`);
    if (profile.linkedin_url) candidateLines.push(`LinkedIn: ${profile.linkedin_url}`);
    if (profile.professional_summary) candidateLines.push(`Summary: ${profile.professional_summary}`);
    if (profile.years_experience) candidateLines.push(`Years of experience: ${profile.years_experience}`);
    if (profile.min_salary_usd || profile.max_salary_usd) {
      candidateLines.push(
        `Preferred salary range: ${profile.min_salary_usd ? `$${Math.round(Number(profile.min_salary_usd) / 1000)}k` : ""}${profile.min_salary_usd && profile.max_salary_usd ? " - " : ""}${profile.max_salary_usd ? `$${Math.round(Number(profile.max_salary_usd) / 1000)}k` : ""}`
      );
    }
    if (prefs.seniority_level) candidateLines.push(`Seniority level: ${prefs.seniority_level}`);
    if (Array.isArray(prefs.target_roles) && (prefs.target_roles as string[]).length > 0) {
      candidateLines.push(`Target roles: ${(prefs.target_roles as string[]).join(", ")}`);
    }
    if (Array.isArray(profile.skills) && (profile.skills as string[]).length > 0) {
      candidateLines.push(`Skills: ${(profile.skills as string[]).slice(0, 25).join(", ")}`);
    }
    if (Array.isArray(prefs.tools_technologies) && (prefs.tools_technologies as string[]).length > 0) {
      candidateLines.push(`Tools & technologies: ${(prefs.tools_technologies as string[]).join(", ")}`);
    }
    if (prefs.executive_skills) {
      candidateLines.push(`Executive skills: ${String(prefs.executive_skills).slice(0, 300)}`);
    }
    if (prefs.key_achievements) {
      candidateLines.push(`Key achievements: ${String(prefs.key_achievements).slice(0, 400)}`);
    }
    if (prefs.certifications) {
      candidateLines.push(`Certifications: ${String(prefs.certifications).slice(0, 200)}`);
    }
    if (Array.isArray(prefs.soft_skills) && (prefs.soft_skills as string[]).length > 0) {
      candidateLines.push(`Soft skills: ${(prefs.soft_skills as string[]).join(", ")}`);
    }
    const masterResumeContext = await getDefaultMasterResumeContext(req.userId!);
    if (masterResumeContext) {
      candidateLines.push(`Structured master resume context:\n${masterResumeContext.slice(0, 5000)}`);
    }
    candidateLines.push(...buildAiPreferenceNotes(globalAi));

    const reqList = Array.isArray(job.requirements)
      ? (job.requirements as string[]).slice(0, 12).map((r: string) => `- ${r}`).join("\n")
      : "";
    const desc = typeof job.description === "string"
      ? job.description.replace(/<[^>]+>/g, " ").slice(0, 1500)
      : "";

    const resumePrompt = `You are an expert resume writer. Generate a complete, ATS-optimized tailored resume in markdown format.

CANDIDATE PROFILE:
${candidateLines.join("\n")}

TARGET JOB:
Title: ${job.title}
Company: ${job.company ?? ""}
Location: ${job.location ?? ""}
Description: ${desc}
Requirements:
${reqList}

Instructions:
- Use the candidate profile details exactly as provided for the resume header/contact section
- Write a tailored professional summary (3-4 sentences) for THIS specific role
- List the most relevant skills prominently
- Use keywords directly from the job description
- Format experience bullets with impact/metrics
- Make every section directly relevant to the job
- Output clean markdown with sections: Header, Professional Summary, Core Skills, Professional Experience (use candidate's actual experience from profile and structured master resume context when available), Education (placeholder if not provided), Certifications
- Use only markdown headings, plain paragraphs, and bullet lists
- Do not use tables, code fences, or HTML
- If profile data is missing, leave that field out instead of inventing it

Return ONLY the markdown resume, no explanation.`;

    // 5. Call OpenAI
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: buildAiSystemPrompt(
              "You are an expert resume writer. Return only clean markdown.",
              globalAi
            ),
          },
          { role: "user", content: resumePrompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!aiRes.ok) {
      const errBody = await aiRes.text().catch(() => "");
      console.error("[generate-resume] OpenAI error:", aiRes.status, errBody);
      return res.status(502).json({ message: `OpenAI returned ${aiRes.status}.` });
    }

    const aiData = await aiRes.json() as { choices?: { message?: { content?: string } }[] };
    const rawMarkdown = aiData.choices?.[0]?.message?.content?.trim() ?? "";

    if (!rawMarkdown) {
      return res.status(502).json({ message: "AI returned an empty resume. Please try again." });
    }

    // 6. Save to documents table
    const docTitle = `Tailored Resume — ${job.title} at ${job.company ?? "Unknown"}`;
    const contentText = markdownToPlainText(rawMarkdown);
    const contentHtml = renderResumeHtml({
      title: docTitle,
      markdown: rawMarkdown,
      formatting: {
        titleFont: globalAi.resumeTitleFont,
        bodyFont: globalAi.resumeBodyFont,
        accentColor: globalAi.resumeAccentColor,
        template: globalAi.resumeTemplate,
        density: globalAi.resumeDensity,
      },
    });
    const metadata = JSON.stringify({
      jobMatchId: matchId,
      jobTitle: job.title,
      company: job.company,
      aiScore: job.ai_score,
      tier: job.match_tier,
      formatting: {
        titleFont: globalAi.resumeTitleFont,
        bodyFont: globalAi.resumeBodyFont,
        accentColor: globalAi.resumeAccentColor,
        template: globalAi.resumeTemplate,
        density: globalAi.resumeDensity,
      },
    });

    const { rows: docRows } = await pool.query(
      `INSERT INTO documents (user_id, kind, resume_type, origin, title, content_text, content_html, metadata)
       VALUES ($1, 'resume', 'tailored', 'ai_generated', $2, $3, $4, $5::jsonb)
       RETURNING id`,
      [req.userId, docTitle, contentText, contentHtml, metadata]
    );
    const documentId = docRows[0].id as string;

    await pool.query(
      `INSERT INTO document_versions (document_id, version_no, content_text, content_html)
       VALUES ($1, 1, $2, $3)`,
      [documentId, contentText, contentHtml]
    );

    // 7. Mark resume_generated on the job match
    await pool.query(
      `UPDATE job_matches SET resume_generated = true, updated_at = now() WHERE id = $1`,
      [matchId]
    );

    res.json({
      documentId,
      title: docTitle,
      resume: {
        id: documentId,
        title: docTitle,
        lastModified: new Date().toISOString(),
        resumeType: "tailored",
      },
      message: "Resume generated and attached to this job.",
    });
  } catch (err) {
    console.error("[generate-resume]", (err as Error).message);
    res.status(500).json({ message: `Failed to generate resume: ${(err as Error).message}` });
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
    jobTypes: r.job_types,
    postedWithinDays: r.posted_within_days,
    scheduleIntervalMinutes: r.schedule_interval_minutes,
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
    aiSummary: r.ai_summary,
    scoreBreakdown: r.score_breakdown,
    matchTier: r.match_tier,
    scoredAt: r.scored_at,
    status: r.status,
    resumeGenerated: r.resume_generated,
    linkedResume: r.resume_id ? {
      id: r.resume_id,
      title: r.resume_title,
      lastModified: r.resume_updated_at,
      resumeType: r.resume_type,
    } : undefined,
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
