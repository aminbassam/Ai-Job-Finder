/**
 * AI job scorer — uses the user's connected OpenAI key to score a job
 * against their resume preferences and profile.
 *
 * Returns a score (0-100), tier, 2-3 sentence summary, and a breakdown
 * explaining each dimension of the match.
 */
import { pool } from "../db/pool";
import { decrypt } from "../utils/encryption";

export interface AiScoreResult {
  score: number;
  tier: "strong" | "maybe" | "weak" | "reject";
  summary: string;
  breakdown: {
    skillsMatch: number;
    experienceMatch: number;
    roleAlignment: number;
    locationSalaryFit: number;
    reasoning: string;
    strengths: string[];
    weaknesses: string[];
    areasToAddress: string[];
    error?: string;
  };
}

export type AiScoreError =
  | { kind: "quota";   message: string }
  | { kind: "auth";    message: string }
  | { kind: "nokey";   message: string }
  | { kind: "other";   message: string };

export type AiScoreOutcome =
  | { ok: true;  result: AiScoreResult }
  | { ok: false; error: AiScoreError };

interface JobInput {
  title: string;
  company?: string | null;
  description?: string | null;
  requirements?: string[] | null;
  location?: string | null;
  remote?: boolean | null;
  jobType?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
}

const SYSTEM_PROMPT = `You are a professional career coach and recruiter evaluator.
Your task is to score how well a job posting matches a candidate's profile.
Always respond with a valid JSON object — no markdown, no explanation outside JSON.`;

