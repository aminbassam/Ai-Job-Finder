/**
 * Match Pipeline
 *
 * For each search profile run:
 *   1. Fan out to enabled connectors
 *   2. Filter excluded companies
 *   3. AI-score every job against the profile
 *   4. Deduplicate via (user_id, source, external_id) unique constraint
 *   5. Persist strong/maybe/weak/reject tiers
 */
import { pool } from "../db/pool";
import {
  RawJob,
  SearchQuery,
  jobTypeMatches,
  normalizeJobType,
  postedWithinRange,
} from "./connectors/base";
import { greenhouseConnector } from "./connectors/greenhouse";
import { leverConnector } from "./connectors/lever";
import { upworkConnector } from "./connectors/upwork";
import { atsFeedConnector } from "./connectors/ats-feed";
import { googleConnector } from "./connectors/google";
import { builtInAustinConnector } from "./connectors/builtinaustin";
import { remotiveConnector } from "./connectors/remotive";
import { arbeitnowConnector } from "./connectors/arbeitnow";
import { zipRecruiterConnector } from "./connectors/ziprecruiter";
import { usaJobsConnector } from "./connectors/usajobs";

/* ─── Profile shape ─────────────────────────────────────────────────────── */

export interface PipelineProfile {
  id: string;
  userId: string;
  jobTitles: string[];
  locations: string[];
  remoteOnly: boolean;
  experienceLevels: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  jobTypes: string[];
  postedWithinDays: number | null;
  mustHaveKeywords: string[];
  niceToHaveKeywords: string[];
  excludedCompanies: string[];
  sources: string[];
  searchMode: "strict" | "balanced" | "broad";
  scoreThreshold: number;
  autoResume: boolean;
  schedule?: string;
  scheduleIntervalMinutes?: number | null;
}

/* ─── Scoring ───────────────────────────────────────────────────────────── */

export interface Breakdown {
  titleMatch: number;
  keywordMatch: number;
  locationMatch: number;
  salaryMatch: number;
  total: number;
}

export function scoreRawJobAgainstProfile(job: RawJob, profile: PipelineProfile): { score: number; breakdown: Breakdown } {
  const zero: Breakdown = { titleMatch: 0, keywordMatch: 0, locationMatch: 0, salaryMatch: 0, total: 0 };

  // ── Title (40 pts) ──────────────────────────────────────────────────────
  let titleMatch = 0;
  if (profile.jobTitles.length > 0) {
    const t = job.title.toLowerCase();
    const exact = profile.jobTitles.some((jt) => t === jt.toLowerCase());
    const partial = profile.jobTitles.some((jt) => t.includes(jt.toLowerCase()));
    titleMatch = exact ? 40 : partial ? 28 : 0;
  } else {
    titleMatch = 25;
  }

  // ── Keywords (30 pts) ───────────────────────────────────────────────────
  const fullText = [job.title, job.description ?? "", ...(job.requirements ?? [])]
    .join(" ")
    .toLowerCase();

  let keywordMatch = 0;

  if (profile.mustHaveKeywords.length > 0) {
    const missing = profile.mustHaveKeywords.filter(
      (k) => !fullText.includes(k.toLowerCase())
    );
    if (missing.length > 0) return { score: 0, breakdown: zero }; // hard reject
    keywordMatch += 20;
  } else {
    keywordMatch += 15;
  }

  if (profile.niceToHaveKeywords.length > 0) {
    const matched = profile.niceToHaveKeywords.filter((k) =>
      fullText.includes(k.toLowerCase())
    );
    keywordMatch += Math.round(
      (matched.length / profile.niceToHaveKeywords.length) * 10
    );
  } else {
    keywordMatch += 5;
  }

  // ── Location (20 pts) ───────────────────────────────────────────────────
  let locationMatch = 0;
  if (profile.remoteOnly) {
    locationMatch = job.remote ? 20 : 0;
  } else if (profile.locations.length > 0) {
    const loc = (job.location ?? "").toLowerCase();
    const matched = profile.locations.some(
      (l) => loc.includes(l.toLowerCase()) || l.toLowerCase().includes(loc)
    );
    locationMatch = job.remote ? 15 : matched ? 20 : 4;
  } else {
    locationMatch = 15;
  }

  // ── Salary (10 pts) ─────────────────────────────────────────────────────
  let salaryMatch = 0;
  if (profile.salaryMin != null || profile.salaryMax != null) {
    if (job.salaryMin != null || job.salaryMax != null) {
      const jMin = job.salaryMin ?? 0;
      const jMax = job.salaryMax ?? jMin * 1.3;
      const pMin = profile.salaryMin ?? 0;
      const pMax = profile.salaryMax ?? 999_999;
      salaryMatch = jMin <= pMax && jMax >= pMin ? 10 : 0;
    } else {
      salaryMatch = 5; // unknown salary → partial credit
    }
  } else {
    salaryMatch = 10;
  }

  const total = Math.min(100, titleMatch + keywordMatch + locationMatch + salaryMatch);
  return { score: total, breakdown: { titleMatch, keywordMatch, locationMatch, salaryMatch, total } };
}

