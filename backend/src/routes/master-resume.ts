import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  deleteMasterResumeProfile,
  getMasterResumeProfile,
  getMasterResumeProfiles,
  listMasterResumeImports,
  saveMasterResumeProfile,
} from "../services/master-resume";
import { normalizeImportedResumeToProfile } from "../services/master-resume-import";
import { scoreMasterResume } from "../services/master-resume-score";
import { query, queryOne } from "../db/pool";

const router = Router();
router.use(requireAuth);

const bulletSchema = z.object({
  id: z.string().uuid().optional(),
  description: z.string().max(3000).optional().or(z.literal("")),
  tools: z.array(z.string().max(100)).default([]),
  keywords: z.array(z.string().max(100)).default([]),
});

const customSectionSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(10000).optional().or(z.literal("")),
  tools: z.array(z.string().max(100)).default([]),
  keywords: z.array(z.string().max(100)).default([]),
});

const experienceSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  bullets: z.array(bulletSchema).default([]),
});

const projectSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  role: z.string().max(200).optional().or(z.literal("")),
  description: z.string().max(5000).optional().or(z.literal("")),
  tools: z.array(z.string().max(100)).default([]),
  teamSize: z.number().int().min(0).max(100000).optional().nullable(),
  outcome: z.string().max(3000).optional().or(z.literal("")),
  metrics: z.string().max(1000).optional().or(z.literal("")),
});

const educationSchema = z.object({
  id: z.string().uuid().optional(),
  school: z.string().min(1).max(250),
  degree: z.string().max(250).optional().or(z.literal("")),
  fieldOfStudy: z.string().max(250).optional().or(z.literal("")),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  notes: z.string().max(3000).optional().or(z.literal("")),
});

const leadershipSchema = z.object({
  teamSize: z.number().int().min(0).max(100000).optional().nullable(),
  scope: z.string().max(3000).optional().or(z.literal("")),
  stakeholders: z.array(z.string().max(150)).default([]),
  budget: z.string().max(500).optional().or(z.literal("")),
});

const profileSchema = z.object({
  name: z.string().min(1).max(200),
  targetRoles: z.array(z.string().max(150)).default([]),
  summary: z.string().max(10000).optional().or(z.literal("")),
  experienceYears: z.number().int().min(0).max(80).optional().nullable(),
  isActive: z.boolean().optional(),
  useForAi: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  sourceImportId: z.string().uuid().optional().nullable(),
  experiences: z.array(experienceSchema).default([]),
  skills: z.object({
    core: z.array(z.string().max(100)).default([]),
    tools: z.array(z.string().max(100)).default([]),
    soft: z.array(z.string().max(100)).default([]),
    certifications: z.array(z.string().max(150)).default([]),
  }),
  education: z.array(educationSchema).default([]),
  projects: z.array(projectSchema).default([]),
  leadership: leadershipSchema.optional().nullable(),
  customSections: z.array(customSectionSchema).default([]),
});

router.get("/profiles", async (req: Request, res: Response) => {
  try {
    const profiles = await getMasterResumeProfiles(req.userId);
    res.json(profiles);
  } catch (err) {
    console.error("[master-resume/list]", err);
    res.status(500).json({ message: "Failed to load master resume profiles." });
  }
});

router.get("/profiles/:id", async (req: Request, res: Response) => {
  try {
    const profile = await getMasterResumeProfile(req.userId, req.params.id);
    if (!profile) {
      return res.status(404).json({ message: "Master resume profile not found." });
    }
    res.json(profile);
  } catch (err) {
    console.error("[master-resume/get]", err);
    res.status(500).json({ message: "Failed to load master resume profile." });
  }
});

