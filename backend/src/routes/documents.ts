import { Router, Request, Response } from "express";
import { query, queryOne } from "../db/pool";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// ── GET /api/documents ────────────────────────────────────────────────────────

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const kind = req.query.kind as string | undefined;

  try {
    const rows = await query<Record<string, unknown>>(
      `SELECT
         d.id, d.kind, d.resume_type, d.title, d.origin,
         d.latest_version_no, d.created_at, d.updated_at,
         j.title AS job_title, c.display_name AS company
       FROM documents d
       LEFT JOIN jobs j ON j.id = d.job_id
       LEFT JOIN companies c ON c.id = j.company_id
       WHERE d.user_id = $1
         ${kind ? "AND d.kind = $2" : ""}
       ORDER BY d.updated_at DESC`,
      kind ? [req.userId, kind] : [req.userId]
    );

    res.json(
      rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        resumeType: r.resume_type,
        title: r.title,
        origin: r.origin,
        version: r.latest_version_no,
        jobTitle: r.job_title,
        company: r.company,
        lastModified: String(r.updated_at).slice(0, 10),
        tags: buildTags(r),
      }))
    );
  } catch (err) {
    console.error("[documents/list]", err);
    res.status(500).json({ message: "Failed to fetch documents." });
  }
});

// ── GET /api/documents/:id ────────────────────────────────────────────────────

router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const doc = await queryOne<Record<string, unknown>>(
      `SELECT d.*, j.title AS job_title, c.display_name AS company
       FROM documents d
       LEFT JOIN jobs j ON j.id = d.job_id
       LEFT JOIN companies c ON c.id = j.company_id
       WHERE d.id = $1 AND d.user_id = $2`,
      [req.params.id, req.userId]
    );

    if (!doc) {
      res.status(404).json({ message: "Document not found." });
      return;
    }

    const versions = await query<Record<string, unknown>>(
      `SELECT version_no, change_summary, created_at
       FROM document_versions WHERE document_id = $1 ORDER BY version_no DESC`,
      [req.params.id]
    );

    res.json({ ...doc, versions });
  } catch (err) {
    console.error("[documents/get]", err);
    res.status(500).json({ message: "Failed to fetch document." });
  }
});

// ── GET /api/documents/:id/download ──────────────────────────────────────────

router.get("/:id/download", async (req: Request, res: Response): Promise<void> => {
  try {
    const doc = await queryOne<{ content_text: string | null; title: string }>(
      `SELECT content_text, title FROM documents WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    );

    if (!doc) {
      res.status(404).json({ message: "Document not found." });
      return;
    }

    // In production: serve the actual file from S3/object storage.
    // For now: return content as plain text.
    res.setHeader("Content-Type", "text/plain");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${doc.title.replace(/[^a-z0-9]/gi, "_")}.txt"`
    );
    res.send(doc.content_text ?? "Document content not available.");
  } catch (err) {
    console.error("[documents/download]", err);
    res.status(500).json({ message: "Failed to download document." });
  }
});

function buildTags(r: Record<string, unknown>): string[] {
  const tags: string[] = [];
  if (r.resume_type === "master") tags.push("Master");
  if (r.resume_type === "tailored") tags.push("AI Generated");
  if (r.origin === "ai_generated") tags.push("Optimized");
  if (r.origin === "uploaded") tags.push("Uploaded");
  return tags;
}

export default router;