function toTier(score: number): AiScoreResult["tier"] {
  if (score >= 75) return "strong";
  if (score >= 55) return "maybe";
  if (score >= 35) return "weak";
  return "reject";
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

export async function scoreJobWithAi(
  userId: string,
  job: JobInput
): Promise<AiScoreOutcome> {
  // ── 1. Get the user's connected OpenAI key ────────────────────────────────
  const { rows: keyRows } = await pool.query<{
    encrypted_key: string;
    encryption_iv: string;
    encryption_tag: string;
    selected_model: string;
  }>(
    `SELECT encrypted_key, encryption_iv, encryption_tag, selected_model
     FROM ai_provider_connections
     WHERE user_id = $1 AND provider = 'openai' AND is_connected = true
     LIMIT 1`,
    [userId]
  );

  if (!keyRows[0]?.encrypted_key) {
    return { ok: false, error: { kind: "nokey", message: "No OpenAI API key connected. Go to Settings → AI Providers to add one." } };
  }

  const apiKey = decrypt({
    encrypted: keyRows[0].encrypted_key,
    iv: keyRows[0].encryption_iv,
    tag: keyRows[0].encryption_tag,
  });

  // Use the user's selected model, falling back to gpt-4o-mini (cost-efficient)
  const model = keyRows[0].selected_model ?? "gpt-4o-mini";

  // ── 2. Load resume preferences ────────────────────────────────────────────
  const { rows: prefRows } = await pool.query<Record<string, unknown>>(
    `SELECT target_roles, seniority_level, must_have_keywords, tools_technologies,
            soft_skills, industry_focus, key_achievements, certifications
     FROM resume_preferences WHERE user_id = $1`,
    [userId]
  );
  const prefs = prefRows[0] ?? {};

  // ── 3. Load user profile + skills ─────────────────────────────────────────
  const { rows: profileRows } = await pool.query<Record<string, unknown>>(
    `SELECT up.professional_summary, up.years_experience,
            COALESCE(
              json_agg(us.skill_name ORDER BY us.years_experience DESC NULLS LAST)
                FILTER (WHERE us.skill_name IS NOT NULL),
              '[]'
            ) AS skills
     FROM user_profiles up
     LEFT JOIN user_skills us ON us.user_id = up.user_id
     WHERE up.user_id = $1
     GROUP BY up.user_id, up.professional_summary, up.years_experience`,
    [userId]
  );
  const profile = profileRows[0] ?? {};

  // ── 4. Build the prompt ────────────────────────────────────────────────────
  const candidateParts: string[] = [];

  if (profile.professional_summary) {
    candidateParts.push(`Summary: ${profile.professional_summary}`);
  }
  if (profile.years_experience) {
    candidateParts.push(`Years of experience: ${profile.years_experience}`);
  }
  if (prefs.seniority_level) {
    candidateParts.push(`Seniority level: ${prefs.seniority_level}`);
  }
  if (Array.isArray(prefs.target_roles) && prefs.target_roles.length > 0) {
    candidateParts.push(`Target roles: ${(prefs.target_roles as string[]).join(", ")}`);
  }
  if (Array.isArray(profile.skills) && (profile.skills as string[]).length > 0) {
    candidateParts.push(`Skills: ${(profile.skills as string[]).slice(0, 20).join(", ")}`);
  }
  if (Array.isArray(prefs.tools_technologies) && (prefs.tools_technologies as string[]).length > 0) {
    candidateParts.push(`Tools & technologies: ${(prefs.tools_technologies as string[]).join(", ")}`);
  }
  if (Array.isArray(prefs.must_have_keywords) && (prefs.must_have_keywords as string[]).length > 0) {
    candidateParts.push(`Must-have keywords: ${(prefs.must_have_keywords as string[]).join(", ")}`);
  }
  if (Array.isArray(prefs.soft_skills) && (prefs.soft_skills as string[]).length > 0) {
    candidateParts.push(`Soft skills: ${(prefs.soft_skills as string[]).join(", ")}`);
  }
  if (prefs.key_achievements) {
    candidateParts.push(`Key achievements: ${String(prefs.key_achievements).slice(0, 400)}`);
  }
  if (prefs.certifications) {
    candidateParts.push(`Certifications: ${String(prefs.certifications).slice(0, 200)}`);
  }

  const jobParts: string[] = [
    `Title: ${job.title}`,
  ];
  if (job.company) jobParts.push(`Company: ${job.company}`);
  if (job.location) jobParts.push(`Location: ${job.location}`);
  if (job.remote) jobParts.push("Remote: Yes");
  if (job.jobType) jobParts.push(`Job type: ${job.jobType}`);
  if (job.salaryMin || job.salaryMax) {
    const salaryText = [
      job.salaryMin ? `$${Math.round(job.salaryMin / 1000)}k` : null,
      job.salaryMax ? `$${Math.round(job.salaryMax / 1000)}k` : null,
    ].filter(Boolean).join(" – ");
    jobParts.push(`Salary: ${salaryText}`);
  }
  if (job.description) {
    jobParts.push(`Description:\n${job.description.replace(/<[^>]+>/g, " ").slice(0, 1500)}`);
  }
  if (Array.isArray(job.requirements) && job.requirements.length > 0) {
    jobParts.push(`Requirements:\n${(job.requirements as string[]).slice(0, 12).map((r) => `- ${r}`).join("\n")}`);
  }

  const noProfileData = candidateParts.length === 0;

  const userPrompt = noProfileData
    ? `Score this job based on what you can infer from the title and description alone.

JOB POSTING:
${jobParts.join("\n")}

Respond ONLY with this JSON:
{
  "score": <0-100>,
  "summary": "<2-3 sentences describing the role and what type of candidate it suits>",
  "skillsMatch": <0-25>,
  "experienceMatch": <0-25>,
  "roleAlignment": <0-25>,
  "locationSalaryFit": <0-25>,
  "reasoning": "<1-2 sentences on the key strengths and gaps. Note: candidate profile not yet filled in.>"
}`
    : `Score how well this job matches the candidate profile.

CANDIDATE PROFILE:
${candidateParts.join("\n")}

JOB POSTING:
${jobParts.join("\n")}

Scoring rubric:
- skillsMatch (0-25): How well candidate skills/tools match job requirements
- experienceMatch (0-25): How well years/seniority aligns with what the role demands
- roleAlignment (0-25): How closely the job title/responsibilities match candidate's target roles
- locationSalaryFit (0-25): Location/remote/salary compatibility (if unknown, give 15)

Respond ONLY with this JSON:
{
  "score": <sum of the four sub-scores>,
  "summary": "<2-3 sentence job summary>",
  "skillsMatch": <0-25>,
  "experienceMatch": <0-25>,
  "roleAlignment": <0-25>,
  "locationSalaryFit": <0-25>,
  "reasoning": "<strengths and gaps>",
  "strengths": ["<why you should apply - 2-3 items>"],
  "weaknesses": ["<why you might not apply - 1-2 items>"],
  "areasToAddress": ["<resume/skill gaps to fix - 1-2 items>"]
}`;

  // ── 5. Call OpenAI ─────────────────────────────────────────────────────────
  let raw: string;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 600,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[ai-scorer] OpenAI error:", res.status, body);
      if (res.status === 429 || body.includes("insufficient_quota")) {
        return { ok: false, error: { kind: "quota", message: "Your OpenAI API key has exceeded its quota. Check billing at platform.openai.com." } };
      }
      if (res.status === 401) {
        return { ok: false, error: { kind: "auth", message: "OpenAI API key is invalid or revoked. Reconnect it in Settings → AI Providers." } };
      }
      return { ok: false, error: { kind: "other", message: `OpenAI returned ${res.status}.` } };
    }

    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    raw = data.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    console.error("[ai-scorer] Fetch error:", (err as Error).message);
    return { ok: false, error: { kind: "other", message: (err as Error).message } };
  }

  // ── 6. Parse and validate ─────────────────────────────────────────────────
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const skillsMatch     = clamp(Number(parsed.skillsMatch ?? 0), 0, 25);
    const experienceMatch = clamp(Number(parsed.experienceMatch ?? 0), 0, 25);
    const roleAlignment   = clamp(Number(parsed.roleAlignment ?? 0), 0, 25);
    const locationSalaryFit = clamp(Number(parsed.locationSalaryFit ?? 15), 0, 25);

    // Use provided score if valid, otherwise sum the breakdown
    const rawScore = Number(parsed.score);
    const score = clamp(
      Number.isFinite(rawScore) ? rawScore : skillsMatch + experienceMatch + roleAlignment + locationSalaryFit
    );

    const summary = typeof parsed.summary === "string" && parsed.summary.trim()
      ? parsed.summary.trim()
      : `${job.title}${job.company ? ` at ${job.company}` : ""}.`;

    const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning.trim() : "";

    const strengths = Array.isArray(parsed.strengths)
      ? (parsed.strengths as unknown[]).filter((s): s is string => typeof s === "string")
      : [];
    const weaknesses = Array.isArray(parsed.weaknesses)
      ? (parsed.weaknesses as unknown[]).filter((s): s is string => typeof s === "string")
      : [];
    const areasToAddress = Array.isArray(parsed.areasToAddress)
      ? (parsed.areasToAddress as unknown[]).filter((s): s is string => typeof s === "string")
      : [];

    return {
      ok: true,
      result: {
        score,
        tier: toTier(score),
        summary,
        breakdown: {
          skillsMatch,
          experienceMatch,
          roleAlignment,
          locationSalaryFit,
          reasoning,
          strengths,
          weaknesses,
          areasToAddress,
        },
      },
    };
  } catch (err) {
    console.error("[ai-scorer] Parse error:", (err as Error).message, "raw:", raw);
    return { ok: false, error: { kind: "other", message: "Failed to parse AI response." } };
  }
}
