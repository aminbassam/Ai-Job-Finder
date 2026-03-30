import { execFileSync } from "child_process";
import { join } from "path";
import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";

interface GitUpdateEntry {
  fullHash: string;
  version: string;
  timestamp: string;
  summary: string;
  details: string[];
}

const router = Router();
router.use(requireAuth);

function parseGitUpdates(raw: string): GitUpdateEntry[] {
  return raw
    .split("\x1e")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [fullHash = "", shortHash = "", timestamp = "", subject = "", body = ""] = chunk.split("\x1f");
      const details = body
        .split("\n")
        .map((line) => line.replace(/^[-*]\s*/, "").trim())
        .filter(Boolean);

      return {
        fullHash,
        version: shortHash ? `Commit ${shortHash}` : "Recent update",
        timestamp,
        summary: subject || "Platform update",
        details,
      };
    });
}

router.get("/", (_req: Request, res: Response) => {
  try {
    const repoRoot = join(__dirname, "../../..");
    const branch = execFileSync("git", ["-C", repoRoot, "rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
      maxBuffer: 1024 * 64,
    }).trim();

    const raw = execFileSync(
      "git",
      [
        "-C",
        repoRoot,
        "log",
        "-n",
        "25",
        "--date=format:%B %d, %Y · %I:%M %p",
        "--pretty=format:%H%x1f%h%x1f%ad%x1f%s%x1f%b%x1e",
      ],
      {
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
      }
    );

    res.json({
      automated: true,
      branch,
      updates: parseGitUpdates(raw),
    });
  } catch (error) {
    console.error("[updates/list]", error);
    res.json({
      automated: false,
      branch: null,
      updates: [],
      message: "Automatic updates feed is unavailable right now.",
    });
  }
});

export default router;