router.post("/profiles", validate(profileSchema), async (req: Request, res: Response) => {
  try {
    const profile = await saveMasterResumeProfile(req.userId, req.body as z.infer<typeof profileSchema>);
    res.status(201).json(profile);
  } catch (err) {
    console.error("[master-resume/create]", err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to create master resume profile." });
  }
});

router.put("/profiles/:id", validate(profileSchema), async (req: Request, res: Response) => {
  try {
    const profile = await saveMasterResumeProfile(req.userId, req.body as z.infer<typeof profileSchema>, req.params.id);
    res.json(profile);
  } catch (err) {
    console.error("[master-resume/update]", err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to update master resume profile." });
  }
});

router.delete("/profiles/:id", async (req: Request, res: Response) => {
  try {
    const deleted = await deleteMasterResumeProfile(req.userId, req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Master resume profile not found." });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[master-resume/delete]", err);
    res.status(500).json({ message: "Failed to delete master resume profile." });
  }
});

router.get("/profiles/:id/matched-jobs", async (req: Request, res: Response) => {
  try {
    const profile = await getMasterResumeProfile(req.userId, req.params.id);
    if (!profile) return res.status(404).json({ message: "Profile not found." });

    const jobs = await query<Record<string, unknown>>(
      `SELECT jm.*,
              rd.id AS resume_id,
              rd.title AS resume_title,
              rd.updated_at AS resume_updated_at,
              rd.resume_type AS resume_type
       FROM job_matches jm
       LEFT JOIN LATERAL (
         SELECT d.id, d.title, d.updated_at, d.resume_type
         FROM documents d
         WHERE d.user_id = jm.user_id
           AND d.kind = 'resume'
           AND d.resume_type = 'tailored'
           AND d.metadata->>'jobMatchId' = jm.id::text
         ORDER BY d.updated_at DESC
         LIMIT 1
       ) rd ON true
       WHERE jm.user_id = $1
         AND jm.status != 'dismissed'
         AND jm.match_tier IN ('strong', 'maybe', 'new')
       ORDER BY jm.ai_score DESC NULLS LAST, jm.created_at DESC
       LIMIT 60`,
      [req.userId]
    );

    const scored = jobs
      .map((job) => {
        const resumeScore = scoreMasterResume({
          name: profile.name,
          targetRoles: profile.targetRoles,
          summary: profile.summary,
          experienceYears: profile.experienceYears,
          experiences: profile.experiences,
          skills: profile.skills,
          education: profile.education,
          projects: profile.projects,
          leadership: profile.leadership,
          jobTitle: String(job.title ?? ""),
          jobDescription: String(job.description ?? ""),
        });

        const fitScore = Math.round(
          resumeScore.atsScore * 0.35 +
          resumeScore.mqMatch.matchScore * 0.35 +
          resumeScore.impactScore * 0.15 +
          resumeScore.completenessScore * 0.15
        );

        return {
          fitScore,
          job,
        };
      })
      .sort(
        (a, b) =>
          b.fitScore - a.fitScore ||
          Number(b.job.ai_score ?? 0) - Number(a.job.ai_score ?? 0) ||
          new Date(String(b.job.created_at ?? 0)).getTime() - new Date(String(a.job.created_at ?? 0)).getTime()
      )
      .slice(0, 20)
      .map(({ job, fitScore }) => ({
        id: String(job.id),
        title: String(job.title),
        company: job.company ? String(job.company) : undefined,
        location: job.location ? String(job.location) : undefined,
        remote: Boolean(job.remote),
        aiScore: job.ai_score != null ? Number(job.ai_score) : undefined,
        aiSummary: job.ai_summary ? String(job.ai_summary) : undefined,
        matchTier: job.match_tier ? String(job.match_tier) : undefined,
        source: job.source ? String(job.source) : "manual",
        sourceUrl: job.source_url ? String(job.source_url) : undefined,
        status: String(job.status),
        createdAt: String(job.created_at),
        postedAt: job.posted_at ? String(job.posted_at) : undefined,
        scoreBreakdown: (job.score_breakdown as Record<string, unknown> | null) ?? undefined,
        fitScore,
        fitResumeProfileId: profile.id,
        fitResumeProfileName: profile.name,
        linkedResume: job.resume_id
          ? {
              id: String(job.resume_id),
              title: String(job.resume_title),
              lastModified: String(job.resume_updated_at),
              resumeType: job.resume_type ? String(job.resume_type) : undefined,
            }
          : undefined,
      }));

    res.json(scored);
  } catch (err) {
    console.error("[master-resume/matched-jobs]", err);
    res.status(500).json({ message: "Failed to load matched jobs." });
  }
});

router.get("/imports", async (req: Request, res: Response) => {
  try {
    const imports = await listMasterResumeImports(req.userId);
    res.json(imports.map((row) => ({
      id: row.id,
      sourceType: row.source_type,
      sourceUrl: row.source_url,
      fileName: row.file_name,
      rawText: row.raw_text,
      parsedJson: row.parsed_json,
      createdAt: row.created_at,
    })));
  } catch (err) {
    console.error("[master-resume/imports]", err);
    res.status(500).json({ message: "Failed to load resume imports." });
  }
});

const createFromImportSchema = z.object({
  importId: z.string().uuid(),
  name: z.string().max(200).optional(),
  isActive: z.boolean().optional(),
  useForAi: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

router.post("/profiles/from-import", validate(createFromImportSchema), async (req: Request, res: Response) => {
  const { importId, name, isActive, useForAi, isDefault } = req.body as z.infer<typeof createFromImportSchema>;

  try {
    const imported = await queryOne<{ parsed_json: Record<string, unknown> }>(
      `SELECT parsed_json
       FROM master_resume_imports
       WHERE id = $1 AND user_id = $2`,
      [importId, req.userId]
    );
    if (!imported?.parsed_json) {
      return res.status(404).json({ message: "Resume import not found." });
    }

    const normalized = normalizeImportedResumeToProfile(imported.parsed_json, name);
    normalized.sourceImportId = importId;
    normalized.isActive = isActive !== false;
    normalized.useForAi = useForAi !== false;
    normalized.isDefault = Boolean(isDefault);

    const profile = await saveMasterResumeProfile(req.userId, normalized);
    res.status(201).json(profile);
  } catch (err) {
    console.error("[master-resume/from-import]", err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to create profile from import." });
  }
});

export default router;
