import { Request, Response, NextFunction } from "express";
import { queryOne } from "../db/pool";
import { requireAuth } from "./auth";

/**
 * requireAdmin — chains requireAuth then checks is_admin flag.
 * Responds 403 if the authenticated user is not an admin.
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  requireAuth(req, res, async () => {
    try {
      const user = await queryOne<{ is_admin: boolean }>(
        `SELECT is_admin FROM account_users WHERE id = $1 AND is_active = true`,
        [req.userId]
      );

      if (!user?.is_admin) {
        res.status(403).json({ message: "Admin access required." });
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  });
}
