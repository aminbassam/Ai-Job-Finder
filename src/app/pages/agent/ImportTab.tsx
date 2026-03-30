import { useState } from "react";
import { Link2, ClipboardPaste, CheckCircle2, AlertCircle, Loader2, ExternalLink } from "lucide-react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { LocationInput } from "../../components/ui/location-input";
import { Switch } from "../../components/ui/switch";
import { Badge } from "../../components/ui/badge";
import { importJob } from "../../services/agent.service";

/* ─── URL parser ────────────────────────────────────────────────────── */

interface ParsedUrl {
  source: string;
  sourceLabel: string;
  title: string;
  externalId?: string;
  company?: string;
}

function parseJobUrl(raw: string): ParsedUrl {
  try {
    const u = new URL(raw);
    const host = u.hostname;

    // Indeed: https://www.indeed.com/viewjob?jk=350b043fcb2bfbc6
    if (host.includes("indeed.com")) {
      const jk = u.searchParams.get("jk");
      return {
        source: "indeed",
        sourceLabel: "Indeed",
        title: jk ? `Indeed Job · ${jk.slice(0, 8)}` : "Indeed Job",
        externalId: jk ? `indeed_${jk}` : undefined,
        company: "Indeed listing",
      };
    }

    // LinkedIn: https://www.linkedin.com/jobs/view/1234567890
    if (host.includes("linkedin.com")) {
      const match = u.pathname.match(/view\/(\d+)/);
      const jobId = match?.[1] ?? u.searchParams.get("currentJobId");
      return {
        source: "linkedin",
        sourceLabel: "LinkedIn",
        title: jobId ? `LinkedIn Job · ${jobId}` : "LinkedIn Job",
        externalId: jobId ? `linkedin_${jobId}` : undefined,
        company: "LinkedIn listing",
      };
    }

    // Greenhouse: https://boards.greenhouse.io/company/jobs/1234
    if (host.includes("greenhouse.io")) {
      const parts = u.pathname.split("/").filter(Boolean);
      const slug = parts[0];
      const jobId = parts[parts.length - 1];
      return {
        source: "greenhouse",
        sourceLabel: "Greenhouse",
        title: `Greenhouse Job · ${jobId ?? slug}`,
        externalId: jobId ? `greenhouse_${jobId}` : undefined,
        company: slug ?? "Greenhouse",
      };
    }

    // Lever: https://jobs.lever.co/company/uuid
    if (host.includes("lever.co")) {
      const parts = u.pathname.split("/").filter(Boolean);
      const slug = parts[0];
      const jobId = parts[1];
      return {
        source: "lever",
        sourceLabel: "Lever",
        title: `Lever Job · ${slug}`,
        externalId: jobId ? `lever_${jobId}` : undefined,
        company: slug ?? "Lever",
      };
    }

    // Ashby: https://jobs.ashbyhq.com/company/uuid
    if (host.includes("ashbyhq.com")) {
      const parts = u.pathname.split("/").filter(Boolean);
      const slug = parts[0];
      const jobId = parts[1];
      return {
        source: "ashby",
        sourceLabel: "Ashby",
        title: `Ashby Job · ${slug}`,
        externalId: jobId ? `ashby_${jobId}` : undefined,
        company: slug ?? "Ashby",
      };
    }

    // Workday: https://company.wd5.myworkdayjobs.com/...
    if (host.includes("myworkdayjobs.com") || host.includes("workday.com")) {
      const coName = host.split(".")[0];
      return {
        source: "workday",
        sourceLabel: "Workday",
        title: `Workday Job · ${coName}`,
        company: coName,
      };
    }

    // Generic company career page
    const coName = host.replace(/^www\./, "").replace(/^jobs\./, "").split(".")[0];
    const label = coName.charAt(0).toUpperCase() + coName.slice(1);
    return {
      source: "manual",
      sourceLabel: label,
      title: `Job at ${label}`,
      company: label,
    };
  } catch {
    return { source: "manual", sourceLabel: "Manual", title: "Imported Job" };
  }
}

/* ─── Main component ─────────────────────────────────────────────────── */

