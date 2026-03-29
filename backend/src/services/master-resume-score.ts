interface BulletLike {
  action?: string | null;
  method?: string | null;
  result?: string | null;
  metric?: string | null;
  tools?: string[] | null;
  keywords?: string[] | null;
  originalText?: string | null;
}

interface ExperienceLike {
  title?: string | null;
  company?: string | null;
  bullets?: BulletLike[] | null;
}

interface ProjectLike {
  name?: string | null;
  role?: string | null;
  description?: string | null;
  tools?: string[] | null;
  outcome?: string | null;
  metrics?: string | null;
}

interface SkillsLike {
  core?: string[] | null;
  tools?: string[] | null;
  soft?: string[] | null;
  certifications?: string[] | null;
}

interface EducationLike {
  school?: string | null;
  degree?: string | null;
  fieldOfStudy?: string | null;
  notes?: string | null;
}

interface LeadershipLike {
  teamSize?: number | null;
  scope?: string | null;
  stakeholders?: string[] | null;
  budget?: string | null;
}

export interface ScoreResumeInput {
  name: string;
  targetRoles: string[];
  summary?: string | null;
  experienceYears?: number | null;
  experiences: ExperienceLike[];
  skills: SkillsLike;
  education?: EducationLike[] | null;
  projects: ProjectLike[];
  leadership?: LeadershipLike | null;
  jobTitle?: string | null;
  jobDescription?: string | null;
}

export interface ScoreResumeResult {
  atsScore: number;
  impactScore: number;
  completenessScore: number;
  mqMatch: {
    matchScore: number;
    matchedSkills: string[];
    missingSkills: string[];
  };
  suggestions: string[];
  keywordCoverage: {
    matched: string[];
    missing: string[];
  };
}

const STOP_WORDS = new Set([
  "and", "the", "with", "for", "that", "this", "from", "your", "will", "you", "our", "are", "have", "has",
  "job", "role", "team", "work", "using", "into", "their", "they", "them", "about", "who", "what", "when",
  "where", "why", "how", "can", "should", "must", "plus", "able", "years", "year", "experience", "required",
  "preferred", "skills", "skill", "including", "other", "than", "such", "through", "across", "within", "best",
  "manager", "senior", "junior", "lead", "candidate", "strong", "ability",
]);

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeToken(token: string): string {
  return token.trim().toLowerCase();
}

