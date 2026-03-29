interface ScoreBreakdownLike {
  skillsMatch?: number;
  experienceMatch?: number;
  roleAlignment?: number;
  locationSalaryFit?: number;
  areasToAddress?: string[];
}

interface JobInsightInput {
  title?: string;
  description?: string;
  requirements?: string[];
  location?: string;
  remote?: boolean;
  scoreBreakdown?: ScoreBreakdownLike;
}

export interface JobInsights {
  roleHighlights: string[];
  keyRequirements: string[];
  bestFitImprovements: string[];
  keywordFocus: string[];
}

const SENTENCE_SPLIT = /(?<=[.!?])\s+/;
const COMMON_STOP_WORDS = new Set([
  "and", "the", "with", "for", "that", "this", "from", "your", "will", "you", "our", "are", "have", "has",
  "job", "role", "team", "work", "using", "into", "their", "they", "them", "about", "who", "what", "when",
  "where", "why", "how", "can", "should", "must", "plus", "able", "years", "year", "experience", "required",
  "preferred", "skills", "skill", "including", "other", "than", "such", "through", "across", "within", "best",
]);

const KEYWORD_PATTERNS = [
  "product strategy",
  "product management",
  "program management",
  "project management",
  "stakeholder management",
  "cross-functional",
  "roadmap",
  "go-to-market",
  "agile",
  "scrum",
  "sql",
  "python",
  "excel",
  "analytics",
  "data analysis",
  "a/b testing",
  "api",
  "saas",
  "enterprise",
  "b2b",
  "b2c",
  "customer research",
  "user research",
  "wireframing",
  "figma",
  "adobe",
  "marketing",
  "seo",
  "content strategy",
  "operations",
  "budgeting",
  "forecasting",
  "communication",
  "presentation",
  "leadership",
  "ownership",
  "execution",
  "problem solving",
];

function cleanText(text?: string | null): string {
  return (text ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sentenceScore(sentence: string): number {
  const normalized = sentence.toLowerCase();
  let score = 0;

  if (/(lead|own|drive|build|design|manage|execute|deliver|develop|define|launch|partner)/.test(normalized)) {
    score += 3;
  }
  if (/(responsible|responsibility|required|must|need|qualification|experience|proficient|preferred)/.test(normalized)) {
    score += 3;
  }
  if (/\d+\+?\s+(years|yrs)/.test(normalized)) {
    score += 2;
  }
  if (sentence.length > 80 && sentence.length < 220) {
    score += 1;
  }

  return score;
}

function uniqueOrdered(items: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const normalized = item.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= limit) break;
  }
  return result;
}

function extractSentences(description?: string): string[] {
  const clean = cleanText(description);
  if (!clean) return [];
  return clean
    .split(SENTENCE_SPLIT)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 30);
}

function extractRoleHighlights(description?: string, requirements?: string[]): string[] {
  const candidateLines = [
    ...extractSentences(description),
    ...(requirements ?? []).map((item) => cleanText(item)),
  ].filter(Boolean);

  return uniqueOrdered(
    candidateLines
      .sort((a, b) => sentenceScore(b) - sentenceScore(a))
      .slice(0, 8),
    4
  );
}

function extractKeyRequirements(description?: string, requirements?: string[]): string[] {
  if (requirements && requirements.length > 0) {
    return uniqueOrdered(requirements.map((item) => cleanText(item)), 5);
  }

  return uniqueOrdered(
    extractSentences(description).filter((sentence) =>
      /(required|must|need|qualification|experience|proficient|preferred|knowledge)/i.test(sentence)
    ),
    5
  );
}

function extractKeywordFocus(description?: string, requirements?: string[]): string[] {
  const corpus = `${cleanText(description)} ${(requirements ?? []).join(" ")}`.toLowerCase();
  const matched = KEYWORD_PATTERNS.filter((pattern) => corpus.includes(pattern));

  const fallbackTokens = corpus
    .split(/[^a-z0-9+#./-]+/)
    .map((token) => token.trim())
    .filter((token) =>
      token.length >= 4 &&
      !COMMON_STOP_WORDS.has(token) &&
      !/^\d+$/.test(token)
    );

  return uniqueOrdered([...matched, ...fallbackTokens], 6);
}

function buildImprovementAreas(input: JobInsightInput, keywordFocus: string[]): string[] {
  const improvements: string[] = [];
  const breakdown = input.scoreBreakdown;

  if (breakdown?.areasToAddress && breakdown.areasToAddress.length > 0) {
    improvements.push(...breakdown.areasToAddress);
  }

  if ((breakdown?.skillsMatch ?? 25) < 16) {
    improvements.push(
      keywordFocus.length > 0
        ? `Move evidence of ${keywordFocus.slice(0, 3).join(", ")} higher in your resume and use the same language as the posting.`
        : "Bring the most relevant tools, platforms, and domain skills higher in your resume bullets."
    );
  }

  if ((breakdown?.experienceMatch ?? 25) < 16) {
    improvements.push(
      "Add stronger proof of seniority, scope, and measurable outcomes so your experience level is obvious at a glance."
    );
  }

  if ((breakdown?.roleAlignment ?? 25) < 16) {
    improvements.push(
      input.title
        ? `Align your headline, summary, and top bullets more directly to ${input.title}.`
        : "Align your summary and recent experience more directly to the target role."
    );
  }

  if ((breakdown?.locationSalaryFit ?? 25) < 16) {
    improvements.push(
      input.remote
        ? "Make your remote collaboration setup and timezone flexibility explicit."
        : input.location
          ? `Clarify your fit for ${input.location} and any relocation or hybrid flexibility.`
          : "Clarify your location, remote flexibility, and compensation alignment."
    );
  }

  const description = cleanText(input.description).toLowerCase();
  if (/\d+\+?\s+(years|yrs)/.test(description)) {
    improvements.push("State your years of directly relevant experience near the top of the resume.");
  }
  if (/(lead|own|drive|manage|mentor)/.test(description)) {
    improvements.push("Show leadership, ownership, and cross-functional decision-making with concrete outcomes.");
  }
  if (/(stakeholder|cross-functional|partner)/.test(description)) {
    improvements.push("Add bullets that show stakeholder management and cross-functional collaboration.");
  }
  if (/(metrics|kpi|growth|revenue|conversion|impact|optimi[sz]e)/.test(description)) {
    improvements.push("Use quantified business impact, metrics, and outcomes instead of only listing responsibilities.");
  }
  if (keywordFocus.length > 0) {
    improvements.push(`Mirror the role's priority keywords in your resume, especially ${keywordFocus.slice(0, 4).join(", ")}.`);
  }

  return uniqueOrdered(improvements, 6);
}

export function buildJobInsights(input: JobInsightInput): JobInsights {
  const roleHighlights = extractRoleHighlights(input.description, input.requirements);
  const keyRequirements = extractKeyRequirements(input.description, input.requirements);
  const keywordFocus = extractKeywordFocus(input.description, input.requirements);
  const bestFitImprovements = buildImprovementAreas(input, keywordFocus);

  return {
    roleHighlights,
    keyRequirements,
    bestFitImprovements,
    keywordFocus,
  };
}
