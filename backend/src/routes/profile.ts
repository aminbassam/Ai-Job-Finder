import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, queryOne } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";

const router = Router();
router.use(requireAuth);
const USERNAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{1,30}[A-Za-z0-9])?$/;

// ── GET /api/profile ─────────────────────────────────────────────────────────

router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await queryOne<{
      id: string;
      email: string;
      username: string | null;
      first_name: string;
      last_name: string;
      location_text: string | null;
      current_job_title: string | null;
      linkedin_url: string | null;
      professional_summary: string | null;
      years_experience: number | null;
      preferred_location_text: string | null;
      remote_only: boolean | null;
      min_salary_usd: number | null;
      max_salary_usd: number | null;
    }>(
      `SELECT
         u.id, u.email, u.username, u.first_name, u.last_name, u.location_text,
         u.current_job_title, u.linkedin_url,
         p.professional_summary, p.years_experience,
         p.preferred_location_text, p.remote_only,
         p.min_salary_usd, p.max_salary_usd
       FROM account_users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [req.userId]
    );

    if (!user) {
      res.status(404).json({ message: "Profile not found." });
      return;
    }

    const skills = await query<{ skill_name: string }>(
      `SELECT skill_name FROM user_skills WHERE user_id = $1 ORDER BY skill_name`,
      [req.userId]
    );

    res.json({
      id:               user.id,
      email:            user.email,
      username:         user.username,
      firstName:        user.first_name,
      lastName:         user.last_name,
      location:         user.location_text,
      currentTitle:     user.current_job_title,
      linkedinUrl:      user.linkedin_url,
      summary:          user.professional_summary,
      yearsExperience:  user.years_experience ? Number(user.years_experience) : 0,
      preferredLocation: user.preferred_location_text,
      remoteOnly:       user.remote_only,
      minSalary:        user.min_salary_usd,
      maxSalary:        user.max_salary_usd,
      skills:           skills.map((s) => s.skill_name),
    });
  } catch (err) {
    console.error("[profile/get]", err);
    res.status(500).json({ message: "Failed to fetch profile." });
  }
});

// ── PUT /api/profile ─────────────────────────────────────────────────────────

const updateProfileSchema = z.object({
  username:        z.union([
    z.string()
      .trim()
      .min(3, "Username must be at least 3 characters.")
      .max(32, "Username must be 32 characters or less.")
      .regex(USERNAME_PATTERN, "Use 3-32 letters, numbers, dots, hyphens, or underscores."),
    z.literal(""),
    z.null(),
  ]).optional(),
  firstName:       z.string().min(1, "First name is required.").max(100).trim().optional(),
  lastName:        z.string().min(1, "Last name is required.").max(100).trim().optional(),
  location:        z.string().max(200).trim().optional().nullable(),
  currentTitle:    z.string().max(200).trim().optional().nullable(),
  linkedinUrl:     z.union([
    z.string().url("Must be a valid URL starting with https://"),
    z.literal(""),
    z.null(),
  ]).optional(),
  summary:         z.string().max(5000).optional().nullable(),
  yearsExperience: z.number().min(0).max(50).optional().nullable(),
  remoteOnly:      z.boolean().optional(),
  minSalary:       z.number().min(0).optional().nullable(),
  maxSalary:       z.number().min(0).optional().nullable(),
  skills:          z.array(z.string().max(100)).max(100).optional(),
});

router.put("/", validate(updateProfileSchema), async (req: Request, res: Response): Promise<void> => {
  const data = req.body as z.infer<typeof updateProfileSchema>;

  try {
    // Update account_users base fields when any are provided
    if (
      data.firstName     !== undefined ||
      data.lastName      !== undefined ||
      data.username      !== undefined ||
      data.location      !== undefined ||
      data.currentTitle  !== undefined ||
      data.linkedinUrl   !== undefined
    ) {
      const hasUsernameUpdate = data.username !== undefined;
      const normalizedUsername = data.username === undefined
        ? undefined
        : (typeof data.username === "string" && data.username.trim()
          ? data.username.trim().toLowerCase()
          : null);

      if (normalizedUsername) {
        const existing = await queryOne<{ id: string }>(
          `SELECT id FROM account_users WHERE username = $1 AND id <> $2`,
          [normalizedUsername, req.userId]
        );
        if (existing) {
          res.status(409).json({ message: "That username is already taken." });
          return;
        }
      }

      await query(
        `UPDATE account_users SET
           first_name        = CASE WHEN $2::text IS NOT NULL THEN $2 ELSE first_name END,
           last_name         = CASE WHEN $3::text IS NOT NULL THEN $3 ELSE last_name END,
           username          = CASE WHEN $4::boolean THEN $5::citext ELSE username END,
           location_text     = COALESCE($6, location_text),
           current_job_title = COALESCE($7, current_job_title),
           linkedin_url      = $8
         WHERE id = $1`,
        [
          req.userId,
          data.firstName  ?? null,
          data.lastName   ?? null,
          hasUsernameUpdate,
          normalizedUsername ?? null,
          data.location   ?? null,
          data.currentTitle !== undefined ? (data.currentTitle ?? null) : null,
          data.linkedinUrl !== undefined  ? (data.linkedinUrl  ?? null) : undefined,
        ]
      );
    }

    // Upsert profile record (summary, experience, etc.)
    if (
      data.summary         !== undefined ||
      data.yearsExperience !== undefined ||
      data.remoteOnly      !== undefined ||
      data.minSalary       !== undefined ||
      data.maxSalary       !== undefined
    ) {
      await query(
        `INSERT INTO user_profiles (user_id, professional_summary, years_experience, min_salary_usd, max_salary_usd)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET
           professional_summary = COALESCE($2, user_profiles.professional_summary),
           years_experience     = COALESCE($3, user_profiles.years_experience),
           remote_only          = COALESCE($6, user_profiles.remote_only),
           min_salary_usd       = COALESCE($4, user_profiles.min_salary_usd),
           max_salary_usd       = COALESCE($5, user_profiles.max_salary_usd),
           updated_at           = NOW()`,
        [
          req.userId,
          data.summary         ?? null,
          data.yearsExperience ?? null,
          data.minSalary       ?? null,
          data.maxSalary       ?? null,
          data.remoteOnly      ?? null,
        ]
      );
    }

    // Replace skills if provided
    if (data.skills !== undefined) {
      await query(`DELETE FROM user_skills WHERE user_id = $1`, [req.userId]);
      for (const skill of data.skills) {
        if (skill.trim()) {
          await query(
            `INSERT INTO user_skills (user_id, skill_name) VALUES ($1, $2)
             ON CONFLICT (user_id, skill_name) DO NOTHING`,
            [req.userId, skill.trim()]
          );
        }
      }
    }

    res.json({ message: "Profile updated." });
  } catch (err) {
    console.error("[profile/update]", err);
    res.status(500).json({ message: "Failed to update profile." });
  }
});

export default router;
