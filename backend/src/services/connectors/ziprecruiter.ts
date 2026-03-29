/**
 * ZipRecruiter connector — official Job Seeker API.
 *
 * Requires a free API key from https://www.ziprecruiter.com/partner
 * (select "Job Seeker" when asked for partner type).
 *
 * Endpoint: GET https://api.ziprecruiter.com/jobs/v1
 * Docs: https://www.ziprecruiter.com/jobs/api/docs
 *
 * Parameters:
 *   search          – keywords / job title
 *   location        – city, state or "remote"
 *   radius_miles    – search radius (default 25)
 *   days_ago        – max age in days (default 7)
 *   jobs_per_page   – 1-100 (default 20)
 *   page            – 1-based page number
 *   api_key         – your ZipRecruiter API key
 */
import { Connector, ConnectorConfig, RawJob, SearchQuery, titleMatches } from "./base";

interface ZipJob {
  id: string;
  name: string;
  url: string;
  snippet: string;
  salary_interval?: string;          // "annual" | "hourly" | etc.
  compensation_min?: number;
  compensation_max?: number;
  posted_time: string;               // ISO-8601
  location: string;
  city: string;
  state: string;
  country: string;
  remote_work_model?: {
    allows_remote?: boolean;
  };
  job_type?: string;
  hiring_company: {
    name: string;
    url?: string;
  };
  requirements?: string;
  description?: string;
}

interface ZipResponse {
  success: boolean;
  status_code: number;
  jobs: ZipJob[];
  total_jobs: number;
}

function normalizeAnnualSalary(job: ZipJob): { min?: number; max?: number } {
  const interval = (job.salary_interval ?? "").toLowerCase();
  const min = job.compensation_min;
  const max = job.compensation_max;
  if (!min && !max) return {};
  const multiplier = interval === "hourly" ? 2080 : interval === "monthly" ? 12 : 1;
  return {
    min: min ? Math.round(min * multiplier) : undefined,
    max: max ? Math.round(max * multiplier) : undefined,
  };
}

export const zipRecruiterConnector: Connector = {
  name: "ziprecruiter",

  async search(query: SearchQuery, config: ConnectorConfig): Promise<RawJob[]> {
    const apiKey = config.apiKey as string | undefined;
    if (!apiKey?.trim()) return [];

    const radiusMiles = Number(config.radiusMiles ?? 25);
    const maxPages   = Math.min(Number(config.maxPages ?? 3), 10);
    const daysAgo    = query.postedWithinDays ?? Number(config.daysAgo ?? 7);
    const perPage    = Math.min(Number(config.jobsPerPage ?? 50), 100);

    // Build location string: use profile locations or fall back to "remote"
    const locations =
      query.remoteOnly
        ? ["remote"]
        : query.locations.length > 0
          ? query.locations
          : [""];   // empty = no location filter

    // Search terms: use job titles if set, else first keyword
    const searchTerms = query.jobTitles.length > 0
      ? query.jobTitles
      : query.mustHaveKeywords.slice(0, 2);

    if (searchTerms.length === 0) return [];

    const seenIds  = new Set<string>();
    const results: RawJob[] = [];

    // Fan-out: at most 3 search terms × 2 locations × 3 pages to stay within rate limits
    const termsToFetch   = searchTerms.slice(0, 3);
    const locationsToUse = locations.slice(0, 2);

    await Promise.allSettled(
      termsToFetch.flatMap((term) =>
        locationsToUse.map(async (location) => {
          for (let page = 1; page <= maxPages; page++) {
            try {
              const params = new URLSearchParams({
                search:         term,
                jobs_per_page:  String(perPage),
                page:           String(page),
                days_ago:       String(daysAgo),
                api_key:        apiKey,
              });

              if (location) {
                params.set("location", location);
                params.set("radius_miles", String(radiusMiles));
              }

              const url = `https://api.ziprecruiter.com/jobs/v1?${params}`;
              const res = await fetch(url, {
                headers: { "User-Agent": "JobFlowAI/1.0" },
                signal: AbortSignal.timeout(15_000),
              });

              if (res.status === 401 || res.status === 403) {
                console.warn("[ziprecruiter] Invalid or unauthorized API key.");
                return; // stop this fan-out branch
              }
              if (!res.ok) break; // stop pagination for this term/location

              const data = (await res.json()) as ZipResponse;
              if (!data.success || !data.jobs?.length) break;

              for (const job of data.jobs) {
                if (seenIds.has(job.id)) continue;
                seenIds.add(job.id);

                if (!titleMatches(job.name, query)) continue;

                const isRemote =
                  job.remote_work_model?.allows_remote === true ||
                  /remote/i.test(job.location ?? "") ||
                  /remote/i.test(job.name ?? "");

                if (query.remoteOnly && !isRemote) continue;

                const salary = normalizeAnnualSalary(job);
                const fullText = [job.snippet, job.description, job.requirements]
                  .filter(Boolean)
                  .join(" ")
                  .slice(0, 10_000);

                results.push({
                  externalId: job.id,
                  source:     "ziprecruiter",
                  sourceUrl:  job.url,
                  title:      job.name,
                  company:    job.hiring_company?.name,
                  location:   job.location || `${job.city}, ${job.state}`.replace(/^, /, ""),
                  remote:     isRemote,
                  jobType:    job.job_type,
                  description: fullText || job.snippet,
                  salaryMin:  salary.min,
                  salaryMax:  salary.max,
                  postedAt:   job.posted_time ? new Date(job.posted_time) : undefined,
                  rawData:    job as unknown as Record<string, unknown>,
                });
              }

              // Stop paginating if we got fewer results than requested
              if (data.jobs.length < perPage) break;
            } catch (err) {
              console.error("[ziprecruiter] fetch error:", (err as Error).message);
              break;
            }
          }
        })
      )
    );

    return results;
  },
};
