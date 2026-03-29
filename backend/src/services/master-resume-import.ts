import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { runJsonCompletion } from "./ai-client";
import { MasterResumeProfileInput, MasterResumeBulletInput } from "./master-resume";

interface ParsedExperience {
  title?: string;
  company?: string;
  start_date?: string;
  end_date?: string;
  bullets?: string[];
}

interface ParsedProject {
  name?: string;
  role?: string;
  description?: string;
  tools?: string[];
  team_size?: number;
  outcome?: string;
  metrics?: string;
}

interface ParsedEducation {
  school?: string;
  degree?: string;
  field_of_study?: string;
  start_date?: string;
  end_date?: string;
  notes?: string;
}

interface ParsedResumeJson {
  name?: string;
  title?: string;
  summary?: string;
  experience?: ParsedExperience[];
  skills?: string[] | {
    core?: string[];
    tools?: string[];
    soft?: string[];
    certifications?: string[];
  };
  certificates?: string[];
  education?: ParsedEducation[];
  projects?: ParsedProject[];
  leadership?: {
    team_size?: number;
    scope?: string;
    stakeholders?: string[];
    budget?: string;
  };
}

interface ParseStructuredOptions {
  fallbackName?: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanArray(values?: string[] | null): string[] {
  return Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean)));
}

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function inferNameFromLinkedInUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const slug = parsed.pathname
      .split("/")
      .filter(Boolean)
      .pop();
    if (!slug) return undefined;
    return titleCase(slug.replace(/^in\b/i, "").replace(/[^a-zA-Z0-9\s_-]/g, " "));
  } catch {
    return undefined;
  }
}

function buildLinkedInFallbackText(url: string, profileName?: string): string {
  const inferredName = profileName?.trim() || inferNameFromLinkedInUrl(url) || "LinkedIn Candidate";
  return [
    inferredName,
    "LinkedIn profile import",
    `Source URL: ${url}`,
    "Structured import fallback activated because the live LinkedIn page could not be read directly.",
    "Please review and enrich the imported profile manually where needed.",
  ].join("\n");
}

function extractSection(text: string, startPattern: RegExp, endPatterns: RegExp[]): string {
  const match = text.match(startPattern);
  if (!match || match.index == null) return "";
  const start = match.index + match[0].length;
  const rest = text.slice(start);
  const endIndexes = endPatterns
    .map((pattern) => rest.search(pattern))
    .filter((index) => index >= 0);
  const end = endIndexes.length > 0 ? Math.min(...endIndexes) : rest.length;
  return rest.slice(0, end).trim();
}

function extractFirstMeaningfulLines(rawText: string): string[] {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 12);
}

function looksLikeHeading(line: string): boolean {
  return /^(experience|work experience|professional experience|employment|skills|technical skills|projects|project experience|summary|about|leadership|certifications|education)$/i.test(line.trim());
}

