/**
 * Job Agent Scheduler
 *
 * Runs every 30 minutes and processes any search profile whose next_run_at
 * is in the past (or NULL). Schedules the next run based on the profile's
 * schedule setting: "6h" | "daily" | "weekdays".
 */
import cron from "node-cron";
import { pool } from "../db/pool";
import { PipelineProfile, runPipeline } from "./pipeline";

function nextRunAt(schedule: string): Date {
  const now = new Date();
  if (schedule === "6h") {
    return new Date(now.getTime() + 6 * 60 * 60 * 1000);
  }
  // daily / weekdays: next 08:00
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(8, 0, 0, 0);
  return next;
}

async function processDueProfiles(): Promise<void> {
  let profiles: PipelineProfile[] = [];

  try {
    const { rows } = await pool.query<{
      id: string;
      user_id: string;
      name: string;
      job_titles: string[];
      locations: string[];
      remote_only: boolean;
      salary_min: number | null;
      salary_max: number | null;
      must_have_keywords: string[];
      nice_to_have_keywords: string[];
      excluded_companies: string[];
      sources: string[];
      search_mode: string;
      score_threshold: number;
      auto_resume: boolean;
      schedule: string;
    }>(
      `SELECT sp.id, sp.user_id, sp.name,
              sp.job_titles, sp.locations, sp.remote_only,
              sp.salary_min, sp.salary_max,
              sp.must_have_keywords, sp.nice_to_have_keywords,
              sp.excluded_companies, sp.sources,
              sp.search_mode, sp.score_threshold,
              sp.auto_resume, sp.schedule
       FROM search_profiles sp
       WHERE sp.is_active = true
         AND (sp.next_run_at IS NULL OR sp.next_run_at <= now())
         AND (sp.schedule != 'weekdays'
              OR EXTRACT(DOW FROM now()) BETWEEN 1 AND 5)`
    );
    profiles = rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      jobTitles: r.job_titles ?? [],
      locations: r.locations ?? [],
      remoteOnly: r.remote_only,
      salaryMin: r.salary_min,
      salaryMax: r.salary_max,
      mustHaveKeywords: r.must_have_keywords ?? [],
      niceToHaveKeywords: r.nice_to_have_keywords ?? [],
      excludedCompanies: r.excluded_companies ?? [],
      sources: r.sources ?? ["greenhouse", "lever"],
      searchMode: (r.search_mode as "strict" | "balanced" | "broad") ?? "balanced",
      scoreThreshold: r.score_threshold ?? 70,
      autoResume: r.auto_resume ?? false,
    }));
  } catch (err) {
    console.error("[scheduler] Failed to load profiles:", (err as Error).message);
    return;
  }

  for (const profile of profiles) {
    // Create run log entry
    let runId: string;
    try {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO agent_runs (user_id, profile_id, trigger, status)
         VALUES ($1, $2, 'schedule', 'running') RETURNING id`,
        [profile.userId, profile.id]
      );
      runId = rows[0].id;
    } catch (err) {
      console.error("[scheduler] Could not create run record:", (err as Error).message);
      continue;
    }

    try {
      const result = await runPipeline(profile);

      await pool.query(
        `UPDATE agent_runs
         SET status = 'completed', jobs_found = $2, jobs_new = $3,
             jobs_scored = $4, strong_matches = $5, completed_at = now()
         WHERE id = $1`,
        [runId, result.found, result.newJobs, result.scored, result.strongMatches]
      );

      await pool.query(
        `UPDATE search_profiles
         SET last_run_at = now(), next_run_at = $2, updated_at = now()
         WHERE id = $1`,
        [profile.id, nextRunAt((profiles.find((p) => p.id === profile.id) as any)?.schedule ?? "daily")]
      );

      console.log(
        `[scheduler] Profile ${profile.id} — ${result.newJobs} new / ${result.strongMatches} strong`
      );
    } catch (err) {
      const msg = (err as Error).message;
      await pool.query(
        `UPDATE agent_runs SET status = 'failed', error = $2, completed_at = now() WHERE id = $1`,
        [runId, msg]
      ).catch(() => {});
      console.error(`[scheduler] Profile ${profile.id} failed:`, msg);
    }
  }
}

export function startScheduler(): void {
  // Every 30 minutes
  cron.schedule("*/30 * * * *", () => {
    processDueProfiles().catch((err) =>
      console.error("[scheduler] Unhandled error:", err)
    );
  });
  console.log("[scheduler] Started — polling every 30 min");
}
