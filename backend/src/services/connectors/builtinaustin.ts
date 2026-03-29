import { createHash } from "crypto";
import type { Browser, Page } from "playwright";
import { chromium } from "playwright";
import {
  Connector,
  ConnectorConfig,
  RawJob,
  SearchQuery,
  jobTypeMatches,
  normalizeJobType,
  postedWithinRange,
  titleMatches,
} from "./base";
import { extractJobSignals } from "../job-ai-extraction";

interface BuiltInAustinFilters {
  locations?: string[];
  experience_levels?: string[];
  remote_only?: boolean;
  keywords?: string[];
}

interface BuiltInAustinConfig {
  enabled?: boolean;
  base_url?: string;
  max_pages?: number;
  rate_limit_ms?: number;
  timeout_ms?: number;
  filters?: BuiltInAustinFilters;
}

interface ParsedJobCard {
  title: string;
  company?: string;
  location?: string;
  link: string;
  tags: string[];
  postedText?: string;
}

interface JobDetailResult {
  description?: string;
  requirements: string[];
  salaryMin?: number;
  salaryMax?: number;
  postedAt?: Date;
  remote?: boolean;
  jobType?: string;
  tags: string[];
}

interface ParsedDetailPayload {
  title?: string;
  company?: string;
  location?: string;
  description?: string;
  requirements: string[];
  postedText?: string;
  salaryText?: string;
  tags: string[];
  employmentType?: string;
  remote?: boolean;
}

const DEFAULT_CONFIG: Required<Omit<BuiltInAustinConfig, "filters">> & { filters: Required<BuiltInAustinFilters> } = {
  enabled: true,
  base_url: "https://www.builtinaustin.com/jobs",
  max_pages: 5,
  rate_limit_ms: 1500,
  timeout_ms: 15000,
  filters: {
    locations: [],
    experience_levels: [],
    remote_only: false,
    keywords: [],
  },
};

const CARD_SELECTORS = [
  "article[data-id*='job']",
  "article[class*='job-card']",
  "div[class*='job-card']",
  "li[class*='job-card']",
  "article[class*='job-listing']",
  "div[class*='job-listing']",
  "li[class*='job-listing']",
];

