import { runJsonCompletion } from "./ai-client";

export interface JobAiExtraction {
  skills: string[];
  minimumQualifications: string[];
  keywords: string[];
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function extractKeywordsHeuristic(text: string, limit = 16): string[] {
  const stopWords = new Set([
    "the", "and", "with", "for", "that", "this", "from", "your", "will", "you", "our", "are", "have",
    "has", "job", "role", "team", "work", "using", "into", "their", "they", "them", "about", "what",
    "when", "where", "how", "can", "should", "must", "plus", "able", "years", "year", "experience",
    "required", "preferred", "skills", "skill", "including", "other", "than", "such", "through",
    "across", "within", "best", "manager", "senior", "junior", "lead", "candidate", "strong", "ability",
  ]);

  return uniq(
    text
      .toLowerCase()
      .split(/[^a-z0-9+#./-]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !stopWords.has(token) && !/^\d+$/.test(token))
  ).slice(0, limit);
}

function extractQualificationLines(text: string, limit = 8): string[] {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const matched = lines.filter((line) =>
    /(requirement|qualification|must have|what you bring|experience with|proficient in|knowledge of)/i.test(line)
  );

  return uniq(matched).slice(0, limit);
}

export async function extractJobSignals(userId: string, description: string): Promise<JobAiExtraction> {
  const trimmed = description.trim();
  if (!trimmed) {
    return { skills: [], minimumQualifications: [], keywords: [] };
  }

  try {
    const result = await runJsonCompletion<{
      skills?: string[];
      minimum_qualifications?: string[];
      keywords?: string[];
    }>({
      userId,
      system: "You are an expert job-posting analyzer. Return valid JSON only and never invent missing facts.",
      prompt: `Extract structured hiring signals from this job description.

Return ONLY valid JSON:
{
  "skills": [],
  "minimum_qualifications": [],
  "keywords": []
}

Rules:
- Do not hallucinate skills or requirements.
- Keep every item concise.
- Put technologies, tools, and functional capabilities in skills.
- Put must-have credentials, years of experience, and explicit requirements in minimum_qualifications.
- Put the most ATS-relevant terms in keywords.

JOB DESCRIPTION:
${trimmed.slice(0, 12000)}`,
      maxTokens: 800,
      temperature: 0.1,
    });

    return {
      skills: uniq(result.skills ?? []).slice(0, 18),
      minimumQualifications: uniq(result.minimum_qualifications ?? []).slice(0, 12),
      keywords: uniq(result.keywords ?? []).slice(0, 18),
    };
  } catch {
    return {
      skills: extractKeywordsHeuristic(trimmed, 12),
      minimumQualifications: extractQualificationLines(trimmed, 8),
      keywords: extractKeywordsHeuristic(trimmed, 16),
    };
  }
}