function buildFallbackParsedResumeJson(rawText: string, sourceType: "linkedin" | "upload", fallbackName?: string): ParsedResumeJson {
  const normalizedText = rawText.replace(/\r/g, "").trim();
  const lines = extractFirstMeaningfulLines(normalizedText);
  const firstLine = lines[0] ?? "";
  const secondLine = lines[1] ?? "";
  const inferredName = fallbackName?.trim() || firstLine || "Imported Profile";
  const inferredTitle = secondLine && !looksLikeHeading(secondLine) ? secondLine : "";

  const summarySection = extractSection(
    normalizedText,
    /(summary|about)\s*:?\s*/i,
    [/(experience|work experience|professional experience|employment)\s*:?\s*/i, /(skills|technical skills)\s*:?\s*/i, /(projects|project experience)\s*:?\s*/i]
  );

  const skillsSection = extractSection(
    normalizedText,
    /(skills|technical skills)\s*:?\s*/i,
    [/(projects|project experience)\s*:?\s*/i, /(experience|work experience|professional experience|employment)\s*:?\s*/i, /(certifications|education)\s*:?\s*/i]
  );

  const projectSection = extractSection(
    normalizedText,
    /(projects|project experience)\s*:?\s*/i,
    [/(experience|work experience|professional experience|employment)\s*:?\s*/i, /(skills|technical skills)\s*:?\s*/i, /(certifications|education)\s*:?\s*/i]
  );

  const educationSection = extractSection(
    normalizedText,
    /(education)\s*:?\s*/i,
    [/(certifications|certificates)\s*:?\s*/i, /(skills|technical skills)\s*:?\s*/i, /(projects|project experience)\s*:?\s*/i]
  );

  const certificateSection = extractSection(
    normalizedText,
    /(certifications|certificates)\s*:?\s*/i,
    [/(education)\s*:?\s*/i, /(skills|technical skills)\s*:?\s*/i, /(projects|project experience)\s*:?\s*/i]
  );

  const experienceLines = normalizedText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const bulletCandidates = experienceLines
    .filter((line) => /^[-*•]/.test(line) || metricLike(line))
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);

  const skills = cleanArray(
    skillsSection
      .split(/[\n,|•]/)
      .map((token) => token.trim())
  ).slice(0, 30);

  const projects = cleanArray(
    projectSection
      .split(/\n+/)
      .map((line) => line.replace(/^[-*•]\s*/, "").trim())
  )
    .slice(0, 6)
    .map((line) => ({
      name: line.split(/[|:-]/)[0]?.trim() || line,
      role: "",
      description: line,
      tools: [],
      team_size: undefined,
      outcome: "",
      metrics: "",
    }));

  const education = cleanArray(
    educationSection
      .split(/\n+/)
      .map((line) => line.replace(/^[-*•]\s*/, "").trim())
  )
    .slice(0, 4)
    .map((line) => ({
      school: line,
      degree: "",
      field_of_study: "",
      start_date: "",
      end_date: "",
      notes: "",
    }));

  const certificates = cleanArray(
    certificateSection
      .split(/[\n,|•]/)
      .map((line) => line.replace(/^[-*•]\s*/, "").trim())
  ).slice(0, 10);

  const summary = summarySection
    || lines.slice(sourceType === "linkedin" ? 2 : 1, sourceType === "linkedin" ? 5 : 4).join(" ").trim()
    || "Imported starter profile. Review and refine the structured content for best tailoring results.";

  const experience = bulletCandidates.length > 0
    ? [{
        title: inferredTitle || "Imported Experience",
        company: sourceType === "linkedin" ? "Imported from LinkedIn" : "Imported from Resume",
        start_date: "",
        end_date: "",
        bullets: bulletCandidates.slice(0, 8),
      }]
    : [];

  return {
    name: inferredName,
    title: inferredTitle || fallbackName || "Imported Resume Profile",
    summary,
    experience,
    skills: {
      core: skills.slice(0, 12),
      tools: skills.slice(12, 22),
      soft: [],
      certifications: [],
    },
    certificates,
    education,
    projects,
    leadership: {
      team_size: undefined,
      scope: "",
      stakeholders: [],
      budget: "",
    },
  };
}

function bulletFromText(text: string): MasterResumeBulletInput {
  const normalized = text.trim();
  const metricMatch = normalized.match(/(\$[\d,.]+|\d+(?:\.\d+)?%|\d+(?:,\d+)*(?:\+)?)/);
  return {
    action: normalized.split(/\bby\b/i)[0]?.trim() || normalized,
    method: normalized.includes(" by ") ? normalized.split(/\bby\b/i)[1]?.trim() : "",
    result: normalized,
    metric: metricMatch?.[1] ?? "",
    tools: [],
    keywords: [],
    originalText: normalized,
  };
}

