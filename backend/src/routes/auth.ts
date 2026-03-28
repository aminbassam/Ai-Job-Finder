import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { z } from "zod";
import { query, queryOne, transaction } from "../db/pool";
import { validate } from "../middleware/validate";
import { requireAuth, hashToken } from "../middleware/auth";

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

async function buildUserResponse(userId: string) {
  const user = await queryOne<{
    id: string; email: string; first_name: string; last_name: string;
    location_text: string | null;
  }>(
    `SELECT id, email, first_name, last_name, location_text FROM account_users WHERE id = $1`,
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
    firstName: user.first_name,
    lastName: user.last_name,
    location: user.location_text ?? undefined,
    plan: (sub?.plan_code ?? "free") as "free" | "pro" | "agency",
    aiCredits,
    totalCredits,
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
  email:    z.string().email().toLowerCase(),
  password: z.string().min(1),
});

router.post("/login", validate(loginSchema), async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as z.infer<typeof loginSchema>;

  const user = await queryOne<{ id: string; password_hash: string | null; is_active: boolean }>(
    `SELECT id, password_hash, is_active FROM account_users WHERE email = $1`,
    [email]
  );

  // Constant-time comparison even when user doesn't exist
  const dummyHash = "$2b$12$invalidhash.for.timing.safety.padding.......";
  const hashToCheck = user?.password_hash ?? dummyHash;
  const match = await bcrypt.compare(password, hashToCheck);

  if (!user || !match || !user.is_active) {
    res.status(401).json({ message: "Invalid email or password." });
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

    // TODO: send email with reset link containing rawToken
    // e.g. sendResetEmail(email, rawToken);
    console.log(`[auth] Password reset token for ${email}: ${rawToken}`);
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
