/**
 * Google connector — best-effort Google web search for job pages.
 *
 * This connector does not use an official Google API. It performs a normal
 * search query, extracts result URLs, then enriches each result by fetching
 * job page metadata. Because Google markup changes over time, this connector
 * is intentionally resilient and falls back gracefully when enrichment fails.
 */
import { createHash } from "crypto";
import {
  Connector,
  ConnectorConfig,
  RawJob,
  SearchQuery,
  normalizeJobType,
} from "./base";
import { fetchImportedJobDetails } from "../import-metadata";

interface ParsedSearchResult {
  url: string;
  title?: string;
  snippet?: string;
}

function stripTags(input: string): string {
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function buildQuery(query: SearchQuery, config: ConnectorConfig): string {
  const primaryTitle = query.jobTitles[0] ?? "job";
  const location = query.locations[0] ?? "";
  const keywords = query.mustHaveKeywords.slice(0, 3).join(" ");
  const jobTypes = (query.jobTypes ?? []).slice(0, 2).join(" ");
  const domains = ((config.domains as string[] | undefined) ?? [])
    .map((domain) => `site:${domain}`)
    .join(" OR ");

  return [
    `"${primaryTitle}"`,
    "jobs",
    location,
    keywords,
    jobTypes,
    query.remoteOnly ? "remote" : "",
    domains ? `(${domains})` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function extractSearchResults(html: string): ParsedSearchResult[] {
  const results: ParsedSearchResult[] = [];
  const seen = new Set<string>();
  const pattern =
    /<a[^>]+href="\/url\?q=([^"&]+)[^"]*"[^>]*>[\s\S]*?(?:<h3[^>]*>([\s\S]*?)<\/h3>|<div[^>]*role="heading"[^>]*>([\s\S]*?)<\/div>)([\s\S]{0,800}?)<\/a>/gi;

  for (const match of html.matchAll(pattern)) {
    const rawUrl = match[1];
    if (!rawUrl) continue;

    const url = decodeURIComponent(rawUrl);
    if (
      !/^https?:\/\//i.test(url) ||
      /google\./i.test(url) ||
      /webcache\.googleusercontent/i.test(url)
    ) {
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);

    const title = stripTags(match[2] ?? match[3] ?? "");
    const snippet = stripTags(match[4] ?? "");
    results.push({ url, title, snippet });
  }

  return results;
}

function companyFromUrl(url: string): string | undefined {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "");
    return host.split(".").slice(0, -1).join(".") || host;
  } catch {
    return undefined;
  }
}

function remoteFromText(...values: Array<string | undefined>): boolean {
  return values.some((value) => /\bremote\b|\bwork from home\b/i.test(value ?? ""));
}

export const googleConnector: Connector = {
  name: "google",

  async search(query: SearchQuery, config: ConnectorConfig): Promise<RawJob[]> {
    const q = buildQuery(query, config);
    if (!q.trim()) return [];

    const limit = Math.min(
      Math.max(Number(config.resultLimit ?? 8) || 8, 5),
      20
    );

    const url = new URL("https://www.google.com/search");
    url.searchParams.set("q", q);
    url.searchParams.set("hl", String(config.language ?? "en"));
    url.searchParams.set("num", String(limit));
    if (query.postedWithinDays) {
      url.searchParams.set("tbs", `qdr:d${query.postedWithinDays}`);
    }

    let html = "";
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(12_000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      if (!res.ok) return [];
      html = await res.text();
    } catch {
      return [];
    }

    const searchResults = extractSearchResults(html).slice(0, limit);
    if (searchResults.length === 0) return [];

    const jobs = await Promise.allSettled(
      searchResults.map(async (result) => {
        const imported = await fetchImportedJobDetails(result.url).catch(() => null);
        const title = imported?.title ?? result.title ?? "Google job result";
        const description = imported?.description ?? result.snippet;
        const remote =
          imported?.remote ??
          remoteFromText(title, description, imported?.location);
        const jobType = normalizeJobType(imported?.jobType);

        return {
          externalId: `google_${createHash("sha1").update(result.url).digest("hex").slice(0, 16)}`,
          source: "google",
          sourceUrl: imported?.sourceUrl ?? result.url,
          title,
          company: imported?.company ?? companyFromUrl(result.url),
          location: imported?.location,
          remote,
          jobType,
          description,
          requirements: imported?.requirements,
          salaryMin: imported?.salaryMin,
          salaryMax: imported?.salaryMax,
          postedAt: imported?.postedAt,
          rawData: {
            query: q,
            googleResult: result,
            imported: imported?.rawData ?? null,
          },
        } satisfies RawJob;
      })
    );

    return jobs
      .flatMap((job) => (job.status === "fulfilled" ? [job.value] : []))
      .filter((job) => Boolean(job.sourceUrl));
  },
};