function normalizeImportedDate(value?: string | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  const normalized = raw.replace(/\s+/g, " ").trim();
  if (/^(present|current|now|ongoing|to present)$/i.test(normalized)) {
    return null;
  }

  if (/^\d{4}$/.test(normalized)) {
    return `${normalized}-01-01`;
  }

  if (/^\d{4}-\d{2}$/.test(normalized)) {
    return `${normalized}-01`;
  }

  const slashMonthYear = normalized.match(/^(\d{1,2})\/(\d{4})$/);
  if (slashMonthYear) {
    const month = slashMonthYear[1].padStart(2, "0");
    return `${slashMonthYear[2]}-${month}-01`;
  }

  const dayMonthYear = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dayMonthYear) {
    return normalized;
  }

  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getUTCFullYear();
    const month = `${parsed.getUTCMonth() + 1}`.padStart(2, "0");
    const day = `${parsed.getUTCDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return null;
}

export async function extractResumeTextFromFile(fileName: string, mimeType: string, base64: string): Promise<string> {
  const buffer = Buffer.from(base64, "base64");
  const lowerName = fileName.toLowerCase();

  if (mimeType.includes("pdf") || lowerName.endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      return parsed.text.trim();
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }

  if (
    mimeType.includes("word") ||
    mimeType.includes("officedocument.wordprocessingml.document") ||
    lowerName.endsWith(".docx")
  ) {
    const parsed = await mammoth.extractRawText({ buffer });
    return parsed.value.trim();
  }

  throw new Error("Unsupported file type. Please upload a PDF or DOCX resume.");
}

async function extractWithPlaywright(url: string): Promise<string> {
  try {
    const playwright = await import("playwright");
    const browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(1500);
    const text = await page.locator("body").innerText().catch(() => "");
    await browser.close();
    return text.trim();
  } catch (err) {
    throw new Error(`Playwright import failed: ${(err as Error).message}`);
  }
}

export async function extractTextFromLinkedInUrl(url: string): Promise<string> {
  try {
    const text = await extractWithPlaywright(url);
    if (text) return text;
  } catch {
    // fallback below
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 JobFlowAI Resume Importer",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    return buildLinkedInFallbackText(url);
  }
  const html = await response.text();
  const text = stripHtml(html);
  if (!text) {
    return buildLinkedInFallbackText(url);
  }
  return text;
}

export async function parseStructuredResumeJson(
  userId: string,
  rawText: string,
  sourceType: "linkedin" | "upload",
  options: ParseStructuredOptions = {}
): Promise<ParsedResumeJson> {
  const prompt = sourceType === "linkedin"
    ? `Extract structured resume data from this LinkedIn profile text.

Return ONLY valid JSON:
{
  "name": "",
  "title": "",
  "summary": "",
  "experience": [
    {
      "title": "",
      "company": "",
      "start_date": "",
      "end_date": "",
      "bullets": ["", ""]
    }
  ],
  "skills": {
    "core": [],
    "tools": [],
    "soft": [],
    "certifications": []
  },
  "certificates": [],
  "education": [
    {
      "school": "",
      "degree": "",
      "field_of_study": "",
      "start_date": "",
      "end_date": "",
      "notes": ""
    }
  ],
  "projects": [
    {
      "name": "",
      "role": "",
      "description": "",
      "tools": [],
      "team_size": 0,
      "outcome": "",
      "metrics": ""
    }
  ],
  "leadership": {
    "team_size": 0,
    "scope": "",
    "stakeholders": [],
    "budget": ""
  }
}

Rules:
- Do not hallucinate missing data.
- Prefer empty strings/arrays instead of invented values.
- Preserve dates if available.
- Extract bullets as concise achievement-oriented lines when possible.
- Put schools and degrees into education.
- Put standalone credentials into certificates.

PROFILE TEXT:
${rawText.slice(0, 18_000)}`
    : `Convert this resume text into structured JSON.

Return ONLY valid JSON:
{
  "name": "",
  "title": "",
  "summary": "",
  "experience": [
    {
      "title": "",
      "company": "",
      "start_date": "",
      "end_date": "",
      "bullets": ["", ""]
    }
  ],
  "skills": {
    "core": [],
    "tools": [],
    "soft": [],
    "certifications": []
  },
  "certificates": [],
  "education": [
    {
      "school": "",
      "degree": "",
      "field_of_study": "",
      "start_date": "",
      "end_date": "",
      "notes": ""
    }
  ],
  "projects": [
    {
      "name": "",
      "role": "",
      "description": "",
      "tools": [],
      "team_size": 0,
      "outcome": "",
      "metrics": ""
    }
  ],
  "leadership": {
    "team_size": 0,
    "scope": "",
    "stakeholders": [],
    "budget": ""
  }
}

