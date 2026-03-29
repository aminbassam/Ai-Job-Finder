interface ImportedJobDetails {
  sourceUrl: string;
  title?: string;
  company?: string;
  location?: string;
  description?: string;
  requirements?: string[];
  remote?: boolean;
  jobType?: string;
  salaryMin?: number;
  salaryMax?: number;
  postedAt?: Date;
  rawData: Record<string, unknown>;
}

function decodeHtml(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(input: string): string {
  return decodeHtml(
    input
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
  ).trim();
}

function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1]?.trim();
    if (value) return decodeHtml(value);
  }
  return undefined;
}

function extractMeta(html: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return firstMatch(html, [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["'][^>]*>`, "i"),
  ]);
}

function extractTitle(html: string): string | undefined {
  return firstMatch(html, [/<title[^>]*>([\s\S]*?)<\/title>/i]);
}

function normalizeJobTitle(value?: string): string | undefined {
  if (!value) return undefined;
  let title = stripTags(value)
    .replace(/\s+/g, " ")
    .trim();

  if (!title) return undefined;

  const separators = [" | ", " - ", " :: ", " — ", " · "];
  for (const separator of separators) {
    const parts = title.split(separator).map((part) => part.trim()).filter(Boolean);
    if (parts.length <= 1) continue;

    const candidate = parts.find((part) =>
      /\b(manager|engineer|designer|director|lead|specialist|analyst|coordinator|producer|developer|architect|consultant|administrator|scientist|writer|editor|officer|assistant|recruiter|strategist)\b/i.test(part)
    );
    if (candidate && candidate.length >= 6) {
      title = candidate;
      break;
    }
  }

  title = title
    .replace(/\bskip to main content\b/gi, " ")
    .replace(/\bexpand search\b/gi, " ")
    .replace(/\bjobs\b$/i, " ")
    .replace(/\s+/g, " ")
    .trim();

  return title || undefined;
}

function parseSalaryText(value?: string): { salaryMin?: number; salaryMax?: number } {
  if (!value) return {};
  const matches = [...value.matchAll(/\$?\s?(\d[\d,]{1,8})(?:\s*[kK])?/g)];
  if (matches.length === 0) return {};

  const nums = matches
    .map((m) => {
      const raw = m[1].replace(/,/g, "");
      const isK = /k/i.test(m[0]);
      const parsed = Number.parseInt(raw, 10);
      if (Number.isNaN(parsed)) return null;
      return isK || parsed < 1000 ? parsed * 1000 : parsed;
    })
    .filter((n): n is number => n !== null);

  if (nums.length === 0) return {};
  if (nums.length === 1) return { salaryMin: nums[0], salaryMax: nums[0] };
  return {
    salaryMin: Math.min(...nums),
    salaryMax: Math.max(...nums),
  };
}

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function flattenJsonLd(input: unknown): Record<string, unknown>[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.flatMap(flattenJsonLd);
  if (typeof input !== "object") return [];

  const obj = input as Record<string, unknown>;
  const own = [obj];
  if (Array.isArray(obj["@graph"])) {
    own.push(...flattenJsonLd(obj["@graph"]));
  }
  return own;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getNestedName(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (value && typeof value === "object") {
    return getString((value as Record<string, unknown>).name);
  }
  return undefined;
}

function toStringList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => (typeof item === "string" ? [stripTags(item)] : []))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\n|•|;|\u2022/)
      .map((item) => stripTags(item))
      .filter((item) => item.length > 0);
  }
  return [];
}

function extractJobPosting(html: string): Record<string, unknown> | undefined {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of scripts) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const nodes = flattenJsonLd(parsed);
      const posting = nodes.find((node) => {
        const type = node["@type"];
        if (Array.isArray(type)) return type.includes("JobPosting");
        return type === "JobPosting";
      });
      if (posting) return posting;
    } catch {
      // Ignore malformed JSON-LD blobs
    }
  }
  return undefined;
}

function extractRequirementsFromHtml(html: string): string[] {
  const bulletMatches = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
  const bullets = bulletMatches
    .map((match) => stripTags(match[1] ?? ""))
    .filter((item) => item.length > 20)
    .slice(0, 12);

  if (bullets.length > 0) return bullets;

  const text = stripTags(html);
  const sections = text.match(/(requirements|qualifications|what you bring|what we're looking for)([\s\S]{0,1200})/i);
  if (!sections?.[2]) return [];

  return sections[2]
    .split(/[•\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 20)
    .slice(0, 10);
}

export async function fetchImportedJobDetails(sourceUrl: string): Promise<ImportedJobDetails | null> {
  let response: Response;
  try {
    response = await fetch(sourceUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  const html = await response.text().catch(() => "");
  if (!html) return null;

  const jobPosting = extractJobPosting(html);
  const rawTitle =
    getString(jobPosting?.title) ??
    extractMeta(html, "og:title") ??
    extractMeta(html, "twitter:title") ??
    extractTitle(html);
  const rawDescription =
    getString(jobPosting?.description) ??
    extractMeta(html, "og:description") ??
    extractMeta(html, "description");
  const requirements =
    toStringList(jobPosting?.qualifications).slice(0, 12).length > 0
      ? toStringList(jobPosting?.qualifications).slice(0, 12)
      : extractRequirementsFromHtml(html);

  const company =
    getNestedName(jobPosting?.hiringOrganization) ??
    extractMeta(html, "og:site_name") ??
    extractMeta(html, "application-name");
  const location =
    getNestedName(jobPosting?.jobLocation) ??
    getString((jobPosting?.jobLocation as Record<string, unknown> | undefined)?.address as unknown) ??
    getNestedName((jobPosting?.jobLocation as Record<string, unknown> | undefined)?.address);

  const employmentType = Array.isArray(jobPosting?.employmentType)
    ? getString((jobPosting?.employmentType as unknown[])[0])
    : getString(jobPosting?.employmentType);
  const salaryInfo = parseSalaryText(
    getString((jobPosting?.baseSalary as Record<string, unknown> | undefined)?.value as unknown) ??
    JSON.stringify(jobPosting?.baseSalary ?? "") ??
    rawDescription
  );
  const postedAt =
    parseDate(getString(jobPosting?.datePosted)) ??
    parseDate(extractMeta(html, "article:published_time")) ??
    parseDate(extractMeta(html, "og:updated_time"));

  const pageText = stripTags(html).toLowerCase();
  const remote =
    getString(jobPosting?.jobLocationType)?.toUpperCase() === "TELECOMMUTE" ||
    /\bremote\b/.test(pageText) ||
    /\bwork from home\b/.test(pageText);

  return {
    sourceUrl: response.url,
    title: normalizeJobTitle(rawTitle),
    company: company ? stripTags(company) : undefined,
    location: location ? stripTags(location) : undefined,
    description: rawDescription ? stripTags(rawDescription) : undefined,
    requirements,
    remote,
    jobType: employmentType,
    salaryMin: salaryInfo.salaryMin,
    salaryMax: salaryInfo.salaryMax,
    postedAt,
    rawData: {
      fetchedUrl: response.url,
      pageTitle: rawTitle,
      metadata: {
        ogTitle: extractMeta(html, "og:title"),
        ogDescription: extractMeta(html, "og:description"),
        description: extractMeta(html, "description"),
        siteName: extractMeta(html, "og:site_name"),
      },
      jobPosting,
    },
  };
}
