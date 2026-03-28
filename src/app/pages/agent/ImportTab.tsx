/**
 * Manual Import tab — Lane 3 fallback:
 *  • Paste a job URL (extension-style import)
 *  • Or fill in the job details manually
 *
 * Every imported job enters the same pipeline as auto-discovered jobs.
 */
import { useState } from "react";
import { Link2, ClipboardPaste, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Switch } from "../../components/ui/switch";
import { importJob } from "../../services/agent.service";

export function ImportTab() {
  const [mode, setMode] = useState<"url" | "manual">("url");
  const [url, setUrl] = useState("");
  const [form, setForm] = useState({
    title: "",
    company: "",
    location: "",
    remote: false,
    description: "",
    source: "manual",
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  function upd<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleUrlImport() {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      // Detect source from URL
      let detectedSource = "manual";
      if (url.includes("linkedin.com")) detectedSource = "linkedin";
      else if (url.includes("indeed.com")) detectedSource = "indeed";
      else if (url.includes("greenhouse.io")) detectedSource = "greenhouse";
      else if (url.includes("lever.co")) detectedSource = "lever";
      else if (url.includes("ashbyhq.com")) detectedSource = "ashby";

      await importJob({
        title: "Imported job",
        sourceUrl: url,
        source: detectedSource,
      });
      setSuccess("Job imported and queued for scoring.");
      setUrl("");
    } catch {
      setError("Import failed. Check the URL and try again.");
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
        source: form.source,
      });
      setSuccess(`"${form.title}" imported successfully.`);
      setForm({ title: "", company: "", location: "", remote: false, description: "", source: "manual" });
    } catch {
      setError("Import failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
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
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/20 text-[#EF4444] text-[13px]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Mode toggle */}
      <div className="flex bg-[#0B0F14] border border-[#1F2937] rounded-lg p-1 gap-1">
        <button
          type="button"
          onClick={() => setMode("url")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-[13px] font-medium transition-all ${
            mode === "url"
              ? "bg-[#4F8CFF] text-white"
              : "text-[#9CA3AF] hover:text-white hover:bg-[#1F2937]"
          }`}
        >
          <Link2 className="h-4 w-4" />
          Paste URL
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-[13px] font-medium transition-all ${
            mode === "manual"
              ? "bg-[#4F8CFF] text-white"
              : "text-[#9CA3AF] hover:text-white hover:bg-[#1F2937]"
          }`}
        >
          <ClipboardPaste className="h-4 w-4" />
          Enter Details
        </button>
      </div>

      {/* URL import */}
      {mode === "url" && (
        <Card className="bg-[#111827] border-[#1F2937] p-5">
          <p className="text-[13px] text-[#9CA3AF] mb-4">
            Paste a job URL from LinkedIn, Indeed, Greenhouse, Lever, or any company career page.
            The source will be auto-detected.
          </p>
          <div className="flex gap-3">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUrlImport()}
              placeholder="https://jobs.lever.co/company/job-id"
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
          <div className="flex flex-wrap gap-2 mt-3">
            {["LinkedIn", "Indeed", "Greenhouse", "Lever", "Ashby", "Workday", "Company site"].map((s) => (
              <span key={s} className="px-2 py-0.5 rounded bg-[#1F2937] text-[#6B7280] text-[11px] border border-[#374151]">
                ✓ {s}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Manual form */}
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
              <Input
                value={form.location}
                onChange={(e) => upd("location", e.target.value)}
                placeholder="e.g. San Francisco, CA"
                className="bg-[#0B0F14] border-[#1F2937] text-white placeholder:text-[#4B5563]"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={form.remote} onCheckedChange={(v) => upd("remote", v)} />
            <Label className="text-[13px] text-white">Remote position</Label>
          </div>
          <div>
            <Label className="text-[12px] text-[#9CA3AF] mb-1.5 block">Job Description (optional)</Label>
            <textarea
              value={form.description}
              onChange={(e) => upd("description", e.target.value)}
              placeholder="Paste the full job description for better AI scoring…"
              rows={6}
              className="w-full bg-[#0B0F14] border border-[#1F2937] rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-[#4B5563] resize-none focus:outline-none focus:border-[#4F8CFF]/50"
            />
          </div>
          <Button
            onClick={handleManualImport}
            disabled={!form.title.trim() || loading}
            className="bg-[#4F8CFF] hover:bg-[#4F8CFF]/90 text-white"
          >
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing…</> : "Import Job"}
          </Button>
        </Card>
      )}

      {/* How it works */}
      <Card className="bg-[#0B0F14] border-[#1F2937] p-4">
        <p className="text-[12px] font-semibold text-[#9CA3AF] mb-2">How manual import works</p>
        <ol className="space-y-1.5 text-[12px] text-[#6B7280]">
          <li>1. You paste a URL or fill in the details above</li>
          <li>2. The job is normalized and stored in your results</li>
          <li>3. AI scores it against your active search profiles</li>
          <li>4. It appears in Results alongside auto-discovered jobs</li>
          <li>5. You can generate a tailored resume from the Results tab</li>
        </ol>
      </Card>
    </div>
  );
}
