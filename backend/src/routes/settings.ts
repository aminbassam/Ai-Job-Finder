import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, queryOne } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";

const router = Router();
router.use(requireAuth);

// ── GET /api/settings/preferences ────────────────────────────────────────────

router.get("/preferences", async (req: Request, res: Response): Promise<void> => {
  try {
    const prefs = await queryOne<Record<string, unknown>>(
      `SELECT auto_optimize_ats, include_cover_letters,
              notify_new_matches, notify_application_updates,
              notify_weekly_summary, notify_ai_insights,
              default_ai_provider
       FROM user_preferences WHERE user_id = $1`,
      [req.userId]
    );
    res.json(prefs ?? {});
  } catch (err) {
    console.error("[settings/prefs/get]", err);
    res.status(500).json({ message: "Failed to fetch preferences." });
  }
});

// ── PUT /api/settings/preferences ────────────────────────────────────────────

const prefsSchema = z.object({
  autoOptimizeAts:          z.boolean().optional(),
  includeCoverLetters:      z.boolean().optional(),
  notifyNewMatches:         z.boolean().optional(),
  notifyApplicationUpdates: z.boolean().optional(),
  notifyWeeklySummary:      z.boolean().optional(),
  notifyAiInsights:         z.boolean().optional(),
  defaultAiProvider:        z.enum(["openai", "anthropic", "other"]).optional(),
});

router.put("/preferences", validate(prefsSchema), async (req: Request, res: Response): Promise<void> => {
  const d = req.body as z.infer<typeof prefsSchema>;
  try {
    await query(
      `INSERT INTO user_preferences (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET
         auto_optimize_ats          = COALESCE($2, user_preferences.auto_optimize_ats),
         include_cover_letters      = COALESCE($3, user_preferences.include_cover_letters),
         notify_new_matches         = COALESCE($4, user_preferences.notify_new_matches),
         notify_application_updates = COALESCE($5, user_preferences.notify_application_updates),
         notify_weekly_summary      = COALESCE($6, user_preferences.notify_weekly_summary),
         notify_ai_insights         = COALESCE($7, user_preferences.notify_ai_insights),
         default_ai_provider        = COALESCE($8::ai_provider, user_preferences.default_ai_provider),
         updated_at                 = NOW()`,
      [
        req.userId,
        d.autoOptimizeAts ?? null,
        d.includeCoverLetters ?? null,
        d.notifyNewMatches ?? null,
        d.notifyApplicationUpdates ?? null,
        d.notifyWeeklySummary ?? null,
        d.notifyAiInsights ?? null,
        d.defaultAiProvider ?? null,
      ]
    );
    res.json({ message: "Preferences updated." });
  } catch (err) {
    console.error("[settings/prefs/update]", err);
    res.status(500).json({ message: "Failed to update preferences." });
  }
});

// ── GET /api/settings/ai-providers ───────────────────────────────────────────

router.get("/ai-providers", async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await query<Record<string, unknown>>(
      `SELECT provider, is_connected, is_default, key_hint, last_validated_at
       FROM ai_provider_connections WHERE user_id = $1`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error("[settings/ai-providers/get]", err);
    res.status(500).json({ message: "Failed to fetch AI providers." });
  }
});

// ── POST /api/settings/ai-providers ─────────────────────────────────────────

const aiKeySchema = z.object({
  provider: z.enum(["openai", "anthropic"]),
  apiKey:   z.string().min(10).max(500),
});

router.post("/ai-providers", validate(aiKeySchema), async (req: Request, res: Response): Promise<void> => {
  const { provider, apiKey } = req.body as z.infer<typeof aiKeySchema>;

  // In production: encrypt apiKey before storage using KMS or symmetric encryption.
  // For now we store a hint only (last 4 chars) and never the full key in plaintext.
  const keyHint = `••••${apiKey.slice(-4)}`;

  try {
    await query(
      `INSERT INTO ai_provider_connections (user_id, provider, key_hint, is_connected, last_validated_at)
       VALUES ($1, $2, $3, true, NOW())
       ON CONFLICT (user_id, provider) DO UPDATE SET
         key_hint         = EXCLUDED.key_hint,
         is_connected     = true,
         last_validated_at = NOW(),
         updated_at       = NOW()`,
      [req.userId, provider, keyHint]
    );
    res.json({ message: `${provider} connected.`, keyHint });
  } catch (err) {
    console.error("[settings/ai-providers/save]", err);
    res.status(500).json({ message: "Failed to save API key." });
  }
});