const DETAIL_SELECTORS = [
  "[data-testid='job-description']",
  ".job-description",
  "[class*='job-description']",
  "[class*='description']",
  "main article",
  "main",
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function combineConfig(config: ConnectorConfig): Required<Omit<BuiltInAustinConfig, "filters">> & { filters: Required<BuiltInAustinFilters> } {
  const input = (config ?? {}) as BuiltInAustinConfig;
  return {
    enabled: input.enabled ?? DEFAULT_CONFIG.enabled,
    base_url: input.base_url?.trim() || DEFAULT_CONFIG.base_url,
    max_pages: Math.min(Math.max(Number(input.max_pages ?? DEFAULT_CONFIG.max_pages) || DEFAULT_CONFIG.max_pages, 1), 10),
    rate_limit_ms: Math.min(Math.max(Number(input.rate_limit_ms ?? DEFAULT_CONFIG.rate_limit_ms) || DEFAULT_CONFIG.rate_limit_ms, 600), 5000),
    timeout_ms: Math.min(Math.max(Number(input.timeout_ms ?? DEFAULT_CONFIG.timeout_ms) || DEFAULT_CONFIG.timeout_ms, 5000), 30000),
    filters: {
      locations: dedupe(input.filters?.locations ?? DEFAULT_CONFIG.filters.locations),
      experience_levels: dedupe(input.filters?.experience_levels ?? DEFAULT_CONFIG.filters.experience_levels),
      remote_only: input.filters?.remote_only ?? DEFAULT_CONFIG.filters.remote_only,
      keywords: dedupe(input.filters?.keywords ?? DEFAULT_CONFIG.filters.keywords),
    },
  };
}

function slugifyTitle(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildSearchUrls(query: SearchQuery, config: Required<Omit<BuiltInAustinConfig, "filters">>): string[] {
  const titles = dedupe(query.jobTitles).slice(0, 3);
  if (titles.length === 0) {
    return [config.base_url];
  }
  return titles.map((title) => `${config.base_url}/search/${slugifyTitle(title)}`);
}

function toAbsoluteUrl(baseUrl: string, href: string): string {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

function normalizeWhitespace(value: string | undefined | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(value: string): string {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim();
}

function parseMoneyRange(value?: string): { salaryMin?: number; salaryMax?: number } {
  const text = normalizeWhitespace(value);
  if (!text) return {};
  const matches = [...text.matchAll(/\$?\s?(\d[\d,]{1,8})(?:\s*[kK])?/g)];
  if (matches.length === 0) return {};
  const values = matches
    .map((match) => {
      const raw = match[1].replace(/,/g, "");
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return null;
      return /k/i.test(match[0]) || parsed < 1000 ? parsed * 1000 : parsed;
    })
    .filter((item): item is number => item != null);
  if (values.length === 0) return {};
  return {
    salaryMin: Math.min(...values),
    salaryMax: Math.max(...values),
  };
}

function parseRelativeDate(value?: string): Date | undefined {
  const text = normalizeWhitespace(value).toLowerCase();
  if (!text) return undefined;
  const absolute = new Date(text);
  if (!Number.isNaN(absolute.getTime())) return absolute;

  const relative = text.match(/(\d+)\s*(minute|hour|day|week|month|year)s?\s+ago/);
  if (!relative) return undefined;
  const amount = Number(relative[1]);
  const unit = relative[2];
  const date = new Date();
  if (unit === "minute") date.setMinutes(date.getMinutes() - amount);
  else if (unit === "hour") date.setHours(date.getHours() - amount);
  else if (unit === "day") date.setDate(date.getDate() - amount);
  else if (unit === "week") date.setDate(date.getDate() - amount * 7);
  else if (unit === "month") date.setMonth(date.getMonth() - amount);
  else if (unit === "year") date.setFullYear(date.getFullYear() - amount);
  return date;
}

function buildExternalId(job: { title: string; company?: string; location?: string; link: string }): string {
  return createHash("sha1")
    .update([job.title, job.company ?? "", job.location ?? "", job.link].join("|"))
    .digest("hex")
    .slice(0, 20);
}

function hasKeywordMatch(values: string[], keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const haystack = values.join(" ").toLowerCase();
  return keywords.every((keyword) => haystack.includes(keyword.toLowerCase()));
}

function matchesLocation(location: string | undefined, remote: boolean, locations: string[], remoteOnly: boolean): boolean {
  if (remoteOnly) return remote;
  if (locations.length === 0) return true;
  const normalized = (location ?? "").toLowerCase();
  return locations.some((candidate) => {
    const target = candidate.toLowerCase();
    return target === "remote"
      ? remote
      : normalized.includes(target) || target.includes(normalized);
  });
}

function matchesExperienceLevel(values: string[], selectedLevels: string[]): boolean {
  if (selectedLevels.length === 0) return true;
  const haystack = values.join(" ").toLowerCase();
  return selectedLevels.some((level) => {
    const normalized = level.toLowerCase();
    if (normalized.includes("entry")) return /\b(entry|junior|associate|new grad)\b/.test(haystack);
    if (normalized.includes("mid")) return /\b(mid|intermediate|ii|iii)\b/.test(haystack);
    if (normalized.includes("senior")) return /\b(senior|sr\.?)\b/.test(haystack);
    if (normalized.includes("lead")) return /\b(lead|principal|staff)\b/.test(haystack);
    if (normalized.includes("director")) return /\b(director|head of|vp|vice president)\b/.test(haystack);
    return haystack.includes(normalized);
  });
}

function loadCheerio(): { load: (html: string) => any } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("cheerio");
  } catch {
    return null;
  }
}

function parseJobCards(html: string, pageUrl: string): ParsedJobCard[] {
  const cheerio = loadCheerio();
  if (!cheerio) return [];
  const $ = cheerio.load(html);
  const jobs: ParsedJobCard[] = [];
  const seen = new Set<string>();

  for (const selector of CARD_SELECTORS) {
    $(selector).each((_: unknown, element: unknown) => {
      const root = $(element);
      const anchorCandidates = [
        root.find("a[href*='/job/']").first(),
        root.find("a[href*='/jobs/']").first(),
        root.find("a").first(),
      ];
      const anchor = anchorCandidates.find((candidate) => candidate.length > 0) ?? root.find("a").first();
      const href = anchor.attr("href");
      if (!href) return;
      const link = toAbsoluteUrl(pageUrl, href);
      if (seen.has(link)) return;

      const title = normalizeWhitespace(
        root.find("h2, h3, [class*='title'], [data-testid*='title']").first().text() ||
        anchor.text()
      );
      if (!title || title.length < 3) return;

      const company = normalizeWhitespace(
        root.find("[class*='company'], [data-testid*='company']").first().text()
      );
      const location = normalizeWhitespace(
        root.find("[class*='location'], [data-testid*='location'], [class*='meta']").first().text()
      );
      const tags = dedupe(
        root.find("[class*='tag'], [class*='badge'], [class*='chip'], li, span")
          .map((__: unknown, child: unknown) => normalizeWhitespace($(child).text()))
          .get()
          .filter((item: string) => item.length > 1 && item.length <= 80)
      ).slice(0, 12);
      const postedText = normalizeWhitespace(
        root.find("time, [class*='posted'], [data-testid*='posted']").first().text()
      );

      seen.add(link);
      jobs.push({ title, company, location, link, tags, postedText });
    });

    if (jobs.length > 0) break;
  }

  if (jobs.length > 0) return jobs;

  $("a[href*='/job/'], a[href*='/jobs/']").each((_: unknown, element: unknown) => {
    const anchor = $(element);
    const href = anchor.attr("href");
    if (!href) return;
    const link = toAbsoluteUrl(pageUrl, href);
    if (seen.has(link)) return;
    const title = normalizeWhitespace(anchor.text());
    if (!title || title.length < 6) return;
    seen.add(link);
    jobs.push({ title, link, tags: [] });
  });

  return jobs;
}

async function parseJobCardsFromPage(page: Page): Promise<ParsedJobCard[]> {
  return page.evaluate(({ baseUrl, selectors }: { baseUrl: string; selectors: string[] }) => {
    const toText = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
    const toAbsolute = (href: string | null) => {
      if (!href) return "";
      try {
        return new URL(href, baseUrl).toString();
      } catch {
        return href;
      }
    };
    const seen = new Set<string>();
    const results: ParsedJobCard[] = [];

    for (const selector of selectors) {
      const nodes = Array.from((globalThis as any).document.querySelectorAll(selector) as any[]);
      for (const node of nodes) {
        const element = node as any;
        const anchor =
          element.querySelector("a[href*='/job/']") ||
          element.querySelector("a[href*='/jobs/']") ||
          element.querySelector("a");
        const link = toAbsolute(anchor?.getAttribute("href") ?? "");
        if (!link || seen.has(link)) continue;
        const title = toText(
          element.querySelector("h2, h3, [class*='title'], [data-testid*='title']")?.textContent ||
          anchor?.textContent
        );
        if (!title || title.length < 3) continue;
        const company = toText(element.querySelector("[class*='company'], [data-testid*='company']")?.textContent);
        const location = toText(element.querySelector("[class*='location'], [data-testid*='location'], [class*='meta']")?.textContent);
        const postedText = toText(element.querySelector("time, [class*='posted'], [data-testid*='posted']")?.textContent);
        const tags = Array.from(element.querySelectorAll("[class*='tag'], [class*='badge'], [class*='chip'], li, span") as any[])
          .map((child: any) => toText(child.textContent))
          .filter((item: string) => item.length > 1 && item.length <= 80)
          .filter((item: string, index: number, all: string[]) => all.indexOf(item) === index)
          .slice(0, 12);
        seen.add(link);
        results.push({ title, company, location, link, tags, postedText });
      }
      if (results.length > 0) break;
    }

    if (results.length > 0) return results;

    return Array.from((globalThis as any).document.querySelectorAll("a[href*='/job/'], a[href*='/jobs/']") as any[])
      .map((anchor: any) => {
        const link = toAbsolute(anchor.getAttribute("href"));
        const title = toText(anchor.textContent);
        return { title, company: "", location: "", link, tags: [], postedText: "" };
      })
      .filter((job: ParsedJobCard) => Boolean(job.link) && job.title.length >= 6)
      .filter((job: ParsedJobCard, index: number, all: ParsedJobCard[]) => all.findIndex((candidate) => candidate.link === job.link) === index);
  }, { baseUrl: page.url(), selectors: CARD_SELECTORS });
}

function extractJsonLdObjects(html: string): Record<string, unknown>[] {
  const objects: Record<string, unknown>[] = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === "object") objects.push(item as Record<string, unknown>);
        }
      } else if (parsed && typeof parsed === "object") {
        objects.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Ignore malformed script blobs.
    }
  }
  return objects;
}

