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
import { buildNormalizedJobMeta, normalizeJobType } from "../services/connectors/base";
import { buildAiPreferenceNotes, buildAiSystemPrompt, getGlobalAiSettings } from "../services/ai-global-settings";
import { getAiConnection, type AiProvider as ResumeAiProvider } from "../services/ai-client";
import {
  getAiResumeSourceContext,
  getMasterResumeProfiles,
  type MasterResumeProfileAggregate,
} from "../services/master-resume";
import { scoreJobWithAi } from "../services/ai-scorer";
import { markdownToPlainText, renderResumeHtml } from "../services/resume-renderer";
import { scoreMasterResume } from "../services/master-resume-score";

const router = Router();
router.use(requireAuth);

const DEFAULT_SOURCES = ["remotive", "arbeitnow"];

/* ─── Activity log helper ─────────────────────────────────────────────────── */

async function logActivity(
  userId: string,
  profileId: string | null,
  profileName: string,
  action: string,
  detail: Record<string, unknown> = {}
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO profile_activity_logs (user_id, profile_id, profile_name, action, detail)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, profileId, profileName, action, JSON.stringify(detail)]
    );
  } catch {
    // Non-critical — never let logging break the main flow
  }
}
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

function normalizeLimit(value: unknown, fallback: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function recommendResumeProfilesForJob(
  job: Record<string, unknown>,
  profiles: MasterResumeProfileAggregate[],
  limit: number
) {
  const aiProfiles = profiles.filter((profile) => profile.isActive && profile.useForAi);
  const activeProfiles = profiles.filter((profile) => profile.isActive);
  const candidateProfiles =
    (aiProfiles.length > 0 ? aiProfiles : activeProfiles.length > 0 ? activeProfiles : profiles).slice(0, 20);

  const jobTitle = typeof job.title === "string" ? job.title : "";
  const jobDescription = typeof job.description === "string" ? job.description : "";

  return candidateProfiles
    .map((profile) => {
      const score = scoreMasterResume({
        name: profile.name,
        targetRoles: profile.targetRoles,
        summary: profile.summary,
        experienceYears: profile.experienceYears,
        experiences: profile.experiences,
        skills: profile.skills,
        education: profile.education,
        projects: profile.projects,
        leadership: profile.leadership,
        jobTitle,
        jobDescription,
      });

      const fitScore = clampScore(
        score.atsScore * 0.35 +
        score.mqMatch.matchScore * 0.35 +
        score.impactScore * 0.15 +
        score.completenessScore * 0.15
      );

      return {
        id: profile.id,
        name: profile.name,
        summary: profile.summary ?? "",
        targetRoles: profile.targetRoles.slice(0, 3),
        fitScore,
        atsScore: score.atsScore,
        mqScore: score.mqMatch.matchScore,
        impactScore: score.impactScore,
        completenessScore: score.completenessScore,
        matchedSkills: score.mqMatch.matchedSkills.slice(0, 5),
        missingSkills: score.mqMatch.missingSkills.slice(0, 4),
        suggestions: score.suggestions.slice(0, 3),
        isDefault: profile.isDefault,
        useForAi: profile.useForAi,
      };
    })
    .sort((a, b) => b.fitScore - a.fitScore || b.atsScore - a.atsScore || a.name.localeCompare(b.name))
    .slice(0, limit);
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

async function getResumeAiConnection(userId: string, requestedProvider?: unknown) {
  return getAiConnection(
    userId,
    requestedProvider === "anthropic" || requestedProvider === "openai"
      ? requestedProvider
      : undefined
  );
}

async function runResumeGeneration(params: {
  provider: ResumeAiProvider;
  apiKey: string;
  model: string;
  systemPrompt: string;
  resumePrompt: string;
}): Promise<string> {
  if (params.provider === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": params.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: params.model,
        system: params.systemPrompt,
        max_tokens: 2000,
        temperature: 0.3,
        messages: [
          { role: "user", content: params.resumePrompt },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      throw new Error(`Anthropic returned ${response.status}. ${errBody.slice(0, 160)}`);
    }

    const data = await response.json() as { content?: Array<{ type?: string; text?: string }> };
    const content = data.content
      ?.filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text?.trim() ?? "")
      .filter(Boolean)
      .join("\n\n") ?? "";

    if (!content) {
      throw new Error("Anthropic returned an empty resume.");
    }
    return content;
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.resumePrompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(`OpenAI returned ${response.status}. ${errBody.slice(0, 160)}`);
  }

  const data = await response.json() as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) {
    throw new Error("OpenAI returned an empty resume.");
  }
  return content;
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
    const created = toProfile(rows[0]);
    await logActivity(req.userId!, created.id as string, created.name as string, "created", {
      sources: created.sources,
      schedule: created.schedule,
    });
    res.status(201).json(created);
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
    const updated = toProfile(rows[0]);
    // Determine what kind of change this was
    const isPauseResume = incomingIsActive !== null && Object.keys(b).length === 1 && Object.prototype.hasOwnProperty.call(b, "isActive");
    if (isPauseResume) {
      await logActivity(req.userId!, updated.id as string, updated.name as string,
        resolvedIsActive ? "resumed" : "paused", {});
    } else {
      await logActivity(req.userId!, updated.id as string, updated.name as string, "updated", {
        sources: updated.sources,
        schedule: updated.schedule,
      });
    }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update profile." });
  }
});