export function ImportTab() {
  const [mode, setMode] = useState<"url" | "manual">("url");

  // URL mode
  const [url, setUrl] = useState("");
  const [parsed, setParsed] = useState<ParsedUrl | null>(null);

  // Manual mode
  const [form, setForm] = useState({
    title: "",
    company: "",
    location: "",
    remote: false,
    description: "",
  });

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  function upd<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function handleUrlChange(val: string) {
    setUrl(val);
    setError("");
    setSuccess("");
    if (val.trim().startsWith("http")) {
      setParsed(parseJobUrl(val.trim()));
    } else {
      setParsed(null);
    }
  }

  async function handleUrlImport() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const info = parsed ?? parseJobUrl(trimmed);
      await importJob({
        title: info.title,
        company: info.company,
        sourceUrl: trimmed,
        source: info.source,
        externalId: info.externalId,
      });
      setSuccess(`Saved as "${info.title}" — scoring in progress.`);
      setUrl("");
      setParsed(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed.";
      setError(msg.includes("Import failed:") ? msg : `Import failed — ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleManualImport() {
    if (!form.title.trim()) return;
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      await importJob({
        title: form.title,
        company: form.company || undefined,
        location: form.location || undefined,
        remote: form.remote,
        description: form.description || undefined,
        source: "manual",
      });
      setSuccess(`"${form.title}" imported successfully.`);
      setForm({ title: "", company: "", location: "", remote: false, description: "" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed.";
      setError(msg.includes("Import failed:") ? msg : `Import failed — ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h3 className="text-[15px] font-semibold text-white mb-1">Manual Import</h3>
        <p className="text-[13px] text-[#9CA3AF]">
          Import any job you find manually — it enters the same scoring pipeline as auto-discovered jobs.
        </p>
      </div>

      {/* Feedback */}
      {success && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[#10B981]/10 border border-[#10B981]/20 text-[#10B981] text-[13px]">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/20 text-[#EF4444] text-[13px]">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Mode toggle */}
      <div className="flex bg-[#0B0F14] border border-[#1F2937] rounded-lg p-1 gap-1">
        {(["url", "manual"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setError(""); setSuccess(""); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-[13px] font-medium transition-all ${
              mode === m
                ? "bg-[#4F8CFF] text-white"
                : "text-[#9CA3AF] hover:text-white hover:bg-[#1F2937]"
            }`}
          >
            {m === "url" ? <Link2 className="h-4 w-4" /> : <ClipboardPaste className="h-4 w-4" />}
            {m === "url" ? "Paste URL" : "Enter Details"}
          </button>
        ))}
      </div>

      {/* URL mode */}
      {mode === "url" && (
        <Card className="bg-[#111827] border-[#1F2937] p-5 space-y-4">
          <p className="text-[13px] text-[#9CA3AF]">
            Paste a job URL — source and job ID are detected automatically.
          </p>

          <div className="flex gap-3">
            <Input
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUrlImport()}
              placeholder="https://www.indeed.com/viewjob?jk=…"
              className="bg-[#0B0F14] border-[#1F2937] text-white placeholder:text-[#4B5563] flex-1"
            />
            <Button
              onClick={handleUrlImport}
              disabled={!url.trim() || loading}
              className="bg-[#4F8CFF] hover:bg-[#4F8CFF]/90 text-white shrink-0"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Import"}
            </Button>
          </div>

          {/* Live URL preview */}
          {parsed && (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#0B0F14] border border-[#4F8CFF]/20">
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-white truncate">{parsed.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge className="bg-[#4F8CFF]/10 text-[#4F8CFF] border-[#4F8CFF]/20 text-[10px]">
                    {parsed.sourceLabel}
                  </Badge>
                  {parsed.externalId && (
                    <span className="text-[11px] text-[#6B7280]">
                      ID: {parsed.externalId.split("_").slice(1).join("_")}
                    </span>
                  )}
                </div>
              </div>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#6B7280] hover:text-[#4F8CFF] transition-colors shrink-0"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}

          {/* Supported platforms */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: "Indeed", hint: "?jk= ID extracted" },
              { label: "LinkedIn", hint: "/view/ID extracted" },
              { label: "Greenhouse", hint: "job ID extracted" },
              { label: "Lever", hint: "company + UUID" },
              { label: "Ashby", hint: "company + UUID" },
              { label: "Workday", hint: "company detected" },
              { label: "Any URL", hint: "hostname as company" },
            ].map((p) => (
              <span
                key={p.label}
                title={p.hint}
                className="px-2 py-0.5 rounded bg-[#1F2937] text-[#6B7280] text-[11px] border border-[#374151] cursor-default"
              >
                ✓ {p.label}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Manual mode */}
      {mode === "manual" && (
        <Card className="bg-[#111827] border-[#1F2937] p-5 space-y-4">
          <div>
            <Label className="text-[12px] text-[#9CA3AF] mb-1.5 block">Job Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => upd("title", e.target.value)}
              placeholder="e.g. Senior Product Manager"
              className="bg-[#0B0F14] border-[#1F2937] text-white placeholder:text-[#4B5563]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px] text-[#9CA3AF] mb-1.5 block">Company</Label>
              <Input
                value={form.company}
                onChange={(e) => upd("company", e.target.value)}
                placeholder="e.g. Stripe"
                className="bg-[#0B0F14] border-[#1F2937] text-white placeholder:text-[#4B5563]"
              />
            </div>
            <div>
              <Label className="text-[12px] text-[#9CA3AF] mb-1.5 block">Location</Label>
              <LocationInput
                value={form.location}
                onChange={(value) => upd("location", value)}
                placeholder="Search US city or state"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={form.remote} onCheckedChange={(v) => upd("remote", v)} />
            <Label className="text-[13px] text-white">Remote position</Label>
          </div>
          <div>
            <Label className="text-[12px] text-[#9CA3AF] mb-1.5 block">
              Job Description
              <span className="ml-1 text-[#4B5563]">— paste for better AI scoring</span>
            </Label>
            <textarea
              value={form.description}
              onChange={(e) => upd("description", e.target.value)}
              placeholder="Paste the full job description here…"
              rows={6}
              className="w-full bg-[#0B0F14] border border-[#1F2937] rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-[#4B5563] resize-none focus:outline-none focus:border-[#4F8CFF]/50"
            />
          </div>
          <Button
            onClick={handleManualImport}
            disabled={!form.title.trim() || loading}
            className="bg-[#4F8CFF] hover:bg-[#4F8CFF]/90 text-white"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing…</>
            ) : (
              "Import Job"
            )}
          </Button>
        </Card>
      )}

      {/* How it works */}
      <Card className="bg-[#0B0F14] border-[#1F2937] p-4">
        <p className="text-[12px] font-semibold text-[#9CA3AF] mb-2">How it works</p>
        <ol className="space-y-1 text-[12px] text-[#6B7280]">
          <li>1. Paste a URL or fill in the details above</li>
          <li>2. Job is saved and deduplicated (same URL won't create duplicates)</li>
          <li>3. AI scores it against your active search profiles</li>
          <li>4. Appears in Results alongside auto-discovered jobs</li>
        </ol>
      </Card>
    </div>
  );
}