function extractKeywords(text: string, limit = 20): string[] {
  const normalized = text.toLowerCase();
  const patterns = normalized
    .split(/[^a-z0-9+#./-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token) && !/^\d+$/.test(token));

  return uniq(patterns).slice(0, limit);
}

function extractExplicitRequirementKeywords(jobDescription: string): string[] {
  const lines = jobDescription
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const requiredLines = lines.filter((line) =>
    /(required|requirements|qualification|must have|need|preferred|responsibilities)/i.test(line)
  );

  return extractKeywords(requiredLines.join(" "), 24);
}

function bulletToText(bullet: BulletLike): string {
  return [
    bullet.action,
    bullet.method,
    bullet.result,
    bullet.metric,
    ...(bullet.tools ?? []),
    ...(bullet.keywords ?? []),
    bullet.originalText,
  ]
    .filter(Boolean)
    .join(" ");
}

function profileCorpus(input: ScoreResumeInput): string {
  const experienceText = input.experiences
    .flatMap((experience) => [
      experience.title ?? "",
      experience.company ?? "",
      ...(experience.bullets ?? []).map(bulletToText),
    ])
    .join(" ");

  const projectText = input.projects
    .flatMap((project) => [
      project.name ?? "",
      project.role ?? "",
      project.description ?? "",
      ...(project.tools ?? []),
      project.outcome ?? "",
      project.metrics ?? "",
    ])
    .join(" ");

  const educationText = (input.education ?? [])
    .flatMap((education) => [
      education.school ?? "",
      education.degree ?? "",
      education.fieldOfStudy ?? "",
      education.notes ?? "",
    ])
    .join(" ");

  return [
    input.name,
    input.summary ?? "",
    ...(input.targetRoles ?? []),
    String(input.experienceYears ?? ""),
    experienceText,
    ...(input.skills.core ?? []),
    ...(input.skills.tools ?? []),
    ...(input.skills.soft ?? []),
    ...(input.skills.certifications ?? []),
    educationText,
    projectText,
    input.leadership?.scope ?? "",
    ...(input.leadership?.stakeholders ?? []),
    input.leadership?.budget ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

function metricLike(text: string): boolean {
  return /(\d+[%xkmb]?|\$[\d,.]+|percent|revenue|growth|reduced|increased|saved|improved|launched|users|customers)/i.test(text);
}

export function scoreMasterResume(input: ScoreResumeInput): ScoreResumeResult {
  const jd = (input.jobDescription ?? "").trim();
  const corpus = profileCorpus(input);

  const keywordPool = uniq([
    ...(input.jobTitle ? extractKeywords(input.jobTitle, 8) : []),
    ...extractExplicitRequirementKeywords(jd),
    ...extractKeywords(jd, 24),
  ]).slice(0, 24);

  const matchedKeywords = keywordPool.filter((keyword) => corpus.includes(normalizeToken(keyword)));
  const missingKeywords = keywordPool.filter((keyword) => !corpus.includes(normalizeToken(keyword)));
  const atsScore = keywordPool.length > 0
    ? clamp((matchedKeywords.length / keywordPool.length) * 100)
    : 0;

  const bullets = input.experiences.flatMap((experience) => experience.bullets ?? []);
  const impactBullets = bullets.filter((bullet) => metricLike(bulletToText(bullet)));
  const impactScore = bullets.length > 0
    ? clamp((impactBullets.length / bullets.length) * 100)
    : 0;

  const completenessChecks = [
    Boolean(input.summary && input.summary.trim().length >= 60),
    input.targetRoles.length > 0,
    (input.experienceYears ?? 0) > 0,
    input.experiences.length > 0,
    bullets.length >= 3,
    ((input.skills.core?.length ?? 0) + (input.skills.tools?.length ?? 0)) >= 5,
    (input.education?.length ?? 0) > 0,
    input.projects.length > 0,
    Boolean(input.leadership && (input.leadership.scope || input.leadership.teamSize || (input.leadership.stakeholders?.length ?? 0) > 0)),
  ];
  const completenessScore = clamp((completenessChecks.filter(Boolean).length / completenessChecks.length) * 100);

  const explicitSkillKeywords = uniq([
    ...extractExplicitRequirementKeywords(jd),
    ...extractKeywords([
      ...(input.skills.core ?? []),
      ...(input.skills.tools ?? []),
      ...(input.skills.certifications ?? []),
      ...(input.targetRoles ?? []),
    ].join(" "), 18),
  ]).slice(0, 18);

  const matchedSkills = explicitSkillKeywords.filter((keyword) => corpus.includes(keyword));
  const missingSkills = explicitSkillKeywords.filter((keyword) => !corpus.includes(keyword)).slice(0, 10);
  const mqScore = explicitSkillKeywords.length > 0
    ? clamp((matchedSkills.length / explicitSkillKeywords.length) * 100)
    : atsScore;

  const suggestions: string[] = [];
  if (atsScore < 75 && missingKeywords.length > 0) {
    suggestions.push(`Add or strengthen resume evidence for: ${missingKeywords.slice(0, 6).join(", ")}.`);
  }
  if (impactScore < 65) {
    suggestions.push("Rewrite more experience bullets with measurable impact, business outcomes, or delivery metrics.");
  }
  if (completenessScore < 80) {
    suggestions.push("Fill missing structured sections such as summary, education, projects, certifications, or leadership scope.");
  }
  if (mqScore < 70 && missingSkills.length > 0) {
    suggestions.push(`Address minimum qualification gaps around ${missingSkills.slice(0, 5).join(", ")} before tailoring for this job.`);
  }
  if ((input.skills.tools?.length ?? 0) < 3) {
    suggestions.push("Expand the tools stack so ATS systems can match the specific platforms and technologies you use.");
  }

  return {
    atsScore,
    impactScore,
    completenessScore,
    mqMatch: {
      matchScore: mqScore,
      matchedSkills,
      missingSkills,
    },
    suggestions: uniq(suggestions),
    keywordCoverage: {
      matched: matchedKeywords,
      missing: missingKeywords.slice(0, 12),
    },
  };
}
