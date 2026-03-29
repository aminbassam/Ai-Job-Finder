import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, queryOne } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { encrypt, decrypt } from "../utils/encryption";

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

// ── Helpers: AI provider test calls ──────────────────────────────────────────

async function testOpenAiKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) return { ok: true };
    const body = await r.json().catch(() => ({})) as { error?: { message?: string } };
    return { ok: false, error: body?.error?.message ?? `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function testAnthropicKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) return { ok: true };
    const body = await r.json().catch(() => ({})) as { error?: { message?: string } };
    return { ok: false, error: body?.error?.message ?? `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ── GET /api/settings/ai-providers ───────────────────────────────────────────

router.get("/ai-providers", async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await query<Record<string, unknown>>(
      `SELECT provider, connection_status, is_default, key_hint,
              selected_model, last_validated_at, last_error
       FROM ai_provider_connections WHERE user_id = $1`,
      [req.userId]
    );
    // Never return encrypted key material to client
    res.json(rows.map((r) => ({
      provider:        r.provider,
      status:          r.connection_status ?? "disconnected",
      isDefault:       r.is_default,
      keyHint:         r.key_hint,
      selectedModel:   r.selected_model,
      lastValidatedAt: r.last_validated_at,
      lastError:       r.last_error,
    })));
  } catch (err) {
    console.error("[settings/ai-providers/get]", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ message: `Failed to fetch AI providers: ${msg}` });
  }
});

// ── POST /api/settings/ai-providers ──────────────────────────────────────────

const aiKeySchema = z.object({
  provider: z.enum(["openai", "anthropic"]),
  apiKey:   z.string().min(10).max(500),
});

router.post("/ai-providers", validate(aiKeySchema), async (req: Request, res: Response): Promise<void> => {
  const { provider, apiKey } = req.body as z.infer<typeof aiKeySchema>;
  const keyHint = `••••${apiKey.slice(-4)}`;

  // Mark as validating immediately
  try {
    await query(
      `INSERT INTO ai_provider_connections
         (user_id, provider, key_hint, connection_status, is_connected)
       VALUES ($1, $2, $3, 'validating', false)
       ON CONFLICT (user_id, provider) DO UPDATE SET
         key_hint          = EXCLUDED.key_hint,
         connection_status = 'validating',
         is_connected      = false,
         last_error        = NULL,
         updated_at        = NOW()`,
      [req.userId, provider, keyHint]
    );
  } catch (err) {
    console.error("[ai-providers/save/pre]", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ message: `Failed to save API key: ${msg}` });
    return;
  }

  // Validate with real API
  const test = provider === "openai"
    ? await testOpenAiKey(apiKey)
    : await testAnthropicKey(apiKey);

  if (!test.ok) {
    await query(
      `UPDATE ai_provider_connections
       SET connection_status = 'error', last_error = $3, updated_at = NOW()
       WHERE user_id = $1 AND provider = $2`,
      [req.userId, provider, test.error ?? "Validation failed."]
    ).catch(() => {});
    res.status(422).json({ message: test.error ?? "API key validation failed." });
    return;
  }

  // Encrypt and store
  try {
    const enc = encrypt(apiKey);
    const defaultModel = provider === "openai" ? "gpt-4o" : "claude-sonnet-4-6";
    await query(
      `UPDATE ai_provider_connections
       SET connection_status  = 'connected',
           is_connected       = true,
           encrypted_key      = $3,
           encryption_iv      = $4,
           encryption_tag     = $5,
           last_validated_at  = NOW(),
           last_error         = NULL,
           selected_model     = COALESCE(selected_model, $6),
           updated_at         = NOW()
       WHERE user_id = $1 AND provider = $2`,
      [req.userId, provider, enc.encrypted, enc.iv, enc.tag, defaultModel]
    );
    const result = await queryOne<Record<string, unknown>>(
      `SELECT connection_status, key_hint, selected_model, last_validated_at
       FROM ai_provider_connections WHERE user_id = $1 AND provider = $2`,
      [req.userId, provider]
    );
    res.json({
      message:    `${provider} connected successfully.`,
      status:     "connected",
      keyHint,
      selectedModel: result?.selected_model ?? defaultModel,
    });
  } catch (err) {
    console.error("[ai-providers/save/encrypt]", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ message: `Failed to save encrypted key: ${msg}` });
  }
});

// ── POST /api/settings/ai-providers/:provider/test ───────────────────────────