function parseDetailFromHtml(html: string): ParsedDetailPayload {
  const cheerio = loadCheerio();
  if (cheerio) {
    const $ = cheerio.load(html);
    const title = normalizeWhitespace($("h1, [data-testid='job-title'], [class*='job-title']").first().text());
    const company = normalizeWhitespace($("[class*='company'], [data-testid='company']").first().text());
    const location = normalizeWhitespace($("[class*='location'], [data-testid='location']").first().text());
    const tags = dedupe(
      $("[class*='tag'], [class*='badge'], [class*='chip'], [class*='meta'] span")
        .map((_: unknown, element: unknown) => normalizeWhitespace($(element).text()))
        .get()
        .filter((item: string) => item.length > 1 && item.length <= 80)
    ).slice(0, 20);
    const descriptionHtml =
      DETAIL_SELECTORS.map((selector) => $(selector).first().html() ?? "").find(Boolean) ??
      $("main").first().html() ??
      "";
    const description = stripTags(descriptionHtml);
    const requirements = dedupe(
      $("li")
        .map((_: unknown, element: unknown) => stripTags($(element).text()))
        .get()
        .filter((item: string) => item.length > 20)
    ).slice(0, 16);
    const salaryText = normalizeWhitespace($("[class*='salary'], [data-testid*='salary']").first().text());
    const postedText = normalizeWhitespace($("time, [class*='posted'], [data-testid*='posted']").first().text());
    const employmentType = normalizeWhitespace($("[class*='employment'], [data-testid*='employment']").first().text());
    const remote = /\bremote\b/i.test([location, description, ...tags].join(" "));
    return { title, company, location, description, requirements, postedText, salaryText, tags, employmentType, remote };
  }

  const text = stripTags(html);
  return {
    title: normalizeWhitespace((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "")),
    company: "",
    location: "",
    description: text,
    requirements: [],
    postedText: "",
    salaryText: "",
    tags: [],
    employmentType: "",
    remote: /\bremote\b/i.test(text),
  };
}

