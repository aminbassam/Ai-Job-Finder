import { Router, Request, Response } from "express";
import { query, queryOne, transaction } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { generateSimplePdf } from "../services/pdf";

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
         COALESCE(j.title, jm.title, d.metadata->>'jobTitle') AS job_title,
         COALESCE(c.display_name, jm.company, d.metadata->>'company') AS company,
         COALESCE(j.location_text, jm.location, d.metadata->>'location') AS location
       FROM documents d
       LEFT JOIN job_matches jm
         ON jm.id = NULLIF(d.metadata->>'jobMatchId', '')::uuid
        AND jm.user_id = d.user_id
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
        location: r.location,
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
      `SELECT
         d.id, d.kind, d.resume_type, d.title, d.origin,
         d.latest_version_no, d.created_at, d.updated_at,
         d.content_text, d.content_html, d.metadata,
         COALESCE(j.title, jm.title, d.metadata->>'jobTitle') AS job_title,
         COALESCE(c.display_name, jm.company, d.metadata->>'company') AS company,
         COALESCE(j.location_text, jm.location, d.metadata->>'location') AS location
       FROM documents d
       LEFT JOIN job_matches jm
         ON jm.id = NULLIF(d.metadata->>'jobMatchId', '')::uuid
        AND jm.user_id = d.user_id
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

    res.json({
      id: doc.id,
      kind: doc.kind,
      resumeType: doc.resume_type,
      title: doc.title,
      origin: doc.origin,
      version: doc.latest_version_no,
      jobTitle: doc.job_title,
      company: doc.company,
      location: doc.location,
      lastModified: doc.updated_at,
      content_text: doc.content_text,
      content_html: doc.content_html,
      metadata: doc.metadata,
      versions,
    });
  } catch (err) {
    console.error("[documents/get]", err);
    res.status(500).json({ message: "Failed to fetch document." });
  }
});

// ── PUT /api/documents/:id ───────────────────────────────────────────────────

router.put("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const nextTitle = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const nextHtml = typeof req.body?.contentHtml === "string" ? req.body.contentHtml.trim() : "";
    const requestedSummary = typeof req.body?.changeSummary === "string" ? req.body.changeSummary.trim() : "";

    if (!nextHtml) {
      res.status(400).json({ message: "Document content is required." });
      return;
    }
    if (nextHtml.length > 200_000) {
      res.status(400).json({ message: "Document content is too large." });
      return;
    }

    const existing = await queryOne<{ id: string; kind: string; title: string; latest_version_no: number | null; resume_type: string | null }>(
      `SELECT id, kind, title, latest_version_no, resume_type
       FROM documents
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    );

    if (!existing) {
      res.status(404).json({ message: "Document not found." });
      return;
    }
    if (existing.kind !== "cover_letter" && existing.kind !== "resume") {
      res.status(400).json({ message: "This document cannot be edited here." });
      return;
    }

    const fallbackTitle =
      existing.kind === "cover_letter"
        ? "Cover Letter"
        : existing.resume_type === "master"
          ? "Master Resume"
          : "Resume";
    const safeTitle = nextTitle || existing.title || fallbackTitle;
    const contentText = htmlToPlainText(nextHtml);
    const nextVersion = (existing.latest_version_no ?? 0) + 1;
    const changeSummary = requestedSummary || `Edited ${existing.kind === "cover_letter" ? "cover letter" : "resume"}`;

    await transaction(async (q) => {
      await q(
        `UPDATE documents
         SET title = $2,
             content_text = $3,
             content_html = $4,
             latest_version_no = $5,
             updated_at = NOW()
         WHERE id = $1`,
        [req.params.id, safeTitle, contentText, nextHtml, nextVersion]
      );

      await q(
        `INSERT INTO document_versions (document_id, version_no, content_text, content_html, change_summary)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.params.id, nextVersion, contentText, nextHtml, changeSummary]
      );
    });

    res.json({
      message: `${existing.kind === "cover_letter" ? "Cover letter" : "Resume"} updated.`,
      document: {
        id: req.params.id,
        title: safeTitle,
        version: nextVersion,
        contentText,
        contentHtml: nextHtml,
        lastModified: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[documents/update]", err);
    res.status(500).json({ message: "Failed to update document." });
  }
});

// ── GET /api/documents/:id/download ──────────────────────────────────────────

router.get("/:id/download", async (req: Request, res: Response): Promise<void> => {
  try {
    const doc = await queryOne<{ content_text: string | null; content_html: string | null; title: string }>(
      `SELECT content_text, content_html, title FROM documents WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    );

    if (!doc) {
      res.status(404).json({ message: "Document not found." });
      return;
    }

    const filename = `${doc.title.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "resume"}.pdf`;
    const fallbackText = doc.content_text
      ?? doc.content_html?.replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
      ?? "Document content not available.";
    const pdf = generateSimplePdf(doc.title, fallbackText);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    res.send(pdf);
  } catch (err) {
    console.error("[documents/download]", err);
    res.status(500).json({ message: "Failed to download document." });
  }
});

function buildTags(r: Record<string, unknown>): string[] {
  const tags: string[] = [];
  if (r.kind === "cover_letter") tags.push("Cover Letter");
  if (r.resume_type === "master") tags.push("Master");
  if (r.resume_type === "tailored") tags.push("AI Generated");
  if (r.origin === "ai_generated") tags.push("Optimized");
  if (r.origin === "uploaded") tags.push("Uploaded");
  return tags;
}

function htmlToPlainText(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export default router;
