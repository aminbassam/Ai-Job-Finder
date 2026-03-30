import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { z } from "zod";
import { query, queryOne, transaction } from "../db/pool";
import { validate } from "../middleware/validate";
import { requireAuth, hashToken } from "../middleware/auth";
import { sendVerificationEmail, sendPasswordResetEmail } from "../utils/email";

const router = Router();

const SESSION_TTL = parseInt(process.env.SESSION_TTL_SECONDS ?? "604800", 10);

// ── Helpers ──────────────────────────────────────────────────────────────────

function signJwt(userId: string): string {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET!, {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? "7d") as jwt.SignOptions["expiresIn"],
  });
}

async function createSession(
  userId: string,
  req: Request
): Promise<string> {
  const token = signJwt(userId);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL * 1000).toISOString();

  await query(
    `INSERT INTO user_sessions (user_id, token_hash, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4::inet, $5)`,
    [
      userId,
      tokenHash,
      req.headers["user-agent"] ?? null,
      req.ip ?? null,
      expiresAt,
    ]
  );

  return token;
}

// ── OTP helpers ──────────────────────────────────────────────────────────────

function generateOtp(): string {
  // Cryptographically random 6-digit code
  return (crypto.randomInt(100000, 999999)).toString();
}

async function createVerificationToken(userId: string): Promise<string> {
  const code = generateOtp();
  const codeHash = crypto.createHash("sha256").update(code).digest("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min

  // Invalidate any existing pending tokens first
  await query(
    `UPDATE email_verification_tokens SET used_at = NOW()
     WHERE user_id = $1 AND used_at IS NULL`,
    [userId]
  );

  await query(
    `INSERT INTO email_verification_tokens (user_id, code_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, codeHash, expiresAt]
  );

  return code;
}

async function buildUserResponse(userId: string) {
  const user = await queryOne<{
    id: string; email: string; username: string | null; first_name: string; last_name: string;
    location_text: string | null; email_verified_at: string | null; is_admin: boolean;
  }>(
    `SELECT id, email, username, first_name, last_name, location_text, email_verified_at, is_admin
     FROM account_users WHERE id = $1`,
    [userId]
  );
  if (!user) throw new Error("User not found");

  const sub = await queryOne<{ plan_code: string; monthly_ai_credits: number }>(
    `SELECT us.plan_code, sp.monthly_ai_credits
     FROM user_subscriptions us
     JOIN subscription_plans sp ON sp.code = us.plan_code
     WHERE us.user_id = $1 AND us.status = 'active'
     ORDER BY us.created_at DESC LIMIT 1`,
    [userId]
  );

  // Calculate credits remaining from ledger
  const ledger = await queryOne<{ total: string }>(
    `SELECT COALESCE(SUM(delta), 0)::text AS total FROM user_credit_ledger WHERE user_id = $1`,
    [userId]
  );
  const creditsUsed = Math.abs(parseInt(ledger?.total ?? "0", 10));
  const totalCredits = sub?.monthly_ai_credits ?? 100;
  const aiCredits = Math.max(0, totalCredits - creditsUsed);

  return {
    id: user.id,
    email: user.email,
    username: user.username ?? undefined,
    firstName: user.first_name,
    lastName: user.last_name,
    location: user.location_text ?? undefined,
    plan: (sub?.plan_code ?? "free") as "free" | "pro" | "agency",
    aiCredits,
    totalCredits,
    emailVerified: user.email_verified_at !== null,
    isAdmin: user.is_admin,
  };
}

// ── POST /api/auth/signup ────────────────────────────────────────────────────

const signupSchema = z.object({
  firstName: z.string().min(2).max(100).trim(),
  lastName:  z.string().min(2).max(100).trim(),
  email:     z.string().email().toLowerCase(),
  password:  z.string().min(8).max(128),
});

router.post("/signup", validate(signupSchema), async (req: Request, res: Response): Promise<void> => {
  const { firstName, lastName, email, password } = req.body as z.infer<typeof signupSchema>;

  const existing = await queryOne(
    `SELECT id FROM account_users WHERE email = $1`, [email]
  );
  if (existing) {
    res.status(409).json({ message: "An account with that email already exists." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const userId = await transaction(async (q) => {
      const rows = await q(
        `INSERT INTO account_users (email, password_hash, first_name, last_name)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [email, passwordHash, firstName, lastName]
      ) as Array<{ id: string }>;
      const userId = rows[0].id;

      await q(`INSERT INTO user_profiles (user_id) VALUES ($1)`, [userId]);
      await q(`INSERT INTO user_preferences (user_id) VALUES ($1)`, [userId]);
      await q(
        `INSERT INTO user_subscriptions (user_id, plan_code, status)
         VALUES ($1, 'free', 'active')`,
        [userId]
      );
      // Grant initial free credits
      await q(
        `INSERT INTO user_credit_ledger (user_id, delta, reason)
         VALUES ($1, 100, 'signup_bonus')`,
        [userId]
      );

      return userId;
    });

    // Generate OTP and send verification email
    const code = await createVerificationToken(userId);
    await sendVerificationEmail(email, code).catch((err) => {
      console.error("[auth/signup] Failed to send verification email:", err);
    });

    // Create session — user is authenticated but emailVerified = false until they verify
    const token = await createSession(userId, req);
    const user = await buildUserResponse(userId);

    res.status(201).json({ token, user });
  } catch (err) {
    console.error("[auth/signup]", err);
    res.status(500).json({ message: "Failed to create account. Please try again." });
  }
});

