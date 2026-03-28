/**
 * Lever connector — uses the public postings API (no auth required).
 *
 * API: GET https://api.lever.co/v0/postings/{slug}?mode=json
 */
import { Connector, ConnectorConfig, RawJob, SearchQuery, titleMatches } from "./base";

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  categories: {
    commitment?: string;
    department?: string;
    location?: string;
    team?: string;
  };
  descriptionPlain?: string;
  createdAt: number; // ms epoch
  workplaceType?: "remote" | "hybrid" | "onsite";
}

export const leverConnector: Connector = {
  name: "lever",

  async search(query: SearchQuery, config: ConnectorConfig): Promise<RawJob[]> {
    const slugs: string[] = (config.companySlugs as string[] | undefined) ?? [];
    if (slugs.length === 0) return [];

    const results: RawJob[] = [];

    await Promise.allSettled(
      slugs.map(async (slug) => {
        try {
          const url = `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
          const res = await fetch(url, {
            signal: AbortSignal.timeout(10_000),
            headers: { "User-Agent": "JobFlowAI/1.0" },
          });
          if (!res.ok) return;

          const data = await res.json() as LeverPosting[];
          for (const job of data ?? []) {
            if (!titleMatches(job.text, query)) continue;
            const isRemote =
              job.workplaceType === "remote" ||
              /remote/i.test(job.categories?.location ?? "");

            results.push({
              externalId: `lever_${job.id}`,
              source: "lever",
              sourceUrl: job.hostedUrl,
              title: job.text,
              company: slug,
              location: job.categories?.location,
              remote: isRemote,
              jobType: job.categories?.commitment?.toLowerCase(),
              description: job.descriptionPlain,
              postedAt: new Date(job.createdAt),
              rawData: job as unknown as Record<string, unknown>,
            });
          }
        } catch {
          // skip
        }
      })
    );

    return results;
  },
};
