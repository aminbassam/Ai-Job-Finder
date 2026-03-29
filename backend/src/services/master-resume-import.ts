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
  projects?: ParsedProject[];
  leadership?: {
    team_size?: number;
    scope?: string;
    stakeholders?: string[];
    budget?: string;
  };
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
    throw new Error(`Failed to fetch LinkedIn profile: ${response.status}`);
  }
  const html = await response.text();
  const text = stripHtml(html);
  if (!text) {
    throw new Error("LinkedIn profile content could not be extracted.");
  }
  return text;
}

export async function parseStructuredResumeJson(userId: string, rawText: string, sourceType: "linkedin" | "upload"): Promise<ParsedResumeJson> {
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

RESUME TEXT:
${rawText.slice(0, 18_000)}`;

  return runJsonCompletion<ParsedResumeJson>({
    userId,
    system: "You are an expert resume parser. Return only structured JSON without commentary.",
    prompt,
    maxTokens: 2200,
    temperature: 0.1,
  });
}

export function normalizeImportedResumeToProfile(parsed: ParsedResumeJson, fallbackName?: string): MasterResumeProfileInput {
  const skillsObject = Array.isArray(parsed.skills)
    ? { core: parsed.skills, tools: [], soft: [], certifications: [] }
    : (parsed.skills ?? {});

  return {
    name: parsed.title?.trim() || fallbackName || "Imported Master Resume",
    targetRoles: cleanArray(parsed.title ? [parsed.title] : []),
    summary: parsed.summary?.trim() ?? "",
    experienceYears: 0,
    experiences: (parsed.experience ?? [])
      .filter((experience) => experience.title || experience.company)
      .map((experience) => ({
        title: experience.title?.trim() || "Untitled Role",
        company: experience.company?.trim() || "Unknown Company",
        startDate: experience.start_date?.trim() || null,
        endDate: experience.end_date?.trim() || null,
        bullets: cleanArray(experience.bullets).map(bulletFromText),
      })),
    skills: {
      core: cleanArray(skillsObject.core),
      tools: cleanArray(skillsObject.tools),
      soft: cleanArray(skillsObject.soft),
      certifications: cleanArray(skillsObject.certifications),
    },
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