// ── POST /api/auth/login ─────────────────────────────────────────────────────

const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(320).optional(),
  email: z.string().trim().min(1).max(320).optional(),
  password: z.string().min(1),
}).superRefine((value, ctx) => {
  if (!(value.identifier ?? value.email)?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["identifier"],
      message: "Email or username is required.",
    });
  }
});

router.post("/login", validate(loginSchema), async (req: Request, res: Response): Promise<void> => {
  const { password } = req.body as z.infer<typeof loginSchema>;
  const identifier = (req.body.identifier ?? req.body.email ?? "").trim().toLowerCase();

  const user = await queryOne<{ id: string; password_hash: string | null; is_active: boolean }>(
    `SELECT id, password_hash, is_active
     FROM account_users
     WHERE email = $1 OR username = $1`,
    [identifier]
  );

  // Constant-time comparison even when user doesn't exist
  const dummyHash = "$2b$12$invalidhash.for.timing.safety.padding.......";
  const hashToCheck = user?.password_hash ?? dummyHash;
  const match = await bcrypt.compare(password, hashToCheck);

  if (!user || !match || !user.is_active) {
    res.status(401).json({ message: "Invalid email, username, or password." });
    return;
  }

  try {
    const token = await createSession(user.id, req);

    // Update last login timestamp
    await query(`UPDATE account_users SET last_login_at = NOW() WHERE id = $1`, [user.id]);

    const userResponse = await buildUserResponse(user.id);
    res.json({ token, user: userResponse });
  } catch (err) {
    console.error("[auth/login]", err);
    res.status(500).json({ message: "Login failed. Please try again." });
  }
});

// ── PATCH /api/auth/change-password ─────────────────────────────────────────

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: z.string().min(8).max(128),
});

router.patch("/change-password", requireAuth, validate(changePasswordSchema), async (req: Request, res: Response): Promise<void> => {
  const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>;

  if (currentPassword === newPassword) {
    res.status(400).json({ message: "New password must be different from your current password." });
    return;
  }

  const user = await queryOne<{ password_hash: string | null }>(
    `SELECT password_hash FROM account_users WHERE id = $1 AND is_active = true`,
    [req.userId]
  );

  if (!user?.password_hash) {
    res.status(400).json({ message: "Password changes are unavailable for this account." });
    return;
  }

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) {
    res.status(400).json({ message: "Current password is incorrect." });
    return;
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 12);
  const header = req.headers.authorization ?? "";
  const rawToken = header.startsWith("Bearer ") ? header.slice(7) : "";
  const currentTokenHash = rawToken ? hashToken(rawToken) : null;

  try {
    await transaction(async (q) => {
      await q(
        `UPDATE account_users
         SET password_hash = $1, updated_at = NOW()
         WHERE id = $2`,
        [newPasswordHash, req.userId]
      );

      if (currentTokenHash) {
        await q(
          `UPDATE user_sessions
           SET revoked_at = NOW()
           WHERE user_id = $1
             AND revoked_at IS NULL
             AND token_hash <> $2`,
          [req.userId, currentTokenHash]
        );
      } else {
        await q(
          `UPDATE user_sessions
           SET revoked_at = NOW()
           WHERE user_id = $1
             AND revoked_at IS NULL`,
          [req.userId]
        );
      }
    });

    res.json({ message: "Password updated successfully." });
  } catch (err) {
    console.error("[auth/change-password]", err);
    res.status(500).json({ message: "Failed to update password." });
  }
});

// ── POST /api/auth/logout ────────────────────────────────────────────────────

