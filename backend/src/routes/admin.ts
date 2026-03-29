import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, queryOne, transaction } from "../db/pool";
import { requireAdmin } from "../middleware/adminAuth";
import { validate } from "../middleware/validate";

const router = Router();
router.use(requireAdmin);

// ── GET /api/admin/stats ─────────────────────────────────────────────────────

router.get("/stats", async (_req: Request, res: Response): Promise<void> => {
  const [totals, byPlan] = await Promise.all([
    queryOne<{ total: string; active: string; verified: string; admins: string }>(
      `SELECT
         COUNT(*)::text                                          AS total,
         COUNT(*) FILTER (WHERE is_active)::text                AS active,
         COUNT(*) FILTER (WHERE email_verified_at IS NOT NULL)::text AS verified,
         COUNT(*) FILTER (WHERE is_admin)::text                 AS admins
       FROM account_users`
    ),
    query<{ plan_code: string; count: string }>(
      `SELECT us.plan_code, COUNT(*)::text AS count
       FROM user_subscriptions us
       WHERE us.status = 'active'
       GROUP BY us.plan_code`
    ),
  ]);

  const planCounts: Record<string, number> = { free: 0, pro: 0, agency: 0 };
  for (const r of byPlan) planCounts[r.plan_code] = parseInt(r.count, 10);

  res.json({
    total:    parseInt(totals?.total    ?? "0", 10),
    active:   parseInt(totals?.active   ?? "0", 10),
    verified: parseInt(totals?.verified ?? "0", 10),
    admins:   parseInt(totals?.admins   ?? "0", 10),
    byPlan:   planCounts,
  });
});

// ── GET /api/admin/users ─────────────────────────────────────────────────────

