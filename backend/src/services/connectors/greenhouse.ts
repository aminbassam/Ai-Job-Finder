/**
 * Greenhouse connector — uses the public job board API.
 * Requires no API key; only needs a list of company slugs.
 *
 * API: GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true
 */
import { Connector, ConnectorConfig, RawJob, SearchQuery, titleMatches } from "./base";

interface GhJob {
  id: number;
  title: string;
  absolute_url: string;
  location: { name: string };
  content?: string;
  updated_at: string;
}

interface GhBoard {
  jobs: GhJob[];
}

export const greenhouseConnector: Connector = {
  name: "greenhouse",

  async search(query: SearchQuery, config: ConnectorConfig): Promise<RawJob[]> {
    const slugs: string[] = (config.companySlugs as string[] | undefined) ?? [];
    if (slugs.length === 0) return [];

    const results: RawJob[] = [];

    await Promise.allSettled(
      slugs.map(async (slug) => {
        try {
          const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(
            slug
          )}/jobs?content=true`;
          const res = await fetch(url, {
            signal: AbortSignal.timeout(10_000),
            headers: { "User-Agent": "JobFlowAI/1.0" },
          });
          if (!res.ok) return;

          const data = await res.json() as GhBoard;
          for (const job of data.jobs ?? []) {
            if (!titleMatches(job.title, query)) continue;
            results.push({
              externalId: `greenhouse_${job.id}`,
              source: "greenhouse",
              sourceUrl: job.absolute_url,
              title: job.title,
              company: slug,
              location: job.location?.name,
              remote: /remote/i.test(job.location?.name ?? ""),
              description: job.content,
              postedAt: new Date(job.updated_at),
              rawData: job as unknown as Record<string, unknown>,
            });
          }
        } catch {
          // skip failed slug
        }
      })
    );

    return results;
  },
};