router.post("/logout", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const header = req.headers.authorization ?? "";
  const raw = header.startsWith("Bearer ") ? header.slice(7) : "";
  const tokenHash = hashToken(raw);

  await query(
    `UPDATE user_sessions SET revoked_at = NOW() WHERE token_hash = $1`,
    [tokenHash]
  ).catch(() => {});

  res.json({ message: "Logged out successfully." });
});

// ── POST /api/auth/forgot-password ──────────────────────────────────────────

const forgotSchema = z.object({
  email: z.string().email().toLowerCase(),
});

router.post("/forgot-password", validate(forgotSchema), async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body as z.infer<typeof forgotSchema>;

  // Always return 200 — never reveal whether an account exists
  const user = await queryOne<{ id: string }>(
    `SELECT id FROM account_users WHERE email = $1 AND is_active = true`,
    [email]
  );

  if (user) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    await query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    ).catch(() => {});

    await sendPasswordResetEmail(email, rawToken).catch((err) => {
      console.error("[auth/forgot-password] Email send failed:", err);
    });
  }

  res.json({ message: "If that email is registered, a reset link has been sent." });
});

// ── POST /api/auth/reset-password ───────────────────────────────────────────

const resetSchema = z.object({
  token:    z.string().min(1),
  password: z.string().min(8).max(128),
});

router.post("/reset-password", validate(resetSchema), async (req: Request, res: Response): Promise<void> => {
  const { token, password } = req.body as z.infer<typeof resetSchema>;

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const record = await queryOne<{ id: string; user_id: string; used_at: string | null }>(
    `SELECT id, user_id, used_at FROM password_reset_tokens
     WHERE token_hash = $1 AND expires_at > NOW()`,
    [tokenHash]
  );

  if (!record || record.used_at) {
    res.status(400).json({ message: "Reset link is invalid or has expired." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await transaction(async (q) => {
    await q(`UPDATE account_users SET password_hash = $1 WHERE id = $2`, [passwordHash, record.user_id]);
    await q(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, [record.id]);
    // Revoke all active sessions for security
    await q(`UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [record.user_id]);
  });

  res.json({ message: "Password has been reset. Please sign in with your new password." });
});

// ── POST /api/auth/send-verification ─────────────────────────────────────────

router.post("/send-verification", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId;

  const user = await queryOne<{ email: string; email_verified_at: string | null }>(
    `SELECT email, email_verified_at FROM account_users WHERE id = $1`,
    [userId]
  );

  if (!user) {
    res.status(404).json({ message: "User not found." });
    return;
  }

  if (user.email_verified_at) {
    res.json({ message: "Email is already verified." });
    return;
  }

  const code = await createVerificationToken(userId);
  await sendVerificationEmail(user.email, code).catch((err) => {
    console.error("[auth/send-verification] Email send failed:", err);
  });

  res.json({ message: "Verification email sent." });
});

// ── POST /api/auth/verify-email ───────────────────────────────────────────────

const verifyEmailSchema = z.object({
  code: z.string().length(6).regex(/^\d{6}$/, "Code must be 6 digits"),
});

router.post("/verify-email", requireAuth, validate(verifyEmailSchema), async (req: Request, res: Response): Promise<void> => {
  const { code } = req.body as z.infer<typeof verifyEmailSchema>;
  const userId = req.userId;

  // Find the most recent active token for this user
  const record = await queryOne<{ id: string; code_hash: string; attempts: number }>(
    `SELECT id, code_hash, attempts
     FROM email_verification_tokens
     WHERE user_id = $1 AND expires_at > NOW() AND used_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );

  if (!record) {
    res.status(400).json({ message: "No active verification code. Please request a new one." });
    return;
  }

  if (record.attempts >= 5) {
    res.status(429).json({ message: "Too many failed attempts. Please request a new code." });
    return;
  }

  const codeHash = crypto.createHash("sha256").update(code).digest("hex");

  if (codeHash !== record.code_hash) {
    await query(
      `UPDATE email_verification_tokens SET attempts = attempts + 1 WHERE id = $1`,
      [record.id]
    );
    const remaining = 4 - record.attempts;
    res.status(400).json({
      message: `Incorrect code. ${remaining > 0 ? `${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` : "Please request a new code."}`,
    });
    return;
  }

  // Code is valid — mark used and verify the account
  await transaction(async (q) => {
    await q(`UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1`, [record.id]);
    await q(`UPDATE account_users SET email_verified_at = NOW() WHERE id = $1`, [userId]);
  });

  const user = await buildUserResponse(userId);
  res.json({ user });
});

// ── GET /api/auth/me ─────────────────────────────────────────────────────────

router.get("/me", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await buildUserResponse(req.userId);
    res.json({ user });
  } catch {
    res.status(404).json({ message: "User not found." });
  }
});

export default router;