router.post("/ai-providers/:provider/test", async (req: Request, res: Response): Promise<void> => {
  const { provider } = req.params;
  try {
    const row = await queryOne<Record<string, unknown>>(
      `SELECT encrypted_key, encryption_iv, encryption_tag
       FROM ai_provider_connections
       WHERE user_id = $1 AND provider = $2 AND is_connected = true`,
      [req.userId, provider]
    );
    if (!row?.encrypted_key) {
      res.status(404).json({ message: "No connected key found." });
      return;
    }
    const apiKey = decrypt({
      encrypted: String(row.encrypted_key),
      iv:        String(row.encryption_iv),
      tag:       String(row.encryption_tag),
    });
    const test = provider === "openai"
      ? await testOpenAiKey(apiKey)
      : await testAnthropicKey(apiKey);

    const newStatus = test.ok ? "connected" : "error";
    await query(
      `UPDATE ai_provider_connections
       SET connection_status = $3, last_error = $4,
           last_validated_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND provider = $2`,
      [req.userId, provider, newStatus, test.error ?? null]
    );
    res.json({
      status:    newStatus,
      lastError: test.error ?? null,
    });
  } catch (err) {
    console.error("[ai-providers/test]", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ message: `Failed to test connection: ${msg}` });
  }
});

// ── PUT /api/settings/ai-providers/:provider/model ───────────────────────────

const modelSchema = z.object({
  model: z.string().min(1).max(100),
});

router.put("/ai-providers/:provider/model", validate(modelSchema), async (req: Request, res: Response): Promise<void> => {
  const { provider } = req.params;
  const { model } = req.body as z.infer<typeof modelSchema>;
  try {
    await query(
      `UPDATE ai_provider_connections
       SET selected_model = $3, updated_at = NOW()
       WHERE user_id = $1 AND provider = $2`,
      [req.userId, provider, model]
    );
    res.json({ message: "Model updated.", model });
  } catch (err) {
    console.error("[ai-providers/model]", err);
    res.status(500).json({ message: "Failed to update model." });
  }
});

// ── DELETE /api/settings/ai-providers/:provider ──────────────────────────────