export function toMatchTier(score: number): "strong" | "maybe" | "weak" | "reject" {
  if (score >= 75) return "strong";
  if (score >= 55) return "maybe";
  if (score >= 35) return "weak";
  return "reject";
}

/* ─── Main pipeline ─────────────────────────────────────────────────────── */

export interface PipelineResult {
  found: number;
  newJobs: number;
  scored: number;
  strongMatches: number;
  newJobIds: string[];  // IDs of newly inserted jobs — caller can AI-score these
}

export async function runPipeline(profile: PipelineProfile): Promise<PipelineResult> {
  const query: SearchQuery = {
    jobTitles: profile.jobTitles,
    locations: profile.locations,
    remoteOnly: profile.remoteOnly,
    mustHaveKeywords: profile.mustHaveKeywords,
    experienceLevels: profile.experienceLevels,
    jobTypes: profile.jobTypes,
    postedWithinDays: profile.postedWithinDays,
    searchMode: profile.searchMode,
  };

  // Load active connector configs for this user
  const { rows: cfgRows } = await pool.query(
    `SELECT connector, config FROM connector_configs WHERE user_id = $1 AND is_active = true`,
    [profile.userId]
  );
  const cfgMap: Record<string, Record<string, unknown>> = {};
  for (const row of cfgRows) cfgMap[row.connector] = row.config;

  // Fan out to each enabled source
  const allJobs: RawJob[] = [];
  await Promise.allSettled(
    profile.sources.map(async (source) => {
      const cfg = cfgMap[source] ?? {};
      let jobs: RawJob[] = [];
      try {
        const runtimeConfig = { ...cfg, userId: profile.userId };
        if (source === "greenhouse") jobs = await greenhouseConnector.search(query, runtimeConfig);
        else if (source === "lever") jobs = await leverConnector.search(query, cfg);
        else if (source === "upwork") jobs = await upworkConnector.search(query, cfg);
        else if (source === "google") jobs = await googleConnector.search(query, cfg);
        else if (source === "builtinaustin") jobs = await builtInAustinConnector.search(query, runtimeConfig);
        else if (source === "ats-feed" || source === "ashby")
          jobs = await atsFeedConnector.search(query, cfg);
        else if (source === "remotive") jobs = await remotiveConnector.search(query, cfg);
        else if (source === "arbeitnow") jobs = await arbeitnowConnector.search(query, cfg);
        else if (source === "ziprecruiter") jobs = await zipRecruiterConnector.search(query, cfg);
        else if (source === "usajobs") jobs = await usaJobsConnector.search(query, cfg);
      } catch (err) {
        console.error(`[pipeline] connector ${source} error:`, (err as Error).message);
      }
      allJobs.push(...jobs);
    })
  );

  // Filter excluded companies + post-connector profile filters.
  const filtered = allJobs
    .filter((job) => {
      if (profile.excludedCompanies.length === 0) return true;
      const co = (job.company ?? "").toLowerCase();
      return !profile.excludedCompanies.some((ec) =>
        co.includes(ec.toLowerCase())
      );
    })
    .filter((job) => jobTypeMatches(job.jobType, profile.jobTypes))
    .filter((job) => postedWithinRange(job.postedAt, profile.postedWithinDays));

  let newCount = 0;
  let scoredCount = 0;
  let strongCount = 0;
  const newJobIds: string[] = [];

  for (const job of filtered) {
    scoredCount++;
    try {
      // Insert with match_tier='new' and no scored_at so the run endpoint
      // can AI-score each job — exactly the same flow as manual import.
      const { rows } = await pool.query(
        `INSERT INTO job_matches (
          user_id, profile_id, external_id, source, source_url, title, company,
          location, remote, job_type, description, requirements, posted_at, raw_data,
          match_tier, status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::text[],$13,$14,'new','new')
        ON CONFLICT (user_id, source, external_id) DO NOTHING
        RETURNING id`,
        [
          profile.userId,
          profile.id,
          job.externalId,
          job.source,
          job.sourceUrl ?? null,
          job.title,
          job.company ?? null,
          job.location ?? null,
          job.remote ?? false,
          normalizeJobType(job.jobType) ?? null,
          (job.description ?? "").slice(0, 10_000),
          job.requirements ?? [],
          job.postedAt ?? new Date(),
          JSON.stringify(job.rawData ?? {}),
        ]
      );
      if (rows.length > 0) {
        newCount++;
        newJobIds.push(rows[0].id as string);
      }
    } catch (err) {
      console.error("[pipeline] insert error:", (err as Error).message);
    }
  }

  return { found: filtered.length, newJobs: newCount, scored: scoredCount, strongMatches: strongCount, newJobIds };
}