async function fetchPageWithRetry(browser: Browser, url: string, timeoutMs: number, attempts = 2): Promise<{ html: string; finalUrl: string; page: Page }> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const page = await browser.newPage();
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: timeoutMs });
      return { html: await page.content(), finalUrl: page.url(), page };
    } catch (err) {
      lastError = err as Error;
      await page.close().catch(() => undefined);
      if (attempt < attempts) {
        await sleep(500 * attempt);
      }
    }
  }
  throw lastError ?? new Error(`Failed to fetch ${url}`);
}

async function fetchAllPages(browser: Browser, searchUrl: string, config: Required<Omit<BuiltInAustinConfig, "filters">>): Promise<ParsedJobCard[]> {
  const allJobs: ParsedJobCard[] = [];
  const seen = new Set<string>();

  for (let pageNumber = 1; pageNumber <= config.max_pages; pageNumber += 1) {
    const pageUrl = new URL(searchUrl);
    pageUrl.searchParams.set("page", String(pageNumber));

    let fetched: { html: string; finalUrl: string; page: Page } | null = null;
    try {
      fetched = await fetchPageWithRetry(browser, pageUrl.toString(), config.timeout_ms);
      const parsed = parseJobCards(fetched.html, fetched.finalUrl);
      const jobs = parsed.length > 0 ? parsed : await parseJobCardsFromPage(fetched.page);
      if (jobs.length === 0) break;
      let newOnPage = 0;
      for (const job of jobs) {
        if (seen.has(job.link)) continue;
        seen.add(job.link);
        allJobs.push(job);
        newOnPage += 1;
      }
      if (newOnPage === 0) break;
    } catch (err) {
      console.error(`[builtinaustin] page ${pageNumber} failed:`, (err as Error).message);
    } finally {
      await fetched?.page.close().catch(() => undefined);
    }

    await sleep(config.rate_limit_ms);
  }

  return allJobs;
}