router.delete("/ai-providers/:provider", async (req: Request, res: Response): Promise<void> => {
  try {
    await query(
      `UPDATE ai_provider_connections
       SET is_connected = false, connection_status = 'disconnected',
           encrypted_key = NULL, encryption_iv = NULL, encryption_tag = NULL,
           key_hint = NULL, last_error = NULL, updated_at = NOW()
       WHERE user_id = $1 AND provider = $2`,
      [req.userId, req.params.provider]
    );
    res.json({ message: "Provider disconnected." });
  } catch (err) {
    console.error("[ai-providers/disconnect]", err);
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
    // Full upsert — always send all provided values, cast arrays explicitly
    await query(
      `INSERT INTO resume_preferences (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET
         key_achievements             = COALESCE($2,   resume_preferences.key_achievements),
         certifications               = COALESCE($3,   resume_preferences.certifications),
         tools_technologies           = COALESCE($4::text[], resume_preferences.tools_technologies),
         soft_skills                  = COALESCE($5::text[], resume_preferences.soft_skills),
         target_roles                 = COALESCE($6::text[], resume_preferences.target_roles),
         seniority_level              = COALESCE($7,   resume_preferences.seniority_level),
         industry_focus               = COALESCE($8::text[], resume_preferences.industry_focus),
         must_have_keywords           = COALESCE($9::text[], resume_preferences.must_have_keywords),
         ai_tone                      = COALESCE($10,  resume_preferences.ai_tone),
         resume_style                 = COALESCE($11,  resume_preferences.resume_style),
         bullet_style                 = COALESCE($12,  resume_preferences.bullet_style),
         ats_level                    = COALESCE($13,  resume_preferences.ats_level),
         include_cover_letters        = COALESCE($14,  resume_preferences.include_cover_letters),
         cover_letter_tone            = COALESCE($15,  resume_preferences.cover_letter_tone),
         cover_letter_length          = COALESCE($16,  resume_preferences.cover_letter_length),
         cover_letter_personalization = COALESCE($17,  resume_preferences.cover_letter_personalization),
         no_fake_experience           = COALESCE($18,  resume_preferences.no_fake_experience),
         no_change_titles             = COALESCE($19,  resume_preferences.no_change_titles),
         no_exaggerate_metrics        = COALESCE($20,  resume_preferences.no_exaggerate_metrics),
         only_rephrase                = COALESCE($21,  resume_preferences.only_rephrase),
         updated_at                   = NOW()`,
      [
        req.userId,
        d.keyAchievements            ?? null,
        d.certifications             ?? null,
        d.toolsTechnologies          !== undefined ? d.toolsTechnologies : null,
        d.softSkills                 !== undefined ? d.softSkills        : null,
        d.targetRoles                !== undefined ? d.targetRoles       : null,
        d.seniorityLevel             ?? null,
        d.industryFocus              !== undefined ? d.industryFocus     : null,
        d.mustHaveKeywords           !== undefined ? d.mustHaveKeywords  : null,
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

// ── POST /api/settings/resume/improve ────────────────────────────────────────
// Uses the user's connected OpenAI key to rewrite their summary, achievements,
// and suggest additional ATS keywords based on their current resume data.

router.post("/resume/improve", async (req: Request, res: Response): Promise<void> => {
  try {
    // Get connected OpenAI key
    const keyRow = await queryOne<{
      encrypted_key: string; encryption_iv: string;
      encryption_tag: string; selected_model: string;
    }>(
      `SELECT encrypted_key, encryption_iv, encryption_tag, selected_model
       FROM ai_provider_connections
       WHERE user_id = $1 AND provider = 'openai' AND is_connected = true
       LIMIT 1`,
      [req.userId]
    );
    if (!keyRow?.encrypted_key) {
      res.status(422).json({ message: "No OpenAI key connected. Go to Settings → AI Providers to connect one." });
      return;
    }
    const apiKey = decrypt({
      encrypted: keyRow.encrypted_key,
      iv: keyRow.encryption_iv,
      tag: keyRow.encryption_tag,
    });
    const model = keyRow.selected_model ?? "gpt-4o-mini";

    // Gather resume context from request body (current form values)
    const {
      summary = "", keyAchievements = "", certifications = "",
      coreSkills = [], toolsTech = [], softSkills = [],
      targetRoles = [], seniorityLevel = "mid",
      industryFocus = [], mustHaveKeywords = [],
      yearsExperience = 0,
    } = req.body as Record<string, unknown>;

    const contextParts: string[] = [];
    if (yearsExperience) contextParts.push(`Years of experience: ${yearsExperience}`);
    if (seniorityLevel)  contextParts.push(`Seniority: ${seniorityLevel}`);
    if (Array.isArray(targetRoles) && targetRoles.length)
      contextParts.push(`Target roles: ${(targetRoles as string[]).join(", ")}`);
    if (Array.isArray(industryFocus) && industryFocus.length)
      contextParts.push(`Industries: ${(industryFocus as string[]).join(", ")}`);
    if (Array.isArray(coreSkills) && coreSkills.length)
      contextParts.push(`Core skills: ${(coreSkills as string[]).join(", ")}`);
    if (Array.isArray(toolsTech) && toolsTech.length)
      contextParts.push(`Tools & tech: ${(toolsTech as string[]).join(", ")}`);
    if (Array.isArray(softSkills) && softSkills.length)
      contextParts.push(`Soft skills: ${(softSkills as string[]).join(", ")}`);
    if (certifications) contextParts.push(`Certifications: ${certifications}`);

    const prompt = `You are an expert resume writer and career coach. Improve the candidate's resume content based on their profile.

CANDIDATE PROFILE:
${contextParts.join("\n") || "(not yet filled in)"}

CURRENT PROFESSIONAL SUMMARY:
${String(summary).trim() || "(empty)"}

CURRENT KEY ACHIEVEMENTS:
${String(keyAchievements).trim() || "(empty)"}

CURRENT ATS KEYWORDS:
${Array.isArray(mustHaveKeywords) ? (mustHaveKeywords as string[]).join(", ") : ""}

INSTRUCTIONS:
1. Rewrite the professional summary: 2-3 sentences, strong opening, mentions seniority + industry + value delivered. Max 60 words.
2. Rewrite key achievements: 3-5 bullet points starting with strong action verbs and metrics where possible. Use the existing content as a base — do not invent facts.
3. Suggest 6-8 high-value ATS keywords not already in the list that match the target roles and industry.

Respond ONLY with valid JSON:
{
  "summary": "<improved summary>",
  "keyAchievements": "<improved achievements with bullet points using • character>",
  "suggestedKeywords": ["keyword1", "keyword2", ...]
}`;

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are a professional resume writer. Always respond with valid JSON only." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
        max_tokens: 700,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => "");
      console.error("[resume/improve] OpenAI error:", aiRes.status, errText);
      res.status(502).json({ message: `OpenAI returned an error: ${aiRes.status}. ${errText.slice(0, 120)}` });
      return;
    }

    const aiData = await aiRes.json() as { choices?: { message?: { content?: string } }[] };
    const content = aiData.choices?.[0]?.message?.content ?? "";

    let parsed: { summary?: string; keyAchievements?: string; suggestedKeywords?: string[] };
    try {
      parsed = JSON.parse(content) as typeof parsed;
    } catch {
      res.status(502).json({ message: "AI returned an unexpected response. Please try again." });
      return;
    }

    res.json({
      summary:           typeof parsed.summary === "string"          ? parsed.summary.trim()           : null,
      keyAchievements:   typeof parsed.keyAchievements === "string"   ? parsed.keyAchievements.trim()   : null,
      suggestedKeywords: Array.isArray(parsed.suggestedKeywords)      ? parsed.suggestedKeywords        : [],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[resume/improve]", msg);
    res.status(500).json({ message: `Failed to improve resume: ${msg}` });
  }
});

export default router;
