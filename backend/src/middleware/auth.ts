import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { queryOne } from "../db/pool";

export interface AuthPayload {
  sub: string; // user id
  iat: number;
  exp: number;
}

// Extend Express Request with the authenticated user id
declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

/** Hash a raw JWT string with SHA-256 (used to look up sessions in the DB). */
export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * requireAuth middleware
 *
 * Verifies the Bearer JWT, then checks that a matching non-revoked,
 * non-expired session row exists in user_sessions.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Authentication required." });
    return;
  }

  const token = header.slice(7);

  let payload: AuthPayload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload;
  } catch {
    res.status(401).json({ message: "Invalid or expired token." });
    return;
  }

  const tokenHash = hashToken(token);

  const session = await queryOne(
    `SELECT id FROM user_sessions
     WHERE token_hash = $1
       AND user_id    = $2
       AND expires_at > NOW()
       AND revoked_at IS NULL`,
    [tokenHash, payload.sub]
  ).catch(() => null);

  if (!session) {
    res.status(401).json({ message: "Session not found or expired." });
    return;
  }

  req.userId = payload.sub;
  next();
}