// ── DELETE /api/settings/ai-providers/:provider ──────────────────────────────

router.delete("/ai-providers/:provider", async (req: Request, res: Response): Promise<void> => {
  try {
    await query(
      `UPDATE ai_provider_connections
       SET is_connected = false, key_hint = NULL, updated_at = NOW()
       WHERE user_id = $1 AND provider = $2`,
      [req.userId, req.params.provider]
    );
    res.json({ message: "Provider disconnected." });
  } catch (err) {
    console.error("[settings/ai-providers/delete]", err);
    res.status(500).json({ message: "Failed to disconnect provider." });
  }
});

// ── GET /api/settings/resume-preferences ─────────────────────────────────────

router.get("/resume-preferences", async (req: Request, res: Response): Promise<void> => {
  try {
    const prefs = await queryOne<Record<string, unknown>>(
      `SELECT key_achievements, certifications, tools_technologies, soft_skills,
              target_roles, seniority_level, industry_focus, must_have_keywords,
              ai_tone, resume_style, bullet_style,
              ats_level, include_cover_letters,
              cover_letter_tone, cover_letter_length, cover_letter_personalization,
              no_fake_experience, no_change_titles, no_exaggerate_metrics, only_rephrase
       FROM resume_preferences WHERE user_id = $1`,
      [req.userId]
    );
    res.json(prefs ?? {});
  } catch (err) {
    console.error("[settings/resume-prefs/get]", err);
    res.status(500).json({ message: "Failed to fetch resume preferences." });
  }
});

// ── PUT /api/settings/resume-preferences ─────────────────────────────────────

const resumePrefsSchema = z.object({
  keyAchievements:            z.string().max(5000).optional(),
  certifications:             z.string().max(2000).optional(),
  toolsTechnologies:          z.array(z.string().max(100)).max(50).optional(),
  softSkills:                 z.array(z.string().max(100)).max(50).optional(),
  targetRoles:                z.array(z.string().max(200)).max(20).optional(),
  seniorityLevel:             z.enum(["junior","mid","senior","lead","executive"]).optional(),
  industryFocus:              z.array(z.string().max(100)).max(20).optional(),
  mustHaveKeywords:           z.array(z.string().max(100)).max(50).optional(),
  aiTone:                     z.enum(["concise","impact-driven","technical"]).optional(),
  resumeStyle:                z.enum(["ats-safe","balanced","human-friendly"]).optional(),
  bulletStyle:                z.enum(["metrics-heavy","responsibility-focused"]).optional(),
  atsLevel:                   z.enum(["basic","balanced","aggressive"]).optional(),
  includeCoverLetters:        z.boolean().optional(),
  coverLetterTone:            z.enum(["formal","friendly","confident"]).optional(),
  coverLetterLength:          z.enum(["short","medium","detailed"]).optional(),
  coverLetterPersonalization: z.enum(["low","medium","high"]).optional(),
  noFakeExperience:           z.boolean().optional(),
  noChangeTitles:             z.boolean().optional(),
  noExaggerateMetrics:        z.boolean().optional(),
  onlyRephrase:               z.boolean().optional(),
});

