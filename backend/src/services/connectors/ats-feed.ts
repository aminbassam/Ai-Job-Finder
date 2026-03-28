/**
 * ATS-feed connector — handles Ashby, and user-provided company ATS boards.
 *
 * Supported board types:
 *   ashby  — https://jobs.ashbyhq.com/api/non-graphql/job-board/jobs?jobBoardName={slug}
 *
 * config.feeds = [
 *   { type: "ashby", company: "Stripe", slug: "stripe" },
 *   { type: "ashby", company: "Notion", slug: "notion" },
 * ]
 */
import { Connector, ConnectorConfig, RawJob, SearchQuery, titleMatches } from "./base";

interface AshbyJob {
  id: string;
  title: string;
  locationName?: string;
  isRemote?: boolean;
  employmentType?: string;
  descriptionHtml?: string;
  publishedDate?: string;
  jobUrl?: string;
}

interface AshbyResponse {
  jobs?: AshbyJob[];
}

interface FeedEntry {
  type: string;
  company: string;
  slug: string;
}

export const atsFeedConnector: Connector = {
  name: "ats-feed",

  async search(query: SearchQuery, config: ConnectorConfig): Promise<RawJob[]> {
    const feeds: FeedEntry[] = (config.feeds as FeedEntry[] | undefined) ?? [];
    if (feeds.length === 0) return [];

    const results: RawJob[] = [];

    await Promise.allSettled(
      feeds.map(async (feed) => {
        try {
          if (feed.type === "ashby") {
            const url = `https://jobs.ashbyhq.com/api/non-graphql/job-board/jobs?jobBoardName=${encodeURIComponent(
              feed.slug
            )}`;
            const res = await fetch(url, {
              signal: AbortSignal.timeout(10_000),
              headers: { "User-Agent": "JobFlowAI/1.0" },
            });
            if (!res.ok) return;

            const data = await res.json() as AshbyResponse;
            for (const job of data.jobs ?? []) {
              if (!titleMatches(job.title, query)) continue;
              results.push({
                externalId: `ashby_${job.id}`,
                source: "ashby",
                sourceUrl:
                  job.jobUrl ??
                  `https://jobs.ashbyhq.com/${feed.slug}/${job.id}`,
                title: job.title,
                company: feed.company,
                location: job.locationName,
                remote: job.isRemote ?? false,
                jobType: job.employmentType?.toLowerCase(),
                description: job.descriptionHtml,
                postedAt: job.publishedDate ? new Date(job.publishedDate) : new Date(),
                rawData: job as unknown as Record<string, unknown>,
              });
            }
          }
        } catch {
          // skip failed feed
        }
      })
    );

    return results;
  },
};