// DELETE /api/agent/profiles/:id
router.delete("/profiles/:id", async (req, res) => {
  const { rows } = await pool.query(
    `DELETE FROM search_profiles WHERE id = $1 AND user_id = $2 RETURNING name`,
    [req.params.id, req.userId]
  );
  if (rows[0]) {
    await logActivity(req.userId!, req.params.id, rows[0].name ?? "", "deleted", {});
  }
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
      experienceLevels: row.experience_levels ?? [],
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

    await logActivity(req.userId!, profile.id, row.name ?? "", "run_started", {
      runId: run.id, trigger: "manual", sources: profile.sources,
    });

    // Run pipeline (async — return immediately with runId)
    setImmediate(async () => {
      try {
        const result = await runPipeline(profile);

        // Check if cancelled before writing results
        const { rows: [runRow] } = await pool.query<{ status: string }>(
          `SELECT status FROM agent_runs WHERE id = $1`, [run.id]
        );
        if (runRow?.status === "cancelled") return;

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
        await logActivity(req.userId!, profile.id, row.name ?? "", "run_completed", {
          runId: run.id, jobsFound: result.found, jobsNew: result.newJobs,
          jobsScored: result.scored, strongMatches: result.strongMatches,
        });

        // AI-score each new job sequentially (rate-limit friendly).
        // Same flow as manual import — jobs start as match_tier='new' and get
        // updated to their real tier once OpenAI responds.
        for (const jobId of result.newJobIds) {
          // Stop scoring if run was cancelled
          const { rows: [check] } = await pool.query<{ status: string }>(
            `SELECT status FROM agent_runs WHERE id = $1`, [run.id]
          );
          if (check?.status === "cancelled") break;

          try {
            const { rows: [jobRow] } = await pool.query(
              `SELECT * FROM job_matches WHERE id = $1`, [jobId]
            );
            if (!jobRow) continue;

            const outcome = await scoreJobWithAi(profile.userId, {
              title:       jobRow.title,
              company:     jobRow.company,
              description: jobRow.description,
              requirements: jobRow.requirements,
              location:    jobRow.location,
              remote:      jobRow.remote,
              jobType:     jobRow.job_type,
              salaryMin:   jobRow.salary_min,
              salaryMax:   jobRow.salary_max,
              workArrangement: jobRow.raw_data?.jobMeta?.workArrangement,
              companyAddress: jobRow.raw_data?.jobMeta?.companyAddress,
              paymentType: jobRow.raw_data?.jobMeta?.paymentType,
              compensationText: jobRow.raw_data?.jobMeta?.compensationText,
              isContract: typeof jobRow.raw_data?.jobMeta?.isContract === "boolean" ? jobRow.raw_data.jobMeta.isContract : undefined,
            });

            if (outcome.ok) {
              const r = outcome.result;
              await pool.query(
                `UPDATE job_matches
                 SET ai_score=$2, ai_summary=$3, score_breakdown=$4,
                     match_tier=$5, scored_at=now()
                 WHERE id=$1`,
                [jobId, r.score, r.summary, JSON.stringify(r.breakdown), r.tier]
              );
            } else {
              await pool.query(
                `UPDATE job_matches
                 SET score_breakdown=$2, scored_at=now()
                 WHERE id=$1`,
                [jobId, JSON.stringify({ error: outcome.error.message })]
              );
            }
          } catch {
            // Skip individual job scoring failure — don't abort the loop
          }
        }
      } catch (err) {
        await pool.query(
          `UPDATE agent_runs SET status='failed', error=$2, completed_at=now() WHERE id=$1`,
          [run.id, (err as Error).message]
        ).catch(() => {});
        await logActivity(req.userId!, profile.id, row.name ?? "", "run_failed", {
          runId: run.id, error: (err as Error).message,
        });
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

    // Auto-seed free connectors as active defaults for new users
    if (rows.length === 0) {
      const freeDefaults = ["remotive", "arbeitnow"];
      await Promise.all(
        freeDefaults.map((connector) =>
          pool.query(
            `INSERT INTO connector_configs (user_id, connector, is_active, config)
             VALUES ($1, $2, true, '{}')
             ON CONFLICT (user_id, connector) DO NOTHING`,
            [req.userId, connector]
          )
        )
      );
      const { rows: seeded } = await pool.query(
        `SELECT * FROM connector_configs WHERE user_id = $1 ORDER BY connector`,
        [req.userId]
      );
      return res.json(seeded.map(toConnector));
    }

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

// GET /api/agent/results?tier=strong&status=new&profileId=...&source=extension&sort=recent&scoreMin=70&createdWithinHours=24&limit=50&offset=0
router.get("/results", async (req, res) => {
  const {
    tier,
    status,
    profileId,
    source,
    sort,
    scoreMin,
    scoreMax,
    createdWithinHours,
    limit = "50",
    offset = "0",
  } = req.query as Record<string, string>;

  const where: string[] = ["jm.user_id = $1"];
  const params: unknown[] = [req.userId];
  let i = 2;

  if (tier) { where.push(`jm.match_tier = $${i++}`); params.push(tier); }
  if (status) { where.push(`jm.status = $${i++}`); params.push(status); }
  if (profileId) { where.push(`jm.profile_id = $${i++}`); params.push(profileId); }
  if (source) { where.push(`jm.source = $${i++}`); params.push(source); }
  if (scoreMin != null && scoreMin !== "") { where.push(`COALESCE(jm.ai_score, 0) >= $${i++}`); params.push(Number(scoreMin)); }
  if (scoreMax != null && scoreMax !== "") { where.push(`COALESCE(jm.ai_score, 0) <= $${i++}`); params.push(Number(scoreMax)); }
  if (createdWithinHours != null && createdWithinHours !== "") {
    where.push(`jm.created_at >= now() - ($${i++}::int * interval '1 hour')`);
    params.push(Number(createdWithinHours));
  }

  try {
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM job_matches jm WHERE ${where.join(" AND ")}`,
      params
    );

    params.push(parseInt(limit), parseInt(offset));
    const orderBy =
      sort === "recent" ? "jm.created_at DESC"
      : sort === "oldest" ? "jm.created_at ASC"
      : sort === "score-low" ? "jm.ai_score ASC NULLS LAST, jm.created_at DESC"
      : sort === "score-high" ? "jm.ai_score DESC NULLS LAST, jm.created_at DESC"
      : "jm.ai_score DESC NULLS LAST, jm.created_at DESC";

    const { rows } = await pool.query(
      `SELECT jm.*,
              sp.name AS profile_name,
              rd.id AS resume_id,
              rd.title AS resume_title,
              rd.updated_at AS resume_updated_at,
              rd.resume_type AS resume_type,
              cd.id AS cover_letter_id,
              cd.title AS cover_letter_title,
              cd.updated_at AS cover_letter_updated_at
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
       LEFT JOIN LATERAL (
         SELECT d.id, d.title, d.updated_at
         FROM documents d
         WHERE d.user_id = jm.user_id
           AND d.kind = 'cover_letter'
           AND d.metadata->>'jobMatchId' = jm.id::text
         ORDER BY d.updated_at DESC
         LIMIT 1
       ) cd ON true
       WHERE ${where.join(" AND ")}
       ORDER BY ${orderBy}
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
              rd.resume_type AS resume_type,
              cd.id AS cover_letter_id,
              cd.title AS cover_letter_title,
              cd.updated_at AS cover_letter_updated_at
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
       LEFT JOIN LATERAL (
         SELECT d.id, d.title, d.updated_at
         FROM documents d
         WHERE d.user_id = jm.user_id
           AND d.kind = 'cover_letter'
           AND d.metadata->>'jobMatchId' = jm.id::text
         ORDER BY d.updated_at DESC
         LIMIT 1
       ) cd ON true
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

// GET /api/agent/results/:id/resume-profiles
router.get("/results/:id/resume-profiles", async (req, res) => {
  const limit = normalizeLimit(req.query.limit, 3, 6);

  try {
    const { rows } = await pool.query(
      `SELECT id, title, company, description, location, remote, source_url, ai_score, match_tier, score_breakdown
       FROM job_matches
       WHERE id = $1 AND user_id = $2
       LIMIT 1`,
      [req.params.id, req.userId]
    );

    const job = rows[0];
    if (!job) {
      return res.status(404).json({ message: "Job not found." });
    }

    const profiles = await getMasterResumeProfiles(req.userId!);
    const rankedProfiles = recommendResumeProfilesForJob(job, profiles, limit);

    res.json({
      jobId: job.id,
      profiles: rankedProfiles,
      totalProfilesConsidered: profiles.length,
      usingAiProfilesOnly: profiles.some((profile) => profile.isActive && profile.useForAi),
    });
  } catch (err) {
    console.error("[agent/results/:id/resume-profiles]", err);
    res.status(500).json({ message: "Failed to load related resume profiles." });
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
      `DELETE FROM job_matches WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    );
    if (!rowCount) return res.status(404).json({ message: "Job not found." });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to delete job." });
  }
});

// DELETE /api/agent/results  — bulk delete
// Body: { ids: string[] }
router.delete("/results", async (req, res) => {
  const ids: unknown = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: "ids must be a non-empty array." });
  }
  // Cap at 500 to prevent accidental full-table wipes
  const safeIds = (ids as unknown[]).slice(0, 500).filter((id) => typeof id === "string");
  if (safeIds.length === 0) return res.status(400).json({ message: "No valid ids provided." });

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM job_matches
       WHERE id = ANY($1::uuid[]) AND user_id = $2`,
      [safeIds, req.userId]
    );
    res.json({ ok: true, deleted: rowCount ?? 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to delete jobs." });
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
    jobType,
    salaryMin,
    salaryMax,
    rawData: clientRawData,
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
  const resolvedJobType =
    normalizeJobType(typeof jobType === "string" ? jobType : undefined) ??
    normalizeJobType(imported?.jobType) ??
    null;
  const resolvedSalaryMin =
    typeof salaryMin === "number" && Number.isFinite(salaryMin)
      ? Math.round(salaryMin)
      : imported?.salaryMin ?? null;
  const resolvedSalaryMax =
    typeof salaryMax === "number" && Number.isFinite(salaryMax)
      ? Math.round(salaryMax)
      : imported?.salaryMax ?? null;
  const resolvedPostedAt = imported?.postedAt ?? null;
  const resolvedSourceUrl = imported?.sourceUrl ?? sourceUrl ?? null;
  const rawData = buildNormalizedJobMeta({
    title: resolvedTitle,
    company: resolvedCompany,
    location: resolvedLocation,
    remote: resolvedRemote,
    jobType: resolvedJobType,
    description: resolvedDescription,
    salaryMin: resolvedSalaryMin,
    salaryMax: resolvedSalaryMax,
    rawData: {
      ...(imported?.rawData ?? {}),
      ...(clientRawData && typeof clientRawData === "object" ? clientRawData as Record<string, unknown> : {}),
    },
  });

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
          workArrangement: (saved.raw_data?.jobMeta?.workArrangement as string | undefined) ?? undefined,
          companyAddress: (saved.raw_data?.jobMeta?.companyAddress as string | undefined) ?? undefined,
          paymentType: (saved.raw_data?.jobMeta?.paymentType as string | undefined) ?? undefined,
          compensationText: (saved.raw_data?.jobMeta?.compensationText as string | undefined) ?? undefined,
          isContract:
            typeof saved.raw_data?.jobMeta?.isContract === "boolean"
              ? (saved.raw_data.jobMeta.isContract as boolean)
              : undefined,
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

    const requestedProfileIds = Array.isArray(req.body?.profileIds)
      ? Array.from(
          new Set(
            req.body.profileIds
              .map((value: unknown) => (typeof value === "string" ? value.trim() : ""))
              .filter(Boolean)
          )
        )
      : typeof req.body?.profileId === "string" && req.body.profileId.trim()
        ? [req.body.profileId.trim()]
        : [];
    const useLegacyPreferences = typeof req.body?.useLegacyPreferences === "boolean"
      ? req.body.useLegacyPreferences
      : undefined;
    const selectedCustomRole =
      typeof req.body?.customRole === "string" && req.body.customRole.trim()
        ? req.body.customRole.trim()
        : undefined;
    const { provider, apiKey, model } = await getResumeAiConnection(req.userId!, req.body?.provider);

    const effectiveCustomRole =
      selectedCustomRole && globalAi.aiCustomRoles.includes(selectedCustomRole)
        ? selectedCustomRole
        : undefined;

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
    if (requestedProfileIds.length > 0) {
      const { rows: eligibleProfiles } = await pool.query<{ id: string }>(
        `SELECT p.id
         FROM master_resume_profiles p
         JOIN master_resumes mr ON mr.id = p.master_resume_id
         WHERE mr.user_id = $1
           AND p.is_active = true
           AND p.use_for_ai = true
           AND p.id = ANY($2::uuid[])`,
        [req.userId, requestedProfileIds]
      );
      if (eligibleProfiles.length !== requestedProfileIds.length) {
        return res.status(400).json({ message: "One or more selected resume profiles are not available for AI generation." });
      }
    }

    const resumeLibrary = await getAiResumeSourceContext(req.userId!, {
      preferredProfileIds: requestedProfileIds,
      includeLegacy: useLegacyPreferences,
      maxChars: 14000,
    });
    const masterResumeContext = resumeLibrary.context;
    if (!masterResumeContext) {
      return res.status(400).json({
        message: "Activate at least one resume profile with AI enabled in Master Resume before generating a tailored resume.",
      });
    }
    if (masterResumeContext) {
      candidateLines.push(`Structured active resume library:\n${masterResumeContext.slice(0, 9000)}`);
    }
    candidateLines.push(...buildAiPreferenceNotes(globalAi));
    if (effectiveCustomRole) {
      candidateLines.push(`Selected custom AI role for this run: ${effectiveCustomRole}`);
    }

    const reqList = Array.isArray(job.requirements)
      ? (job.requirements as string[]).slice(0, 12).map((r: string) => `- ${r}`).join("\n")
      : "";
    const desc = typeof job.description === "string"
      ? job.description.replace(/<[^>]+>/g, " ").slice(0, 1500)
      : "";

    let resumeScore = Number(job.ai_score ?? 0);
    if (resumeLibrary.profiles.length > 0) {
      const profileScores = resumeLibrary.profiles.map((profile) => {
        const result = scoreMasterResume({
          name: profile.name,
          targetRoles: profile.targetRoles,
          summary: profile.summary,
          experienceYears: profile.experienceYears,
          experiences: profile.experiences,
          skills: profile.skills,
          education: profile.education,
          projects: profile.projects,
          leadership: profile.leadership ? {
            teamSize: profile.leadership.teamSize ?? null,
            scope: profile.leadership.scope ?? "",
            stakeholders: profile.leadership.stakeholders,
            budget: profile.leadership.budget ?? "",
          } : null,
          jobTitle: typeof job.title === "string" ? job.title : "",
          jobDescription: [desc, reqList].filter(Boolean).join("\n"),
        });
        return Math.round((result.atsScore * 0.45) + (result.mqMatch.matchScore * 0.35) + (result.impactScore * 0.2));
      });
      resumeScore = Math.round(profileScores.reduce((sum, score) => sum + score, 0) / profileScores.length);
    }

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
- Use the full active AI-enabled resume library plus the job description together to maximize ATS alignment and overall fit
- Ignore any deactivated resume profiles entirely
- Treat the structured active resume library as the primary source of truth for experience, achievements, education, and skills
- Use the candidate profile details exactly as provided for the resume header/contact section
- Write a tailored professional summary (3-4 sentences) for THIS specific role
- List the most relevant skills prominently
- Use keywords directly from the job description
- Format experience bullets with impact/metrics
- Make every section directly relevant to the job
- Prioritize relevance, measurable outcomes, minimum qualification match, and recruiter readability
- Aim for a strong approval-ready resume with the highest practical fit score without inventing facts
- Output clean markdown with sections: Header, Professional Summary, Core Skills, Professional Experience (use candidate's actual experience from profile and structured master resume context when available), Education (placeholder if not provided), Certifications
- Use only markdown headings, plain paragraphs, and bullet lists
- Do not use tables, code fences, or HTML
- If profile data is missing, leave that field out instead of inventing it

Return ONLY the markdown resume, no explanation.`;

    // 5. Call selected AI provider
    const rawMarkdown = await runResumeGeneration({
      provider,
      apiKey,
      model,
      systemPrompt: [
        buildAiSystemPrompt(
          "You are an expert resume writer. Return only clean markdown.",
          globalAi
        ),
        effectiveCustomRole ? `For this request, strongly emphasize this selected custom AI role: ${effectiveCustomRole}.` : null,
      ].filter(Boolean).join("\n\n"),
      resumePrompt,
    });

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
      provider,
      model,
      selectedProfileIds: resumeLibrary.profileIds,
      requestedProfileIds,
      selectedCustomRole: effectiveCustomRole ?? null,
      usedLegacyPreferences: resumeLibrary.usedLegacy,
      resumeScore,
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
      message: `Resume generated with ${provider === "openai" ? "OpenAI" : "Anthropic"} and attached to this job.`,
    });
  } catch (err) {
    console.error("[generate-resume]", (err as Error).message);
    res.status(500).json({ message: `Failed to generate resume: ${(err as Error).message}` });
  }
});

/* ═════════════════════ Generate Cover Letter ════════════════════════════ */

router.post("/results/:id/generate-cover-letter", async (req, res) => {
  const matchId = req.params.id;

  try {
    const { rows: matchRows } = await pool.query<Record<string, unknown>>(
      `SELECT id, user_id, title, company, location, remote, job_type, description, requirements,
              source_url, ai_score, match_tier, score_breakdown, profile_id
       FROM job_matches
       WHERE id = $1 AND user_id = $2
       LIMIT 1`,
      [matchId, req.userId]
    );

    const job = matchRows[0];
    if (!job) {
      return res.status(404).json({ message: "Job not found." });
    }

    const globalAi = await getGlobalAiSettings(req.userId!);
    const { provider, apiKey, model } = await getResumeAiConnection(req.userId!, req.body?.provider);
    const resumeLibrary = await getAiResumeSourceContext(req.userId!, {
      includeLegacy: undefined,
      maxChars: 14000,
    });

    if (!resumeLibrary.context) {
      return res.status(400).json({
        message: "Activate at least one resume profile with AI enabled in Master Resume before generating a cover letter.",
      });
    }

    const { rows: profileRows } = await pool.query<Record<string, unknown>>(
      `SELECT u.first_name, u.last_name, u.email, u.location_text,
              u.current_job_title, u.linkedin_url,
              up.professional_summary, up.years_experience
       FROM account_users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE u.id = $1
       LIMIT 1`,
      [req.userId]
    );
    const profile = profileRows[0] ?? {};

    const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
    const candidateLines: string[] = [];
    if (fullName) candidateLines.push(`Full name: ${fullName}`);
    if (profile.email) candidateLines.push(`Email: ${profile.email}`);
    if (profile.location_text) candidateLines.push(`Location: ${profile.location_text}`);
    if (profile.current_job_title) candidateLines.push(`Current title: ${profile.current_job_title}`);
    if (profile.linkedin_url) candidateLines.push(`LinkedIn: ${profile.linkedin_url}`);
    if (profile.professional_summary) candidateLines.push(`Profile summary: ${profile.professional_summary}`);
    if (profile.years_experience) candidateLines.push(`Years of experience: ${profile.years_experience}`);
    candidateLines.push(`Active resume library:\n${resumeLibrary.context.slice(0, 9000)}`);
    candidateLines.push(...buildAiPreferenceNotes(globalAi));

    const reqList = Array.isArray(job.requirements)
      ? (job.requirements as string[]).slice(0, 12).map((r: string) => `- ${r}`).join("\n")
      : "";
    const desc = typeof job.description === "string"
      ? job.description.replace(/<[^>]+>/g, " ").slice(0, 2000)
      : "";
    const scoreBreakdown = job.score_breakdown && typeof job.score_breakdown === "object"
      ? JSON.stringify(job.score_breakdown, null, 2)
      : "";

    const coverLetterPrompt = `You are an expert career strategist and executive resume writer. Write a persuasive, truthful, ATS-safe cover letter in markdown.

CANDIDATE CONTEXT:
${candidateLines.join("\n")}

TARGET JOB:
Title: ${job.title}
Company: ${job.company ?? ""}
Location: ${job.location ?? ""}
Remote: ${job.remote ? "Yes" : "No"}
Job type: ${job.job_type ?? ""}
Source URL: ${job.source_url ?? ""}
Fit score: ${job.ai_score ?? "Not scored"}
Match tier: ${job.match_tier ?? "Unknown"}
Job description:
${desc || "Not provided"}

Requirements:
${reqList || "Not provided"}

Current job analysis:
${scoreBreakdown || "Not available"}

Instructions:
- Use all active AI-enabled resume profiles as the candidate source of truth
- Ignore deactivated resume profiles entirely
- Follow the user's AI settings for tone, personalization, and safety rules
- Write a role-specific cover letter for this exact job
- Highlight the most relevant experience, strengths, and outcomes from the candidate context
- Do not invent employers, achievements, metrics, dates, or credentials
- Keep the letter concise, natural, and client-ready
- Output clean markdown only, with greeting, body paragraphs, and a closing signature
- Do not use placeholders like [Your Name] or [Company Name]; use the available candidate and job details directly when known`;

    const rawMarkdown = await runResumeGeneration({
      provider,
      apiKey,
      model,
      systemPrompt: buildAiSystemPrompt(
        "You are an expert cover letter writer. Return only clean markdown.",
        globalAi
      ),
      resumePrompt: coverLetterPrompt,
    });

    const contentText = markdownToPlainText(rawMarkdown);
    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    const contentHtml = rawMarkdown
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br />")}</p>`)
      .join("");
    const docTitle = String(job.title || "Cover Letter");
    const metadata = JSON.stringify({
      jobMatchId: matchId,
      jobTitle: job.title,
      company: job.company,
      location: job.location,
      provider,
      model,
      profileIds: resumeLibrary.profileIds,
      profileNames: resumeLibrary.profileNames,
      usedLegacyPreferences: resumeLibrary.usedLegacy,
      formatting: {
        tone: globalAi.coverLetterTone,
        length: globalAi.coverLetterLength,
        personalization: globalAi.coverLetterPersonalization,
      },
    });

    const { rows: docRows } = await pool.query(
      `INSERT INTO documents (user_id, kind, origin, title, content_text, content_html, metadata)
       VALUES ($1, 'cover_letter', 'ai_generated', $2, $3, $4, $5::jsonb)
       RETURNING id`,
      [req.userId, docTitle, contentText, contentHtml, metadata]
    );
    const documentId = docRows[0].id as string;

    await pool.query(
      `INSERT INTO document_versions (document_id, version_no, content_text, content_html)
       VALUES ($1, 1, $2, $3)`,
      [documentId, contentText, contentHtml]
    );

    res.json({
      documentId,
      title: docTitle,
      coverLetter: {
        id: documentId,
        title: docTitle,
        lastModified: new Date().toISOString(),
      },
      message: `Cover letter generated with ${provider === "openai" ? "OpenAI" : "Anthropic"} and saved to Cover Letters.`,
    });
  } catch (err) {
    console.error("[generate-cover-letter]", (err as Error).message);
    res.status(500).json({ message: `Failed to generate cover letter: ${(err as Error).message}` });
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

// GET /api/agent/runs/:runId — poll a single run's status
router.get("/runs/:runId", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ar.*, sp.name AS profile_name
       FROM agent_runs ar
       LEFT JOIN search_profiles sp ON sp.id = ar.profile_id
       WHERE ar.id = $1 AND ar.user_id = $2`,
      [req.params.runId, req.userId]
    );
    if (!rows[0]) return res.status(404).json({ message: "Run not found." });
    res.json(toRun(rows[0]));
  } catch {
    res.status(500).json({ message: "Failed to load run." });
  }
});

// POST /api/agent/runs/:runId/cancel — cancel a running job
router.post("/runs/:runId/cancel", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE agent_runs SET status='cancelled', completed_at=now()
       WHERE id = $1 AND user_id = $2 AND status = 'running'
       RETURNING *, (SELECT name FROM search_profiles WHERE id = agent_runs.profile_id) AS profile_name`,
      [req.params.runId, req.userId]
    );
    if (!rows[0]) return res.status(404).json({ message: "Run not found or already finished." });
    await logActivity(req.userId!, rows[0].profile_id, rows[0].profile_name ?? "", "run_cancelled", {
      runId: rows[0].id,
    });
    res.json(toRun(rows[0]));
  } catch {
    res.status(500).json({ message: "Failed to cancel run." });
  }
});

// GET /api/agent/profiles/:id/logs — activity log for a specific profile
router.get("/profiles/:id/logs", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string ?? "50"), 100);
    const { rows } = await pool.query(
      `SELECT id, profile_id, profile_name, action, detail, created_at
       FROM profile_activity_logs
       WHERE user_id = $1 AND (profile_id = $2 OR (profile_id IS NULL AND profile_name IN (
         SELECT name FROM search_profiles WHERE id = $2
       )))
       ORDER BY created_at DESC
       LIMIT $3`,
      [req.userId, req.params.id, limit]
    );
    res.json(rows.map((r) => ({
      id: r.id,
      profileId: r.profile_id,
      profileName: r.profile_name,
      action: r.action,
      detail: r.detail,
      createdAt: r.created_at,
    })));
  } catch {
    res.status(500).json({ message: "Failed to load logs." });
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
  const rawData =
    r.raw_data && typeof r.raw_data === "object"
      ? (r.raw_data as Record<string, unknown>)
      : undefined;
  const jobMeta =
    rawData?.jobMeta && typeof rawData.jobMeta === "object"
      ? (rawData.jobMeta as Record<string, unknown>)
      : undefined;

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
    rawData,
    workArrangement: typeof jobMeta?.workArrangement === "string" ? jobMeta.workArrangement : undefined,
    companyAddress: typeof jobMeta?.companyAddress === "string" ? jobMeta.companyAddress : undefined,
    workLocation: typeof jobMeta?.workLocation === "string" ? jobMeta.workLocation : undefined,
    paymentType: typeof jobMeta?.paymentType === "string" ? jobMeta.paymentType : undefined,
    compensationText: typeof jobMeta?.compensationText === "string" ? jobMeta.compensationText : undefined,
    isContract: typeof jobMeta?.isContract === "boolean" ? jobMeta.isContract : undefined,
    linkedResume: r.resume_id ? {
      id: r.resume_id,
      title: r.resume_title,
      lastModified: r.resume_updated_at,
      resumeType: r.resume_type,
    } : undefined,
    linkedCoverLetter: r.cover_letter_id ? {
      id: r.cover_letter_id,
      title: r.cover_letter_title,
      lastModified: r.cover_letter_updated_at,
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
