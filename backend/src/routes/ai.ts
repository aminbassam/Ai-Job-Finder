import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { runJsonCompletion } from "../services/ai-client";
import {
  extractResumeTextFromFile,
  extractTextFromLinkedInUrl,
  normalizeImportedResumeToProfile,
  parseStructuredResumeJson,
} from "../services/master-resume-import";
import {
  getMasterResumeProfile,
  saveMasterResumeImport,
  saveMasterResumeProfile,
} from "../services/master-resume";
import { scoreMasterResume } from "../services/master-resume-score";

const router = Router();
router.use(requireAuth);

const parseLinkedInSchema = z.object({
  url: z.string().url(),
  profileName: z.string().max(200).optional(),
  createProfile: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

router.post("/parse-linkedin", validate(parseLinkedInSchema), async (req: Request, res: Response) => {
  const { url, profileName, createProfile, isDefault } = req.body as z.infer<typeof parseLinkedInSchema>;

  try {
    const rawText = await extractTextFromLinkedInUrl(url);
    const parsed = await parseStructuredResumeJson(req.userId, rawText, "linkedin");
    const importId = await saveMasterResumeImport(req.userId, {
      sourceType: "linkedin",
      sourceUrl: url,
      rawText,
      parsedJson: parsed as Record<string, unknown>,
    });

    let createdProfile = null;
    if (createProfile) {
      const normalized = normalizeImportedResumeToProfile(parsed, profileName ?? "LinkedIn Profile");
      normalized.sourceImportId = importId;
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
    console.error("[ai/parse-linkedin]", err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to parse LinkedIn profile." });
  }
});

const parseResumeSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  base64: z.string().min(1),
  profileName: z.string().max(200).optional(),
  createProfile: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

router.post("/parse-resume", validate(parseResumeSchema), async (req: Request, res: Response) => {
  const { fileName, mimeType, base64, profileName, createProfile, isDefault } = req.body as z.infer<typeof parseResumeSchema>;

  try {
    const rawText = await extractResumeTextFromFile(fileName, mimeType, base64);
    const parsed = await parseStructuredResumeJson(req.userId, rawText, "upload");
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

    const prompt = `Create a strong 3-4 sentence professional summary for this master resume profile.

PROFILE NAME: ${profile.name}
TARGET ROLES: ${profile.targetRoles.join(", ")}
YEARS OF EXPERIENCE: ${profile.experienceYears}
CURRENT SUMMARY: ${profile.summary ?? ""}
CORE SKILLS: ${profile.skills.core.join(", ")}
TOOLS: ${profile.skills.tools.join(", ")}
PROJECTS: ${profile.projects.map((project) => `${project.name}: ${project.outcome ?? project.description ?? ""}`).join(" | ")}
LEADERSHIP: ${profile.leadership?.scope ?? ""}

Return only JSON:
{
  "summary": ""
}

Rules:
- No invented experience.
- ATS-friendly and concise.
- Emphasize measurable impact and role alignment.`;

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
      "action": "",
      "method": "",
      "result": "",
      "metric": "",
      "tools": [],
      "keywords": [],
      "originalText": ""
    }
  ]
}

Rules:
- Do not hallucinate achievements or metrics.
- If no metric exists, leave metric empty.
- Use strong action verbs.
- Keep bullets concise and recruiter-friendly.`;

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

export default router;