router.get("/users", async (req: Request, res: Response): Promise<void> => {
  const page   = Math.max(1, parseInt(req.query.page   as string ?? "1",  10));
  const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit as string ?? "20", 10)));
  const offset = (page - 1) * limit;
  const search = (req.query.search as string ?? "").trim();
  const plan   = req.query.plan   as string | undefined;
  const status = req.query.status as string | undefined;
  const verified = req.query.verified as string | undefined;

  const conditions: string[] = [];
  const params: unknown[]    = [];
  let p = 1;

  if (search) {
    conditions.push(`(u.email ILIKE $${p} OR u.first_name ILIKE $${p} OR u.last_name ILIKE $${p})`);
    params.push(`%${search}%`); p++;
  }
  if (plan)   { conditions.push(`us.plan_code = $${p}`);          params.push(plan); p++; }
  if (status === "active")   conditions.push("u.is_active = true");
  if (status === "inactive") conditions.push("u.is_active = false");
  if (verified === "yes")    conditions.push("u.email_verified_at IS NOT NULL");
  if (verified === "no")     conditions.push("u.email_verified_at IS NULL");

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRow = await queryOne<{ total: string }>(
    `SELECT COUNT(DISTINCT u.id)::text AS total
     FROM account_users u
     LEFT JOIN user_subscriptions us ON us.user_id = u.id AND us.status = 'active'
     ${where}`,
    params
  );
  const total = parseInt(countRow?.total ?? "0", 10);

  const users = await query<{
    id: string; email: string; first_name: string; last_name: string;
    is_active: boolean; is_admin: boolean;
    email_verified_at: string | null; last_login_at: string | null;
    created_at: string; location_text: string | null;
    plan_code: string | null; ai_credits: string;
  }>(
    `SELECT
       u.id, u.email, u.first_name, u.last_name, u.is_active, u.is_admin,
       u.email_verified_at, u.last_login_at, u.created_at, u.location_text,
       us.plan_code,
       COALESCE(SUM(ucl.delta), 0)::text AS ai_credits
     FROM account_users u
     LEFT JOIN user_subscriptions us ON us.user_id = u.id AND us.status = 'active'
     LEFT JOIN user_credit_ledger ucl ON ucl.user_id = u.id
     ${where}
     GROUP BY u.id, us.plan_code
     ORDER BY u.created_at DESC
     LIMIT $${p} OFFSET $${p + 1}`,
    [...params, limit, offset]
  );

  res.json({
    users: users.map((u) => ({
      id:          u.id,
      email:       u.email,
      firstName:   u.first_name,
      lastName:    u.last_name,
      isActive:    u.is_active,
      isAdmin:     u.is_admin,
      emailVerified: u.email_verified_at !== null,
      lastLogin:   u.last_login_at,
      createdAt:   u.created_at,
      location:    u.location_text,
      plan:        u.plan_code ?? "free",
      aiCredits:   parseInt(u.ai_credits, 10),
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// ── GET /api/admin/users/:id ─────────────────────────────────────────────────

router.get("/users/:id", async (req: Request, res: Response): Promise<void> => {
  const user = await queryOne<{
    id: string; email: string; first_name: string; last_name: string;
    is_active: boolean; is_admin: boolean; location_text: string | null;
    current_job_title: string | null; linkedin_url: string | null;
    email_verified_at: string | null; last_login_at: string | null; created_at: string;
  }>(
    `SELECT id, email, first_name, last_name, is_active, is_admin,
            location_text, current_job_title, linkedin_url,
            email_verified_at, last_login_at, created_at
     FROM account_users WHERE id = $1`,
    [req.params.id]
  );

  if (!user) { res.status(404).json({ message: "User not found." }); return; }

  const sub = await queryOne<{ plan_code: string }>(
    `SELECT plan_code FROM user_subscriptions WHERE user_id = $1 AND status = 'active' LIMIT 1`,
    [req.params.id]
  );

  res.json({
    id: user.id, email: user.email,
    firstName: user.first_name, lastName: user.last_name,
    isActive: user.is_active, isAdmin: user.is_admin,
    location: user.location_text, jobTitle: user.current_job_title,
    linkedinUrl: user.linkedin_url, emailVerified: user.email_verified_at !== null,
    lastLogin: user.last_login_at, createdAt: user.created_at,
    plan: sub?.plan_code ?? "free",
  });
});

// ── GET /api/admin/logs ──────────────────────────────────────────────────────

router.get("/logs", async (req: Request, res: Response): Promise<void> => {
  const limit = Math.min(200, Math.max(20, parseInt(req.query.limit as string ?? "100", 10)));
  const category = (req.query.category as string | undefined)?.trim().toLowerCase();
  const level = (req.query.level as string | undefined)?.trim().toLowerCase();

  try {
    const [runs, connectors, activities] = await Promise.all([
      query<{
        id: string;
        status: "running" | "completed" | "failed";
        trigger: "manual" | "schedule";
        jobs_found: number | null;
        jobs_new: number | null;
        jobs_scored: number | null;
        strong_matches: number | null;
        error: string | null;
        started_at: string;
        completed_at: string | null;
        profile_name: string | null;
        user_id: string;
        user_email: string;
        user_name: string | null;
      }>(
        `SELECT
           ar.id,
           ar.status,
           ar.trigger,
           ar.jobs_found,
           ar.jobs_new,
           ar.jobs_scored,
           ar.strong_matches,
           ar.error,
           ar.started_at,
           ar.completed_at,
           sp.name AS profile_name,
           u.id AS user_id,
           u.email AS user_email,
           NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS user_name
         FROM agent_runs ar
         JOIN account_users u ON u.id = ar.user_id
         LEFT JOIN search_profiles sp ON sp.id = ar.profile_id
         ORDER BY COALESCE(ar.completed_at, ar.started_at) DESC
         LIMIT $1`,
        [Math.max(limit, 120)]
      ),
      query<{
        id: string;
        connector: string;
        is_active: boolean;
        last_sync_at: string | null;
        last_error: string | null;
        job_count: number | null;
        updated_at: string;
        user_id: string;
        user_email: string;
        user_name: string | null;
      }>(
        `SELECT
           cc.id,
           cc.connector,
           cc.is_active,
           cc.last_sync_at,
           cc.last_error,
           cc.job_count,
           cc.updated_at,
           u.id AS user_id,
           u.email AS user_email,
           NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS user_name
         FROM connector_configs cc
         JOIN account_users u ON u.id = cc.user_id
         WHERE cc.is_active = true
            OR cc.last_error IS NOT NULL
            OR cc.last_sync_at IS NOT NULL
         ORDER BY GREATEST(cc.updated_at, COALESCE(cc.last_sync_at, cc.updated_at)) DESC
         LIMIT $1`,
        [Math.max(limit, 120)]
      ),
      query<{
        id: string;
        type: string;
        title: string;
        description: string | null;
        created_at: string;
        user_id: string;
        user_email: string;
        user_name: string | null;
      }>(
        `SELECT
           ae.id,
           ae.type,
           ae.title,
           ae.description,
           ae.created_at,
           u.id AS user_id,
           u.email AS user_email,
           NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS user_name
         FROM activity_events ae
         JOIN account_users u ON u.id = ae.user_id
         ORDER BY ae.created_at DESC
         LIMIT $1`,
        [Math.max(limit, 120)]
      ),
    ]);

    const logs = [
      ...runs.map((run) => ({
        id: `run_${run.id}`,
        category: "job_agent",
        level: run.status === "failed" ? "error" : run.status === "running" ? "warning" : "info",
        status: run.status,
        eventAt: run.completed_at ?? run.started_at,
        userId: run.user_id,
        userEmail: run.user_email,
        userName: run.user_name,
        source: run.profile_name ?? "Unassigned profile",
        message:
          run.status === "failed"
            ? run.error ?? "Job agent run failed."
            : run.status === "running"
            ? `Job agent run is in progress for ${run.profile_name ?? "an ad hoc profile"}.`
            : `Completed ${run.trigger} run for ${run.profile_name ?? "an ad hoc profile"}.`,
        details: {
          trigger: run.trigger,
          jobsFound: run.jobs_found ?? 0,
          jobsNew: run.jobs_new ?? 0,
          jobsScored: run.jobs_scored ?? 0,
          strongMatches: run.strong_matches ?? 0,
        },
      })),
      ...connectors.map((connectorRow) => ({
        id: `connector_${connectorRow.id}`,
        category: "connector",
        level: connectorRow.last_error ? "error" : connectorRow.is_active ? "info" : "warning",
        status: connectorRow.last_error ? "error" : connectorRow.is_active ? "active" : "inactive",
        eventAt: connectorRow.last_sync_at ?? connectorRow.updated_at,
        userId: connectorRow.user_id,
        userEmail: connectorRow.user_email,
        userName: connectorRow.user_name,
        source: connectorRow.connector,
        message: connectorRow.last_error
          ? connectorRow.last_error
          : `${connectorRow.connector} connector is active and ready for the job agent.`,
        details: {
          active: connectorRow.is_active,
          jobCount: connectorRow.job_count ?? 0,
          lastSyncAt: connectorRow.last_sync_at,
        },
      })),
      ...activities.map((activity) => ({
        id: `activity_${activity.id}`,
        category: "activity",
        level: "info",
        status: activity.type,
        eventAt: activity.created_at,
        userId: activity.user_id,
        userEmail: activity.user_email,
        userName: activity.user_name,
        source: activity.title,
        message: activity.description ?? activity.title,
        details: {
          type: activity.type,
        },
      })),
    ]
      .filter((entry) => !category || category === "all" || entry.category === category)
      .filter((entry) => !level || level === "all" || entry.level === level)
      .sort((a, b) => new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime());

    const agentRuns24h = runs.filter((run) =>
      new Date(run.started_at).getTime() >= Date.now() - 24 * 60 * 60 * 1000
    );

    res.json({
      summary: {
        total: logs.length,
        errors: logs.filter((entry) => entry.level === "error").length,
        warnings: logs.filter((entry) => entry.level === "warning").length,
        info: logs.filter((entry) => entry.level === "info").length,
        activeConnectors: connectors.filter((connectorRow) => connectorRow.is_active).length,
        failedRuns24h: agentRuns24h.filter((run) => run.status === "failed").length,
        completedRuns24h: agentRuns24h.filter((run) => run.status === "completed").length,
      },
      logs: logs.slice(0, limit),
    });
  } catch (err) {
    console.error("[admin/logs]", err);
    res.status(500).json({ message: "Failed to load platform logs." });
  }
});

// ── PATCH /api/admin/users/:id ───────────────────────────────────────────────

const editUserSchema = z.object({
  firstName: z.string().min(1).max(100).trim().optional(),
  lastName:  z.string().min(1).max(100).trim().optional(),
  email:     z.string().email().toLowerCase().optional(),
  location:  z.string().max(200).trim().optional(),
  isAdmin:   z.boolean().optional(),
  plan:      z.enum(["free", "pro", "agency"]).optional(),
});

router.patch("/users/:id", validate(editUserSchema), async (req: Request, res: Response): Promise<void> => {
  const { firstName, lastName, email, location, isAdmin, plan } = req.body as z.infer<typeof editUserSchema>;
  const targetId = req.params.id;

  // Prevent revoking your own admin flag
  if (targetId === req.userId && isAdmin === false) {
    res.status(400).json({ message: "You cannot remove your own admin privileges." });
    return;
  }

  const updates: string[] = [];
  const params: unknown[] = [];
  let p = 1;

  if (firstName !== undefined) { updates.push(`first_name = $${p++}`); params.push(firstName); }
  if (lastName  !== undefined) { updates.push(`last_name  = $${p++}`); params.push(lastName); }
  if (email     !== undefined) { updates.push(`email      = $${p++}`); params.push(email); }
  if (location  !== undefined) { updates.push(`location_text = $${p++}`); params.push(location); }
  if (isAdmin   !== undefined) { updates.push(`is_admin   = $${p++}`); params.push(isAdmin); }

  if (updates.length > 0) {
    params.push(targetId);
    await query(
      `UPDATE account_users SET ${updates.join(", ")} WHERE id = $${p}`,
      params
    );
  }

  if (plan !== undefined) {
    await query(
      `UPDATE user_subscriptions SET status = 'cancelled' WHERE user_id = $1 AND status = 'active'`,
      [targetId]
    );
    await query(
      `INSERT INTO user_subscriptions (user_id, plan_code, status) VALUES ($1, $2, 'active')`,
      [targetId, plan]
    );
  }

  res.json({ message: "User updated." });
});

// ── PATCH /api/admin/users/:id/status ───────────────────────────────────────

router.patch("/users/:id/status", async (req: Request, res: Response): Promise<void> => {
  if (req.params.id === req.userId) {
    res.status(400).json({ message: "You cannot deactivate your own account." });
    return;
  }

  const user = await queryOne<{ is_active: boolean }>(
    `SELECT is_active FROM account_users WHERE id = $1`, [req.params.id]
  );
  if (!user) { res.status(404).json({ message: "User not found." }); return; }

  const newStatus = !user.is_active;

  await transaction(async (q) => {
    await q(`UPDATE account_users SET is_active = $1 WHERE id = $2`, [newStatus, req.params.id]);
    // Revoke all sessions when deactivating
    if (!newStatus) {
      await q(
        `UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
        [req.params.id]
      );
    }
  });

  res.json({ isActive: newStatus, message: `User ${newStatus ? "activated" : "deactivated"}.` });
});

// ── DELETE /api/admin/users/:id ──────────────────────────────────────────────

router.delete("/users/:id", async (req: Request, res: Response): Promise<void> => {
  if (req.params.id === req.userId) {
    res.status(400).json({ message: "You cannot delete your own account." });
    return;
  }

  const user = await queryOne<{ id: string }>(
    `SELECT id FROM account_users WHERE id = $1`, [req.params.id]
  );
  if (!user) { res.status(404).json({ message: "User not found." }); return; }

  // Cascade handled by DB foreign keys (ON DELETE CASCADE)
  await query(`DELETE FROM account_users WHERE id = $1`, [req.params.id]);

  res.json({ message: "User deleted." });
});

export default router;