Rules:
- Do not invent data.
- Clean and standardize wording.
- Preserve measurable outcomes and tools.
- Keep only resume-relevant content.
- Put schools and degrees into education.
- Put standalone credentials into certificates.

RESUME TEXT:
${rawText.slice(0, 18_000)}`;

  try {
    return await runJsonCompletion<ParsedResumeJson>({
      userId,
      system: "You are an expert resume parser. Return only structured JSON without commentary.",
      prompt,
      maxTokens: 2200,
      temperature: 0.1,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (
      message.includes("No OpenAI API key connected")
      || message.includes("OpenAI returned")
      || message.includes("AI returned invalid JSON")
      || message.includes("AI returned an empty response.")
    ) {
      return buildFallbackParsedResumeJson(rawText, sourceType, options.fallbackName);
    }
    throw err;
  }
}

function metricLike(text: string): boolean {
  return /(\d+[%xkmb]?|\$[\d,.]+|percent|revenue|growth|reduced|increased|saved|improved|launched|users|customers)/i.test(text);
}

export function normalizeImportedResumeToProfile(parsed: ParsedResumeJson, fallbackName?: string): MasterResumeProfileInput {
  const skillsObject = Array.isArray(parsed.skills)
    ? { core: parsed.skills, tools: [], soft: [], certifications: [] }
    : (parsed.skills ?? {});
  const mergedCertificates = cleanArray([
    ...(skillsObject.certifications ?? []),
    ...(parsed.certificates ?? []),
  ]);

  return {
    name: parsed.title?.trim() || fallbackName || "Imported Master Resume",
    targetRoles: cleanArray(parsed.title ? [parsed.title] : []),
    summary: parsed.summary?.trim() ?? "",
    experienceYears: 0,
    isActive: true,
    useForAi: true,
    experiences: (parsed.experience ?? [])
      .filter((experience) => experience.title || experience.company)
      .map((experience) => ({
        title: experience.title?.trim() || "Untitled Role",
        company: experience.company?.trim() || "Unknown Company",
        startDate: normalizeImportedDate(experience.start_date),
        endDate: normalizeImportedDate(experience.end_date),
        bullets: cleanArray(experience.bullets).map(bulletFromText),
      })),
    skills: {
      core: cleanArray(skillsObject.core),
      tools: cleanArray(skillsObject.tools),
      soft: cleanArray(skillsObject.soft),
      certifications: mergedCertificates,
    },
    education: (parsed.education ?? [])
      .filter((education) => education.school || education.degree || education.field_of_study)
      .map((education) => ({
        school: education.school?.trim() || "Unknown School",
        degree: education.degree?.trim() || "",
        fieldOfStudy: education.field_of_study?.trim() || "",
        startDate: normalizeImportedDate(education.start_date),
        endDate: normalizeImportedDate(education.end_date),
        notes: education.notes?.trim() || "",
      })),
    projects: (parsed.projects ?? [])
      .filter((project) => project.name || project.description)
      .map((project) => ({
        name: project.name?.trim() || "Untitled Project",
        role: project.role?.trim() || "",
        description: project.description?.trim() || "",
        tools: cleanArray(project.tools),
        teamSize: typeof project.team_size === "number" ? project.team_size : null,
        outcome: project.outcome?.trim() || "",
        metrics: project.metrics?.trim() || "",
      })),
    leadership: parsed.leadership
      ? {
          teamSize: typeof parsed.leadership.team_size === "number" ? parsed.leadership.team_size : null,
          scope: parsed.leadership.scope?.trim() || "",
          stakeholders: cleanArray(parsed.leadership.stakeholders),
          budget: parsed.leadership.budget?.trim() || "",
        }
      : { teamSize: null, scope: "", stakeholders: [], budget: "" },
    isDefault: false,
  };
}