router.put("/resume-preferences", validate(resumePrefsSchema), async (req: Request, res: Response): Promise<void> => {
  const d = req.body as z.infer<typeof resumePrefsSchema>;
  try {
    await query(
      `INSERT INTO resume_preferences (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET
         key_achievements            = COALESCE($2,  resume_preferences.key_achievements),
         certifications              = COALESCE($3,  resume_preferences.certifications),
         tools_technologies          = COALESCE($4,  resume_preferences.tools_technologies),
         soft_skills                 = COALESCE($5,  resume_preferences.soft_skills),
         target_roles                = COALESCE($6,  resume_preferences.target_roles),
         seniority_level             = COALESCE($7,  resume_preferences.seniority_level),
         industry_focus              = COALESCE($8,  resume_preferences.industry_focus),
         must_have_keywords          = COALESCE($9,  resume_preferences.must_have_keywords),
         ai_tone                     = COALESCE($10, resume_preferences.ai_tone),
         resume_style                = COALESCE($11, resume_preferences.resume_style),
         bullet_style                = COALESCE($12, resume_preferences.bullet_style),
         ats_level                   = COALESCE($13, resume_preferences.ats_level),
         include_cover_letters       = COALESCE($14, resume_preferences.include_cover_letters),
         cover_letter_tone           = COALESCE($15, resume_preferences.cover_letter_tone),
         cover_letter_length         = COALESCE($16, resume_preferences.cover_letter_length),
         cover_letter_personalization = COALESCE($17, resume_preferences.cover_letter_personalization),
         no_fake_experience          = COALESCE($18, resume_preferences.no_fake_experience),
         no_change_titles            = COALESCE($19, resume_preferences.no_change_titles),
         no_exaggerate_metrics       = COALESCE($20, resume_preferences.no_exaggerate_metrics),
         only_rephrase               = COALESCE($21, resume_preferences.only_rephrase),
         updated_at                  = NOW()`,
      [
        req.userId,
        d.keyAchievements            ?? null,
        d.certifications             ?? null,
        d.toolsTechnologies          ?? null,
        d.softSkills                 ?? null,
        d.targetRoles                ?? null,
        d.seniorityLevel             ?? null,
        d.industryFocus              ?? null,
        d.mustHaveKeywords           ?? null,
        d.aiTone                     ?? null,
        d.resumeStyle                ?? null,
        d.bulletStyle                ?? null,
        d.atsLevel                   ?? null,
        d.includeCoverLetters        ?? null,
        d.coverLetterTone            ?? null,
        d.coverLetterLength          ?? null,
        d.coverLetterPersonalization ?? null,
        d.noFakeExperience           ?? null,
        d.noChangeTitles             ?? null,
        d.noExaggerateMetrics        ?? null,
        d.onlyRephrase               ?? null,
      ]
    );
    res.json({ message: "Resume preferences updated." });
  } catch (err) {
    console.error("[settings/resume-prefs/update]", err);
    res.status(500).json({ message: "Failed to update resume preferences." });
  }
});

// ── GET /api/settings/subscription ───────────────────────────────────────────

router.get("/subscription", async (req: Request, res: Response): Promise<void> => {
  try {
    const sub = await queryOne<Record<string, unknown>>(
      `SELECT us.plan_code, us.status, us.billing_interval,
              us.current_period_end, us.cancel_at_period_end,
              sp.display_name, sp.monthly_price_cents, sp.yearly_price_cents,
              sp.monthly_ai_credits, sp.features
       FROM user_subscriptions us
       JOIN subscription_plans sp ON sp.code = us.plan_code
       WHERE us.user_id = $1 AND us.status = 'active'
       ORDER BY us.created_at DESC LIMIT 1`,
      [req.userId]
    );

    const ledger = await queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(delta), 0)::text AS total
       FROM user_credit_ledger WHERE user_id = $1`,
      [req.userId]
    );

    const creditsUsed = Math.abs(parseInt(ledger?.total ?? "0", 10));
    const totalCredits = parseInt(String(sub?.monthly_ai_credits ?? 100), 10);
    const aiCreditsRemaining = Math.max(0, totalCredits - creditsUsed);

    res.json({
      plan: sub?.plan_code ?? "free",
      displayName: sub?.display_name ?? "Free",
      status: sub?.status ?? "active",
      billingInterval: sub?.billing_interval,
      currentPeriodEnd: sub?.current_period_end,
      cancelAtPeriodEnd: sub?.cancel_at_period_end ?? false,
      monthlyPrice: sub?.monthly_price_cents ?? 0,
      features: sub?.features ?? {},
      aiCredits: aiCreditsRemaining,
      totalCredits,
    });
  } catch (err) {
    console.error("[settings/subscription]", err);
    res.status(500).json({ message: "Failed to fetch subscription." });
  }
});

export default router;