function selectFirstJsonLdPosting(objects: Record<string, unknown>[]): Record<string, unknown> | undefined {
  return objects.find((item) => {
    const type = item["@type"];
    return Array.isArray(type) ? type.includes("JobPosting") : type === "JobPosting";
  });
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

async function fetchJobDetail(browser: Browser, url: string, timeoutMs: number): Promise<JobDetailResult> {
  let fetched: { html: string; finalUrl: string; page: Page } | null = null;
  try {
    fetched = await fetchPageWithRetry(browser, url, timeoutMs);
    const parsed = parseDetailFromHtml(fetched.html);
    const jsonLdObjects = extractJsonLdObjects(fetched.html);
    const posting = selectFirstJsonLdPosting(jsonLdObjects);
    const salaryData = parseMoneyRange(
      firstString(
        parsed.salaryText,
        typeof posting?.baseSalary === "string" ? posting.baseSalary : undefined,
        JSON.stringify(posting?.baseSalary ?? "")
      )
    );
    const postedAt = parseRelativeDate(
      firstString(
        parsed.postedText,
        typeof posting?.datePosted === "string" ? posting.datePosted : undefined
      )
    );
    const requirementsFromJsonLd = Array.isArray(posting?.qualifications)
      ? dedupe((posting?.qualifications as unknown[]).filter((item): item is string => typeof item === "string"))
      : typeof posting?.qualifications === "string"
        ? dedupe((posting.qualifications as string).split(/\n|•|;/).map((item) => item.trim()))
        : [];

    return {
      description: firstString(parsed.description, typeof posting?.description === "string" ? stripTags(posting.description) : undefined),
      requirements: dedupe([...parsed.requirements, ...requirementsFromJsonLd]).slice(0, 16),
      salaryMin: salaryData.salaryMin,
      salaryMax: salaryData.salaryMax,
      postedAt,
      remote:
        parsed.remote ??
        (typeof posting?.jobLocationType === "string" && posting.jobLocationType.toUpperCase() === "TELECOMMUTE"),
      jobType: normalizeJobType(firstString(parsed.employmentType, typeof posting?.employmentType === "string" ? posting.employmentType : undefined)),
      tags: parsed.tags,
    };
  } finally {
    await fetched?.page.close().catch(() => undefined);
  }
}

function normalizeJob(input: {
  card: ParsedJobCard;
  detail: JobDetailResult;
  enriched: JobAiExtraction;
  sourceUrl: string;
}): RawJob {
  const requirements = dedupe([
    ...input.detail.requirements,
    ...input.enriched.minimumQualifications,
  ]).slice(0, 20);
  const tags = dedupe([
    ...input.card.tags,
    ...input.detail.tags,
    ...input.enriched.skills,
    ...input.enriched.keywords,
  ]).slice(0, 30);

  return {
    externalId: `builtinaustin_${buildExternalId({
      title: input.card.title,
      company: input.card.company,
      location: input.card.location,
      link: input.sourceUrl,
    })}`,
    source: "builtinaustin",
    sourceUrl: input.sourceUrl,
    title: input.card.title,
    company: input.card.company,
    location: input.card.location,
    remote: input.detail.remote ?? /\bremote\b/i.test([input.card.location, ...tags].join(" ")),
    jobType: normalizeJobType(input.detail.jobType),
    description: input.detail.description,
    requirements,
    salaryMin: input.detail.salaryMin,
    salaryMax: input.detail.salaryMax,
    postedAt: input.detail.postedAt,
    rawData: {
      tags,
      skills: input.enriched.skills,
      keywords: input.enriched.keywords,
      minimumQualifications: input.enriched.minimumQualifications,
    },
  };
}

function filterNormalizedJob(
  job: RawJob,
  query: SearchQuery,
  config: Required<Omit<BuiltInAustinConfig, "filters">> & { filters: Required<BuiltInAustinFilters> }
): boolean {
  const effectiveLocations = dedupe([...query.locations, ...config.filters.locations]);
  const effectiveKeywords = dedupe([...query.mustHaveKeywords, ...config.filters.keywords]);
  const effectiveExperienceLevels = dedupe(query.experienceLevels ?? []).length > 0
    ? dedupe(query.experienceLevels ?? [])
    : config.filters.experience_levels;
  const effectiveRemoteOnly = query.remoteOnly || config.filters.remote_only;

  const values = [
    job.title,
    job.company ?? "",
    job.location ?? "",
    job.description ?? "",
    ...(job.requirements ?? []),
    ...((job.rawData?.tags as string[] | undefined) ?? []),
  ];

  if (!titleMatches(job.title, query)) return false;
  if (!matchesLocation(job.location, Boolean(job.remote), effectiveLocations, effectiveRemoteOnly)) return false;
  if (!jobTypeMatches(job.jobType, query.jobTypes ?? [])) return false;
  if (!postedWithinRange(job.postedAt, query.postedWithinDays)) return false;
  if (!hasKeywordMatch(values, effectiveKeywords)) return false;
  if (!matchesExperienceLevel(values, effectiveExperienceLevels)) return false;
  return true;
}

export type JobAiExtraction = {
  skills: string[];
  minimumQualifications: string[];
  keywords: string[];
};

export class BuiltInAustinConnector implements Connector {
  name = "builtinaustin";

  async search(query: SearchQuery, connectorConfig: ConnectorConfig): Promise<RawJob[]> {
    const config = combineConfig(connectorConfig);
    if (!config.enabled) return [];

    const searchUrls = buildSearchUrls(query, config);
    const browser = await chromium.launch({ headless: true });
    const dedupeSet = new Set<string>();
    const normalizedJobs: RawJob[] = [];

    try {
      for (const searchUrl of searchUrls) {
        const cards = await fetchAllPages(browser, searchUrl, config);
        for (const card of cards) {
          try {
            const detail = await fetchJobDetail(browser, card.link, config.timeout_ms);
            const enriched = detail.description
              ? await extractJobSignals((connectorConfig.userId as string | undefined) ?? "", detail.description).catch(() => ({
                  skills: [],
                  minimumQualifications: [],
                  keywords: [],
                }))
              : { skills: [], minimumQualifications: [], keywords: [] };

            const normalized = normalizeJob({
              card,
              detail,
              enriched,
              sourceUrl: card.link,
            });

            const duplicateKey = createHash("sha1")
              .update([normalized.title, normalized.company ?? "", normalized.location ?? ""].join("|"))
              .digest("hex");
            if (dedupeSet.has(duplicateKey)) continue;
            if (!filterNormalizedJob(normalized, query, config)) continue;

            dedupeSet.add(duplicateKey);
            normalizedJobs.push(normalized);
          } catch (err) {
            console.error(`[builtinaustin] detail fetch failed for ${card.link}:`, (err as Error).message);
          }
          await sleep(config.rate_limit_ms);
        }
      }
    } finally {
      await browser.close().catch(() => undefined);
    }

    return normalizedJobs;
  }
}

export const builtInAustinConnector = new BuiltInAustinConnector();
