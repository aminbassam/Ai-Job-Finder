/**
 * Arbeitnow connector — free international job board API, no key required.
 * https://arbeitnow.com/api/job-board-api
 * Supports remote, full-time, visa-sponsorship jobs across Europe & worldwide.
 */
import { Connector, ConnectorConfig, RawJob, SearchQuery, titleMatches } from "./base";

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  tags: string[];
  job_types: string[];
  location: string;
  created_at: number; // unix timestamp
}

interface ArbeitnowResponse {
  data: ArbeitnowJob[];
  links: {
    next?: string;
  };
}

export const arbeitnowConnector: Connector = {
  name: "arbeitnow",
  async search(query: SearchQuery, config: ConnectorConfig): Promise<RawJob[]> {
    const maxPages = Math.min(Number(config.maxPages ?? 3), 10);
    const results: RawJob[] = [];
    const seenSlugs = new Set<string>();

    let page = 1;
    let hasMore = true;

    while (hasMore && page <= maxPages) {
      try {
        const params = new URLSearchParams({ page: String(page) });
        if (query.remoteOnly) params.set("remote", "true");

        const url = `https://arbeitnow.com/api/job-board-api?${params}`;
        const res = await fetch(url, {
          headers: { "User-Agent": "JobFlowAI/1.0" },
          signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) break;

        const data = (await res.json()) as ArbeitnowResponse;
        const jobs: ArbeitnowJob[] = data.data ?? [];

        if (jobs.length === 0) break;

        for (const job of jobs) {
          if (seenSlugs.has(job.slug)) continue;
          seenSlugs.add(job.slug);

          // Title filter
          if (!titleMatches(job.title, query)) continue;

          // Remote filter
          if (query.remoteOnly && !job.remote) continue;

          const postedAt = job.created_at ? new Date(job.created_at * 1000) : undefined;
          const jobType = job.job_types?.[0] ?? undefined;

          results.push({
            externalId: job.slug,
            source: "arbeitnow",
            sourceUrl: job.url,
            title: job.title,
            company: job.company_name,
            location: job.location || (job.remote ? "Remote" : undefined),
            remote: job.remote,
            jobType,
            description: job.description,
            requirements: job.tags ?? [],
            postedAt,
            rawData: job as unknown as Record<string, unknown>,
          });
        }

        hasMore = Boolean(data.links?.next);
        page++;
      } catch {
        break;
      }
    }

    return results;
  },
};
