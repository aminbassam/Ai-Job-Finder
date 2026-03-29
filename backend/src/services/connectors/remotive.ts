/**
 * Remotive connector — free remote jobs API, no key required.
 * https://remotive.com/api/remote-jobs
 *
 * Root cause of the original failure:
 *   The `search` param only matches single words — multi-word queries like
 *   "software engineer" return 0 results.
 *
 * Fix:
 *   Map job title keywords to Remotive category slugs, fetch jobs from
 *   matched categories, then filter client-side with `titleMatches`.
 *   When no category matches, fall back to fetching all jobs (~20-30 total)
 *   and filtering entirely client-side.
 */
import { Connector, RawJob, SearchQuery, titleMatches } from "./base";

/* ─── Category keyword mapping ──────────────────────────────────────────── */

const CATEGORY_KEYWORDS: Array<{ slug: string; keywords: string[] }> = [
  {
    slug: "software-development",
    keywords: [
      "engineer", "developer", "programmer", "coder", "architect",
      "frontend", "backend", "fullstack", "full-stack", "full stack",
      "software", "web", "mobile", "ios", "android", "react", "typescript",
      "javascript", "python", "java", "ruby", "golang", "rust", "php",
    ],
  },
  {
    slug: "ai-ml",
    keywords: [
      "ai", "ml", "machine learning", "deep learning", "llm", "nlp",
      "data science", "data scientist", "artificial intelligence", "model",
      "computer vision",
    ],
  },
  {
    slug: "data",
    keywords: [
      "data analyst", "analyst", "analytics", "business intelligence",
      "bi", "sql", "tableau", "data engineer", "etl",
    ],
  },
  {
    slug: "devops",
    keywords: [
      "devops", "sysadmin", "infrastructure", "cloud", "platform",
      "kubernetes", "docker", "aws", "gcp", "azure", "site reliability",
      "sre", "devsecops", "release engineer",
    ],
  },
  {
    slug: "product",
    keywords: [
      "product manager", "product owner", "po", "product lead",
      "head of product", "vp product",
    ],
  },
  {
    slug: "project-management",
    keywords: [
      "project manager", "program manager", "scrum master",
      "agile coach", "delivery manager",
    ],
  },
  {
    slug: "design",
    keywords: [
      "designer", "ux", "ui", "graphic", "visual", "motion",
      "product design", "interaction design",
    ],
  },
  {
    slug: "marketing",
    keywords: [
      "marketing", "growth", "seo", "sem", "content", "brand",
      "demand generation", "lifecycle",
    ],
  },
  {
    slug: "sales-business",
    keywords: [
      "sales", "account executive", "account manager", "business development",
      "bdr", "sdr", "revenue",
    ],
  },
  {
    slug: "finance",
    keywords: ["finance", "accountant", "controller", "cfo", "financial analyst", "treasury"],
  },
  {
    slug: "qa",
    keywords: ["qa", "quality assurance", "tester", "testing", "automation engineer", "sdet"],
  },
  {
    slug: "writing",
    keywords: ["writer", "copywriter", "technical writer", "content writer", "editor"],
  },
  {
    slug: "human-resources",
    keywords: ["hr", "recruiter", "talent", "people operations", "hrbp"],
  },
  {
    slug: "customer-service",
    keywords: ["support", "customer service", "customer success", "customer experience", "cx"],
  },
];

function resolveCategorySlugs(query: SearchQuery): string[] {
  const text = [...query.jobTitles, ...query.mustHaveKeywords]
    .join(" ")
    .toLowerCase();

  if (!text.trim()) return []; // no titles → fetch all below

  const matched = new Set<string>();
  for (const cat of CATEGORY_KEYWORDS) {
    if (cat.keywords.some((kw) => text.includes(kw))) {
      matched.add(cat.slug);
    }
  }
  return Array.from(matched);
}

/* ─── Salary helpers ────────────────────────────────────────────────────── */

function parseSalary(raw: string): { min?: number; max?: number } {
  if (!raw) return {};
  const isK = /k/i.test(raw);
  const nums = raw.replace(/[$,k]/gi, "").match(/\d+(\.\d+)?/g);
  if (!nums) return {};
  const vals = nums.map((n) => Math.round(Number(n) * (isK ? 1000 : 1)));
  if (vals.length >= 2) return { min: Math.min(...vals), max: Math.max(...vals) };
  if (vals.length === 1) return { min: vals[0] };
  return {};
}

/* ─── Connector ─────────────────────────────────────────────────────────── */

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  candidate_required_location: string;
  job_type: string;
  salary: string;
  description: string;
  tags: string[];
  publication_date: string;
}

interface RemotiveResponse {
  "job-count": number;
  jobs: RemotiveJob[];
}

export const remotiveConnector: Connector = {
  name: "remotive",

  async search(query: SearchQuery): Promise<RawJob[]> {
    const categorySlugs = resolveCategorySlugs(query);

    // Determine which URLs to fetch.
    // - If we have matched categories → fetch each category (up to 3)
    // - If no match → fetch all jobs without a category filter
    const urls: string[] =
      categorySlugs.length > 0
        ? categorySlugs
            .slice(0, 3)
            .map((slug) => `https://remotive.com/api/remote-jobs?category=${slug}&limit=100`)
        : ["https://remotive.com/api/remote-jobs?limit=100"];

    const seenIds = new Set<string>();
    const results: RawJob[] = [];

    await Promise.allSettled(
      urls.map(async (url) => {
        try {
          const res = await fetch(url, {
            headers: { "User-Agent": "JobFlowAI/1.0" },
            signal: AbortSignal.timeout(15_000),
          });
          if (!res.ok) return;

          const data = (await res.json()) as RemotiveResponse;
          const jobs: RemotiveJob[] = data.jobs ?? [];

          for (const job of jobs) {
            const id = String(job.id);
            if (seenIds.has(id)) continue;
            seenIds.add(id);

            // Title filter — handles multi-word titles correctly
            if (query.jobTitles.length > 0 && !titleMatches(job.title, query)) continue;

            const salary = parseSalary(job.salary ?? "");
            const postedAt = job.publication_date
              ? new Date(job.publication_date)
              : undefined;

            results.push({
              externalId:  id,
              source:      "remotive",
              sourceUrl:   job.url,
              title:       job.title,
              company:     job.company_name,
              location:    job.candidate_required_location || "Remote",
              remote:      true,
              jobType:     job.job_type,
              description: job.description,
              requirements: job.tags ?? [],
              salaryMin:   salary.min,
              salaryMax:   salary.max,
              postedAt,
              rawData: job as unknown as Record<string, unknown>,
            });
          }
        } catch {
          // Silently skip failed requests
        }
      })
    );

    return results;
  },
};
