import { Router, Request, Response } from "express";
import { query } from "../db/pool";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// ── GET /api/activity ────────────────────────────────────────────────────────

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const limit = Math.min(Number(req.query.limit ?? 20), 100);

  try {
    const rows = await query<Record<string, unknown>>(
      `SELECT id, type, title, description, created_at
       FROM activity_events
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [req.userId, limit]
    );

    const events = rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      description: r.description,
      timestamp: formatRelativeTime(r.created_at as string),
    }));

    res.json(events);
  } catch (err) {
    console.error("[activity/list]", err);
    res.status(500).json({ message: "Failed to fetch activity." });
  }
});

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

export default router;
