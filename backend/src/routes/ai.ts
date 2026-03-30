import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { runJsonCompletion } from "../services/ai-client";
import { buildAiPreferenceNotes, getGlobalAiSettings } from "../services/ai-global-settings";
import {
  extractResumeTextFromFile,
  normalizeImportedResumeToProfile,
  parseStructuredResumeJson,
} from "../services/master-resume-import";
import { extractJobSignals } from "../services/job-ai-extraction";
import { extractJobFromEmailWithFallback } from "../services/gmail-linkedin-ingestion";
import {
  getAiResumeSourceContext,
  getMasterResumeContextForProfile,
  getMasterResumeProfile,
  saveMasterResumeImport,
  saveMasterResumeProfile,
} from "../services/master-resume";
import { scoreMasterResume } from "../services/master-resume-score";

const router = Router();
router.use(requireAuth);

const parseResumeSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  base64: z.string().min(1),
  profileName: z.string().max(200).optional(),
  createProfile: z.boolean().optional(),
  isActive: z.boolean().optional(),
  useForAi: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

router.post("/parse-resume", validate(parseResumeSchema), async (req: Request, res: Response) => {
  const { fileName, mimeType, base64, profileName, createProfile, isActive, useForAi, isDefault } = req.body as z.infer<typeof parseResumeSchema>;

  try {
    const rawText = await extractResumeTextFromFile(fileName, mimeType, base64);
    const parsed = await parseStructuredResumeJson(req.userId, rawText, {
      fallbackName: profileName ?? fileName.replace(/\.[^.]+$/, ""),
    });
    const importId = await saveMasterResumeImport(req.userId, {
      sourceType: "upload",
      fileName,
      rawText,
      parsedJson: parsed as Record<string, unknown>,
    });

    let createdProfile = null;
    if (createProfile) {
      const normalized = normalizeImportedResumeToProfile(parsed, profileName ?? fileName.replace(/\.[^.]+$/, ""));
      normalized.sourceImportId = importId;
      normalized.isActive = isActive !== false;
      normalized.useForAi = useForAi !== false;
      normalized.isDefault = Boolean(isDefault);
      createdProfile = await saveMasterResumeProfile(req.userId, normalized);
    }

    res.status(201).json({
      importId,
      rawText,
      parsed,
      profile: createdProfile,
    });
  } catch (err) {
    console.error("[ai/parse-resume]", err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to parse resume file." });
  }
});

const profileIdSchema = z.object({
  profileId: z.string().uuid(),
});

router.post("/generate-summary", validate(profileIdSchema), async (req: Request, res: Response) => {
  const { profileId } = req.body as z.infer<typeof profileIdSchema>;

  try {
    const profile = await getMasterResumeProfile(req.userId, profileId);
    if (!profile) {
      return res.status(404).json({ message: "Master resume profile not found." });
    }

    const focusProfileContext =
      await getMasterResumeContextForProfile(req.userId, profileId) ??
      `Master resume profile: ${profile.name}`;
    const resumeLibrary = await getAiResumeSourceContext(req.userId, {
      preferredProfileIds: [profileId],
    });
    const globalAi = await getGlobalAiSettings(req.userId);
    const supportingContext = resumeLibrary.profileIds.includes(profileId)
      ? resumeLibrary.context
      : [focusProfileContext, resumeLibrary.context].filter(Boolean).join("\n\n===\n\n");

    const prompt = `Create a strong 3-4 sentence professional summary for this master resume profile.

FOCUS PROFILE
${focusProfileContext}

SUPPORTING ACTIVE RESUME LIBRARY
${supportingContext || "No additional active AI resume profiles are currently enabled."}

AI WRITING PREFERENCES
${buildAiPreferenceNotes(globalAi).join("\n")}

Return only JSON:
{
  "summary": ""
}

Rules:
- No invented experience.
- ATS-friendly and concise.
- Emphasize measurable impact and role alignment.
- Use the focus profile as the primary source of truth.
- Supporting resume profiles can help with overlap, tone, and keywords, but do not blend in experience that does not belong to the focus profile.
- Ignore deactivated resume profiles entirely.`;

    const result = await runJsonCompletion<{ summary?: string }>({
      userId: req.userId,
      system: "You are a senior resume strategist. Return valid JSON only.",
      prompt,
      maxTokens: 400,
      temperature: 0.3,
    });

    res.json({ summary: result.summary?.trim() ?? "" });
  } catch (err) {
    console.error("[ai/generate-summary]", err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to generate summary." });
  }
});

const bulletSchema = z.object({
  profileId: z.string().uuid().optional(),
  title: z.string().min(1),
  company: z.string().min(1),
  roleContext: z.string().max(5000).optional(),
  rawBullets: z.array(z.string().max(1000)).default([]),
});

router.post("/generate-bullets", validate(bulletSchema), async (req: Request, res: Response) => {
  const { profileId, title, company, roleContext, rawBullets } = req.body as z.infer<typeof bulletSchema>;

  try {
    const profile = profileId ? await getMasterResumeProfile(req.userId, profileId) : null;
    const profileContext = profile
      ? `PROFILE: ${profile.name}
TARGET ROLES: ${profile.targetRoles.join(", ")}
SUMMARY: ${profile.summary ?? ""}
CORE SKILLS: ${profile.skills.core.join(", ")}
TOOLS: ${profile.skills.tools.join(", ")}`
      : "PROFILE: Not provided";

    const prompt = `Generate strong ATS-friendly impact bullets for this experience using the pattern:
"Accomplished [X] as measured by [Y], by doing [Z]"

${profileContext}

EXPERIENCE TITLE: ${title}
COMPANY: ${company}
ROLE CONTEXT:
${roleContext ?? ""}

RAW BULLETS / NOTES:
${rawBullets.join("\n")}

Return only valid JSON:
{
  "bullets": [
    {
      "description": "",
      "tools": [],
      "keywords": []
    }
  ]
}

Rules:
- Do not hallucinate achievements or metrics.
- Write each bullet as one complete, concise sentence using a strong action verb.
- Include measurable outcomes where available.
- Keep bullets recruiter-friendly and ATS-optimized.`;

    const result = await runJsonCompletion<{ bullets?: Array<Record<string, unknown>> }>({
      userId: req.userId,
      system: "You are an expert resume bullet writer. Return JSON only.",
      prompt,
      maxTokens: 1200,
      temperature: 0.35,
    });

    res.json({
      bullets: Array.isArray(result.bullets) ? result.bullets : [],
    });
  } catch (err) {
    console.error("[ai/generate-bullets]", err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to generate bullets." });
  }
});

const scoreSchema = z.object({
  profileId: z.string().uuid(),
  jobTitle: z.string().max(200).optional(),
  jobDescription: z.string().min(20),
});

router.post("/score-resume", validate(scoreSchema), async (req: Request, res: Response) => {
  const { profileId, jobTitle, jobDescription } = req.body as z.infer<typeof scoreSchema>;

  try {
    const profile = await getMasterResumeProfile(req.userId, profileId);
    if (!profile) {
      return res.status(404).json({ message: "Master resume profile not found." });
    }

    const score = scoreMasterResume({
      name: profile.name,
      targetRoles: profile.targetRoles,
      summary: profile.summary,
      experienceYears: profile.experienceYears,
      experiences: profile.experiences,
      skills: profile.skills,
      education: profile.education,
      projects: profile.projects,
      leadership: profile.leadership ? {
        teamSize: profile.leadership.teamSize ?? null,
        scope: profile.leadership.scope ?? "",
        stakeholders: profile.leadership.stakeholders,
        budget: profile.leadership.budget ?? "",
      } : null,
      jobTitle: jobTitle ?? "",
      jobDescription,
    });

    res.json(score);
  } catch (err) {
    console.error("[ai/score-resume]", err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to score resume." });
  }
});

const extractJobSchema = z.object({
  description: z.string().min(20),
});

router.post("/extract-job", validate(extractJobSchema), async (req: Request, res: Response) => {
  try {
    const { description } = req.body as z.infer<typeof extractJobSchema>;
    const result = await extractJobSignals(req.userId, description);
    res.json({
      skills: result.skills,
      minimumQualifications: result.minimumQualifications,
      keywords: result.keywords,
    });
  } catch (err) {
    console.error("[ai/extract-job]", err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to extract job signals." });
  }
});

const extractJobFromEmailSchema = z.object({
  html: z.string().optional().default(""),
  text: z.string().optional().default(""),
  snippet: z.string().optional().default(""),
  subject: z.string().optional().default(""),
  sender: z.string().optional().default(""),
});

router.post("/extract-job-from-email", validate(extractJobFromEmailSchema), async (req: Request, res: Response) => {
  try {
    const payload = req.body as z.infer<typeof extractJobFromEmailSchema>;
    const parsed = await extractJobFromEmailWithFallback(req.userId, {
      html: payload.html,
      text: payload.text,
      snippet: payload.snippet,
      subject: payload.subject,
      sender: payload.sender,
    });
    res.json({
      title: parsed.title,
      company: parsed.company,
      location: parsed.location,
      url: parsed.url,
    });
  } catch (err) {
    console.error("[ai/extract-job-from-email]", err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to extract job from email." });
  }
});

export default router;
