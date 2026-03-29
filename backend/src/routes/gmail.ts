import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import {
  buildGmailCallbackRedirect,
  buildGmailConnectUrl,
  completeGmailOAuth,
  disconnectGmail,
  getGmailConnectionStatus,
  syncLinkedInEmails,
} from "../services/gmail-linkedin-ingestion";

const router = Router();

router.get("/callback", async (req: Request, res: Response): Promise<void> => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const error = typeof req.query.error === "string" ? req.query.error : "";

  if (error) {
    res.redirect(buildGmailCallbackRedirect({ gmail: "error", message: error }));
    return;
  }

  if (!code || !state) {
    res.redirect(buildGmailCallbackRedirect({ gmail: "error", message: "missing_oauth_code" }));
    return;
  }

  try {
    const result = await completeGmailOAuth(code, state);
    res.redirect(buildGmailCallbackRedirect({
      gmail: "connected",
      email: result.email,
    }));
  } catch (err) {
    res.redirect(buildGmailCallbackRedirect({
      gmail: "error",
      message: err instanceof Error ? err.message : "gmail_connect_failed",
    }));
  }
});

router.use(requireAuth);

router.post("/connect", async (req: Request, res: Response): Promise<void> => {
  try {
    const authUrl = await buildGmailConnectUrl(req.userId);
    res.json({ authUrl });
  } catch (err) {
    console.error("[gmail/connect]", err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to create Gmail auth URL." });
  }
});

router.get("/status", async (req: Request, res: Response): Promise<void> => {
  try {
    const status = await getGmailConnectionStatus(req.userId);
    res.json(status);
  } catch (err) {
    console.error("[gmail/status]", err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to load Gmail status." });
  }
});

router.post("/sync", async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await syncLinkedInEmails(req.userId);
    res.json({
      message: `LinkedIn email sync complete. Imported ${result.imported} jobs.`,
      ...result,
    });
  } catch (err) {
    console.error("[gmail/sync]", err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to sync LinkedIn emails." });
  }
});

router.delete("/disconnect", async (req: Request, res: Response): Promise<void> => {
  try {
    await disconnectGmail(req.userId);
    res.json({ message: "Gmail disconnected." });
  } catch (err) {
    console.error("[gmail/disconnect]", err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to disconnect Gmail." });
  }
});

export default router;
