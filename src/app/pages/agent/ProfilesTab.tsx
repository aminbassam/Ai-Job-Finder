import { useState, useEffect, useRef } from "react";
import {
  Plus, Play, Pause, Pencil, Trash2, Clock, Zap,
  Target, AlertCircle, Loader2, ChevronDown, ChevronUp, RefreshCw,
  Square, ScrollText, CheckCircle2, XCircle, Ban,
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Switch } from "../../components/ui/switch";
import { Badge } from "../../components/ui/badge";
import { Slider } from "../../components/ui/slider";
import { TagInput } from "../../components/ui/tag-input";
import {
  SearchProfile, ProfileInput, ConnectorConfig, ActivityLog,
  getProfiles, getConnectors, createProfile, updateProfile, deleteProfile, runProfile,
  getRunStatus, cancelRun, getProfileLogs,
} from "../../services/agent.service";

const SOURCE_LABELS: Record<string, string> = {
  remotive: "Remotive",
  arbeitnow: "Arbeitnow",
  ziprecruiter: "ZipRecruiter",
  usajobs: "USAJobs",
  greenhouse: "Greenhouse",
  lever: "Lever",
  google: "Google",
  builtinaustin: "Built In Austin",
  "linkedin-email": "LinkedIn Email",
  upwork: "Upwork",
  ashby: "Ashby",
};

/* ──────────────── Segmented control ────────────────────────── */
function SegCtrl({
  options, value, onChange,
}: {
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex bg-[#0B0F14] border border-[#1F2937] rounded-lg p-1 gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${
            value === o.value
              ? "bg-[#4F8CFF] text-white"
              : "text-[#9CA3AF] hover:text-white hover:bg-[#1F2937]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const BLANK: ProfileInput = {
  name: "",
  jobTitles: [],
  locations: [],
  remoteOnly: false,
  includeNearby: false,
  experienceLevels: [],
  jobTypes: [],
  mustHaveKeywords: [],
  niceToHaveKeywords: [],
  excludedCompanies: [],
  includedCompanies: [],
  companySizes: [],
  sources: [],
  searchMode: "balanced",
  scoreThreshold: 70,
  autoResume: false,
  schedule: "daily",
  postedWithinDays: 7,
  isActive: true,
};

/* ──────────────── Profile Form ─────────────────────────────── */
function ProfileForm({
  initial,
  connectors,
  onSave,
  onCancel,
}: {
  initial: ProfileInput;
  connectors: ConnectorConfig[];
  onSave: (data: ProfileInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ProfileInput>(initial);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [advanced, setAdvanced] = useState(false);

  const upd = <K extends keyof ProfileInput>(k: K, v: ProfileInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const activeSourceOptions = connectors
    .filter((connector) => connector.isActive)
    .map((connector) => ({
      key: connector.connector,
      label: SOURCE_LABELS[connector.connector] ?? connector.connector,
    }));
  const activeSourceKeys = activeSourceOptions.map((connector) => connector.key);
  const expOptions = ["Entry", "Mid-level", "Senior", "Lead", "Director"];
  const jobTypeOptions = [
    { key: "full-time", label: "Full-time" },
    { key: "part-time", label: "Part-time" },
    { key: "contract", label: "Contract" },
    { key: "internship", label: "Internship" },
    { key: "freelance", label: "Freelance" },
  ];

  function toggleSource(key: string) {
    upd("sources", form.sources.includes(key)
      ? form.sources.filter((s) => s !== key)
      : [...form.sources, key]);
  }

  function toggleExp(level: string) {
    upd("experienceLevels", form.experienceLevels.includes(level)
      ? form.experienceLevels.filter((l) => l !== level)
      : [...form.experienceLevels, level]);
  }

  function toggleJobType(type: string) {
    upd("jobTypes", form.jobTypes.includes(type)
      ? form.jobTypes.filter((t) => t !== type)
      : [...form.jobTypes, type]);
  }

  useEffect(() => {
    setForm((current) => {
      const nextSources = current.sources.filter((source) => activeSourceKeys.includes(source));
      if (nextSources.length === current.sources.length) return current;
      return { ...current, sources: nextSources };
    });
  }, [activeSourceKeys.join("|")]);

  async function handleSave() {
    if (!form.name.trim()) {
      setSaveError("Profile name is required.");
      return;
    }
    if (form.sources.length === 0) {
      setSaveError("Select at least one job source.");
      return;
    }
    if (form.schedule === "custom" && (!form.scheduleIntervalMinutes || form.scheduleIntervalMinutes < 15)) {
      setSaveError("Custom search frequency must be at least 15 minutes.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await onSave(form);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save profile.";
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {saveError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/20 text-[#EF4444] text-[13px]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {saveError}
        </div>
      )}

      {/* Name */}
      <div>
        <Label className="text-[12px] text-[#9CA3AF] mb-1.5 block">Profile Name *</Label>
        <Input
          value={form.name}
          onChange={(e) => { upd("name", e.target.value); setSaveError(""); }}
          placeholder="e.g. Senior PM — Remote US"
          className={`bg-[#0B0F14] border-[#1F2937] text-white placeholder:text-[#4B5563] ${
            saveError && !form.name.trim() ? "border-[#EF4444]" : ""
          }`}
        />
      </div>

      {/* Job Titles */}
      <div>
        <Label className="text-[12px] text-[#9CA3AF] mb-1.5 block">Target Job Titles</Label>
        <TagInput
          tags={form.jobTitles}
          onChange={(v) => upd("jobTitles", v)}
          placeholder="e.g. Product Manager…"
          suggestions={["Product Manager", "Senior PM", "Engineering Manager",
            "Software Engineer", "Frontend Engineer", "Data Scientist",
            "DevOps Engineer", "UX Designer", "Technical Lead"]}
        />
      </div>

      {/* Locations */}
      <div>
        <Label className="text-[12px] text-[#9CA3AF] mb-1.5 block">Locations</Label>
        <TagInput
          tags={form.locations}
          onChange={(v) => upd("locations", v)}
          placeholder="e.g. San Francisco, CA…"
          suggestions={["Remote", "San Francisco, CA", "New York, NY",
            "Austin, TX", "Seattle, WA", "Boston, MA", "London, UK"]}
        />
        <div className="flex gap-4 mt-2">
          <label className="flex items-center gap-2 text-[12px] text-[#9CA3AF] cursor-pointer">
            <Switch checked={form.remoteOnly} onCheckedChange={(v) => upd("remoteOnly", v)} />
            Remote only
          </label>
          <label className={`flex items-center gap-2 text-[12px] cursor-pointer ${
            form.remoteOnly ? "text-[#4B5563] opacity-50" : "text-[#9CA3AF]"
          }`}>
            <Switch
              checked={form.includeNearby}
              onCheckedChange={(v) => upd("includeNearby", v)}
              disabled={form.remoteOnly}
            />
            Include nearby cities
          </label>
        </div>
      </div>

      {/* Salary */}
      <div>
        <div className="flex justify-between mb-2">
          <Label className="text-[12px] text-[#9CA3AF]">Salary Range</Label>
          <span className="text-[12px] font-medium text-white">
            ${form.salaryMin ?? 80}k — ${form.salaryMax ?? 200}k
          </span>
        </div>
        <Slider
          value={[form.salaryMin ?? 80, form.salaryMax ?? 200]}
          onValueChange={([a, b]) => { upd("salaryMin", a); upd("salaryMax", b); }}
          min={0} max={400} step={10}
        />
      </div>

      {/* Experience */}
      <div className="space-y-4">
        <div>
        <Label className="text-[12px] text-[#9CA3AF] mb-2 block">Experience Level</Label>
        <div className="flex flex-wrap gap-2">
          {expOptions.map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => toggleExp(lvl)}
              className={`px-3 py-1.5 rounded-lg text-[12px] border transition-all ${
                form.experienceLevels.includes(lvl)
                  ? "bg-[#4F8CFF]/15 text-[#4F8CFF] border-[#4F8CFF]/30"
                  : "bg-[#0B0F14] text-[#6B7280] border-[#1F2937] hover:text-[#9CA3AF]"
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
        </div>

        <div>
          <Label className="text-[12px] text-[#9CA3AF] mb-2 block">Job Type</Label>
          <div className="flex flex-wrap gap-2">
            {jobTypeOptions.map((type) => (
              <button
                key={type.key}
                type="button"
                onClick={() => toggleJobType(type.key)}
                className={`px-3 py-1.5 rounded-lg text-[12px] border transition-all ${
                  form.jobTypes.includes(type.key)
                    ? "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30"
                    : "bg-[#0B0F14] text-[#6B7280] border-[#1F2937] hover:text-[#9CA3AF]"
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sources */}
      <div>
        <Label className="text-[12px] text-[#9CA3AF] mb-2 block">Job Sources *</Label>
        {activeSourceOptions.length === 0 ? (
          <div className="rounded-lg border border-[#F59E0B]/20 bg-[#F59E0B]/10 px-3 py-2.5 text-[12px] text-[#F59E0B]">
            No active sources yet. Enable at least one connector in the <span className="font-medium text-white">Sources</span> tab before saving this profile.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {activeSourceOptions.map((src) => (
              <button
                key={src.key}
                type="button"
                onClick={() => { toggleSource(src.key); setSaveError(""); }}
                className={`px-3 py-1.5 rounded-lg text-[12px] border transition-all ${
                  form.sources.includes(src.key)
                    ? "bg-[#4F8CFF]/15 text-[#4F8CFF] border-[#4F8CFF]/30"
                    : "bg-[#0B0F14] text-[#6B7280] border-[#1F2937] hover:text-[#9CA3AF]"
                }`}
              >
                {src.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Schedule + Mode */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div>
          <Label className="text-[12px] text-[#9CA3AF] mb-2 block">Search Frequency</Label>
          <SegCtrl
            options={[
              { label: "6h", value: "6h" },
              { label: "Daily", value: "daily" },
              { label: "Weekdays", value: "weekdays" },
              { label: "Custom", value: "custom" },
              { label: "Manual", value: "manual" },
            ]}
            value={form.schedule}
            onChange={(v) => upd("schedule", v as ProfileInput["schedule"])}
          />
          {form.schedule === "custom" && (
            <div className="mt-3">
              <Label className="text-[12px] text-[#9CA3AF] mb-1.5 block">Custom frequency (minutes)</Label>
              <Input
                type="number"
                min={15}
                step={15}
                value={form.scheduleIntervalMinutes ?? 60}
                onChange={(e) => upd("scheduleIntervalMinutes", e.target.value ? Number(e.target.value) : null)}
                className="bg-[#0B0F14] border-[#1F2937] text-white"
              />
            </div>
          )}
          {form.schedule === "manual" && (
            <p className="mt-3 text-[12px] text-[#6B7280]">
              Manual only. The profile saves normally, but searches run only when you click <span className="text-white font-medium">Run now</span>.
            </p>
          )}
        </div>
        <div>
          <Label className="text-[12px] text-[#9CA3AF] mb-2 block">Search Mode</Label>
          <SegCtrl
            options={[
              { label: "Strict",   value: "strict"   },
              { label: "Balanced", value: "balanced" },
              { label: "Broad",    value: "broad"    },
            ]}
            value={form.searchMode}
            onChange={(v) => upd("searchMode", v as ProfileInput["searchMode"])}
          />
        </div>
      </div>

      <div>
        <Label className="text-[12px] text-[#9CA3AF] mb-2 block">Date Posted</Label>
        <SegCtrl
          options={[
            { label: "Any time", value: "any" },
            { label: "24h", value: "1" },
            { label: "3d", value: "3" },
            { label: "7d", value: "7" },
            { label: "14d", value: "14" },
            { label: "30d", value: "30" },
          ]}
          value={form.postedWithinDays ? String(form.postedWithinDays) : "any"}
          onChange={(v) => upd("postedWithinDays", v === "any" ? null : Number(v))}
        />
      </div>

      {/* Advanced */}
      <button
        type="button"
        onClick={() => setAdvanced((v) => !v)}
        className="flex items-center gap-1.5 text-[12px] text-[#6B7280] hover:text-[#9CA3AF] transition-colors"
      >
        {advanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        Advanced options
      </button>

      {advanced && (
        <div className="space-y-4 pt-2 border-t border-[#1F2937]">
          <div>
            <Label className="text-[12px] text-[#9CA3AF] mb-1.5 block">Must-Have Keywords</Label>
            <TagInput
              tags={form.mustHaveKeywords}
              onChange={(v) => upd("mustHaveKeywords", v)}
              placeholder="e.g. TypeScript, AWS…"
            />
          </div>
          <div>
            <Label className="text-[12px] text-[#9CA3AF] mb-1.5 block">Excluded Companies</Label>
            <TagInput
              tags={form.excludedCompanies}
              onChange={(v) => upd("excludedCompanies", v)}
              placeholder="e.g. Uber, Meta…"
            />
          </div>
          <div>
            <div className="flex justify-between mb-2">
              <Label className="text-[12px] text-[#9CA3AF]">Min Score Threshold</Label>
              <span className="text-[12px] font-medium text-[#4F8CFF]">{form.scoreThreshold}</span>
            </div>
            <Slider
              value={[form.scoreThreshold]}
              onValueChange={([v]) => upd("scoreThreshold", v)}
              min={0} max={100} step={5}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] text-white">Auto-generate resume for strong matches</p>
              <p className="text-[11px] text-[#6B7280]">Tailors your resume for jobs above threshold</p>
            </div>
            <Switch checked={form.autoResume} onCheckedChange={(v) => upd("autoResume", v)} />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#4F8CFF] hover:bg-[#4F8CFF]/90 text-white"
        >
          {saving
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
            : "Save Profile"
          }
        </Button>
        <Button variant="ghost" onClick={onCancel} className="text-[#9CA3AF] hover:text-white">
          Cancel
        </Button>
      </div>
    </div>
  );
}

/* ──────────────── Log helpers ──────────────────────────────── */
function logActionLabel(action: string) {
  switch (action) {
    case "created":       return "Profile created";
    case "updated":       return "Profile settings updated";
    case "paused":        return "Profile paused";
    case "resumed":       return "Profile resumed";
    case "deleted":       return "Profile deleted";
    case "run_started":   return "Run started";
    case "run_completed": return "Run completed";
    case "run_failed":    return "Run failed";
    case "run_cancelled": return "Run cancelled";
    default:              return action.replace(/_/g, " ");
  }
}

function logActionIcon(action: string) {
  switch (action) {
    case "created":
    case "updated":       return <CheckCircle2 className="h-3.5 w-3.5 text-[#4F8CFF]" />;
    case "paused":        return <Pause className="h-3.5 w-3.5 text-[#F59E0B]" />;
    case "resumed":       return <Play className="h-3.5 w-3.5 text-[#10B981]" />;
    case "deleted":       return <Trash2 className="h-3.5 w-3.5 text-[#EF4444]" />;
    case "run_started":   return <Loader2 className="h-3.5 w-3.5 text-[#4F8CFF] animate-spin" />;
    case "run_completed": return <CheckCircle2 className="h-3.5 w-3.5 text-[#10B981]" />;
    case "run_failed":    return <XCircle className="h-3.5 w-3.5 text-[#EF4444]" />;
    case "run_cancelled": return <Ban className="h-3.5 w-3.5 text-[#6B7280]" />;
    default:              return <CheckCircle2 className="h-3.5 w-3.5 text-[#6B7280]" />;
  }
}

function logDetailLine(log: ActivityLog) {
  const d = log.detail;
  if (log.action === "run_completed") {
    return `Found ${d.jobsFound ?? 0} jobs · ${d.jobsNew ?? 0} new · ${d.strongMatches ?? 0} strong`;
  }
  if (log.action === "run_failed") return String(d.error ?? "Unknown error");
  if (log.action === "run_started") return `Sources: ${(d.sources as string[] | undefined)?.join(", ") ?? "—"}`;
  if (log.action === "updated") {
    const s = d.sources as string[] | undefined;
    return s ? `Sources: ${s.join(", ")}` : "";
  }
  return "";
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/* ──────────────── Profile Card ─────────────────────────────── */
function ProfileCard({
  profile, onEdit, onDelete, onToggle, onRunComplete,
}: {
  profile: SearchProfile;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onRunComplete: () => void;
}) {
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<string>("idle");
  const [runResult, setRunResult] = useState<{ jobsFound: number; jobsNew: number; strongMatches: number } | null>(null);
  const [runError, setRunError] = useState("");
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll run status while running
  useEffect(() => {
    if (!activeRunId) return;
    pollRef.current = setInterval(async () => {
      try {
        const run = await getRunStatus(activeRunId);
        setRunStatus(run.status);
        if (run.status !== "running") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          if (run.status === "completed") {
            setRunResult({ jobsFound: run.jobsFound, jobsNew: run.jobsNew, strongMatches: run.strongMatches });
            onRunComplete();
          } else if (run.status === "failed") {
            setRunError(run.error ?? "Run failed.");
          }
          setActiveRunId(null);
          // Refresh logs after run finishes
          if (logsOpen) loadLogs();
        }
      } catch {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        setActiveRunId(null);
        setRunStatus("idle");
      }
    }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeRunId]);

  async function handleRun() {
    setRunError("");
    setRunResult(null);
    try {
      const res = await runProfile(profile.id);
      setActiveRunId(res.runId);
      setRunStatus("running");
      if (logsOpen) loadLogs();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Run failed.");
    }
  }

  async function handleStop() {
    if (!activeRunId) return;
    try {
      await cancelRun(activeRunId);
      clearInterval(pollRef.current!);
      pollRef.current = null;
      setActiveRunId(null);
      setRunStatus("idle");
      if (logsOpen) loadLogs();
    } catch {
      // ignore
    }
  }

  async function loadLogs() {
    setLogsLoading(true);
    try {
      const data = await getProfileLogs(profile.id);
      setLogs(data);
    } catch {
      // ignore
    } finally {
      setLogsLoading(false);
    }
  }

  function toggleLogs() {
    if (!logsOpen && logs.length === 0) loadLogs();
    setLogsOpen((v) => !v);
  }

  const isRunning = runStatus === "running";

  const scheduleLabel =
    profile.schedule === "6h" ? "Every 6 h"
    : profile.schedule === "custom" ? `Every ${profile.scheduleIntervalMinutes ?? 60} min`
    : profile.schedule === "manual" ? "Manual only"
    : profile.schedule === "weekdays" ? "Weekdays"
    : "Daily";

  return (
    <Card className={`bg-[#111827] border-[#1F2937] p-5 transition-all ${profile.isActive ? "" : "opacity-60"} ${isRunning ? "border-[#4F8CFF]/40" : ""}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="text-[15px] font-semibold text-white truncate">{profile.name}</h3>
            {isRunning
              ? <Badge className="bg-[#4F8CFF]/15 text-[#4F8CFF] border-[#4F8CFF]/30 text-[10px] shrink-0 flex items-center gap-1">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />In Progress
                </Badge>
              : profile.isActive
                ? <Badge className="bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20 text-[10px] shrink-0">Active</Badge>
                : <Badge className="bg-[#374151] text-[#9CA3AF] border-[#4B5563] text-[10px] shrink-0">Paused</Badge>
            }
          </div>
          <div className="flex items-center gap-3 text-[11px] text-[#6B7280]">
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{scheduleLabel}</span>
            <span className="flex items-center gap-1"><Target className="h-3 w-3" />{profile.sources.length} sources</span>
            {profile.postedWithinDays && <span>Past {profile.postedWithinDays}d</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isRunning ? (
            <Button
              variant="ghost" size="sm" onClick={handleStop} title="Stop run"
              className="h-8 w-8 p-0 text-[#EF4444] hover:text-[#EF4444] hover:bg-[#EF4444]/10"
            >
              <Square className="h-4 w-4 fill-current" />
            </Button>
          ) : (
            <Button
              variant="ghost" size="sm" onClick={handleRun} title="Run now"
              className="h-8 w-8 p-0 text-[#6B7280] hover:text-[#4F8CFF] hover:bg-[#4F8CFF]/10"
            >
              <Play className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost" size="sm" onClick={onToggle}
            title={profile.isActive ? "Pause" : "Resume"}
            className="h-8 w-8 p-0 text-[#6B7280] hover:text-white hover:bg-[#1F2937]"
          >
            <Pause className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost" size="sm" onClick={onEdit}
            className="h-8 w-8 p-0 text-[#6B7280] hover:text-white hover:bg-[#1F2937]"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost" size="sm" onClick={onDelete}
            className="h-8 w-8 p-0 text-[#6B7280] hover:text-[#EF4444] hover:bg-[#EF4444]/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Run progress banner */}
      {isRunning && (
        <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg bg-[#4F8CFF]/10 border border-[#4F8CFF]/20 text-[#4F8CFF] text-[12px]">
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          Searching for jobs across {profile.sources.join(", ")}…
        </div>
      )}

      {runResult && !isRunning && (
        <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg bg-[#10B981]/10 border border-[#10B981]/20 text-[#10B981] text-[12px]">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Found {runResult.jobsFound} jobs · {runResult.jobsNew} new · {runResult.strongMatches} strong match{runResult.strongMatches !== 1 ? "es" : ""}
        </div>
      )}

      {runError && (
        <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/20 text-[#EF4444] text-[12px]">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />{runError}
        </div>
      )}

      {profile.jobTitles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {profile.jobTitles.slice(0, 4).map((t) => (
            <span key={t} className="px-2 py-0.5 rounded-md bg-[#4F8CFF]/10 text-[#4F8CFF] text-[11px] border border-[#4F8CFF]/20">
              {t}
            </span>
          ))}
          {profile.jobTitles.length > 4 && (
            <span className="px-2 py-0.5 rounded-md bg-[#1F2937] text-[#6B7280] text-[11px]">
              +{profile.jobTitles.length - 4}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-4 pt-3 border-t border-[#1F2937]">
        <div>
          <p className="text-[11px] text-[#6B7280]">Total matches</p>
          {isRunning
            ? <div className="h-5 w-8 rounded bg-[#1F2937] animate-pulse mt-0.5" />
            : <p className="text-[16px] font-bold text-white">{profile.totalMatches ?? 0}</p>
          }
        </div>
        <div>
          <p className="text-[11px] text-[#6B7280]">Strong fits</p>
          {isRunning
            ? <div className="h-5 w-8 rounded bg-[#1F2937] animate-pulse mt-0.5" />
            : <p className={`text-[16px] font-bold ${(profile.strongMatches ?? 0) > 0 ? "text-[#10B981]" : "text-[#6B7280]"}`}>
                {profile.strongMatches ?? 0}
              </p>
          }
        </div>
        {profile.lastRunAt && (
          <div className="ml-auto text-right">
            <p className="text-[11px] text-[#6B7280]">Last run</p>
            <p className="text-[11px] text-[#9CA3AF]">{timeAgo(profile.lastRunAt)}</p>
          </div>
        )}
        <button
          type="button"
          onClick={toggleLogs}
          className={`flex items-center gap-1 text-[11px] transition-colors ${logsOpen ? "text-[#4F8CFF]" : "text-[#6B7280] hover:text-[#9CA3AF]"} ${profile.lastRunAt ? "" : "ml-auto"}`}
        >
          <ScrollText className="h-3.5 w-3.5" />
          Logs
          {logsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* Activity Log Panel */}
      {logsOpen && (
        <div className="mt-3 border-t border-[#1F2937] pt-3">
          <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2">Activity Log</p>
          {logsLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-[#4F8CFF]" />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-[12px] text-[#4B5563] text-center py-3">No activity yet.</p>
          ) : (
            <div className="space-y-0 max-h-64 overflow-y-auto pr-1">
              {logs.map((log, i) => {
                const detail = logDetailLine(log);
                const isLast = i === logs.length - 1;
                return (
                  <div key={log.id} className="flex gap-2.5">
                    {/* Timeline spine */}
                    <div className="flex flex-col items-center shrink-0">
                      <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#0B0F14] border border-[#1F2937]">
                        {logActionIcon(log.action)}
                      </div>
                      {!isLast && <div className="w-px flex-1 bg-[#1F2937] my-0.5" />}
                    </div>
                    <div className="pb-3 flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-[12px] font-medium text-white">{logActionLabel(log.action)}</span>
                        <span className="text-[10px] text-[#4B5563] shrink-0">{timeAgo(log.createdAt)}</span>
                      </div>
                      {detail && (
                        <p className={`text-[11px] mt-0.5 ${log.action === "run_failed" ? "text-[#EF4444]" : "text-[#6B7280]"}`}>
                          {detail}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <button
            type="button"
            onClick={loadLogs}
            className="mt-1 text-[11px] text-[#4B5563] hover:text-[#6B7280] flex items-center gap-1"
          >
            <RefreshCw className="h-2.5 w-2.5" />Refresh
          </button>
        </div>
      )}
    </Card>
  );
}

/* ──────────────── Main Tab ─────────────────────────────────── */
export function ProfilesTab() {
  const [profiles, setProfiles] = useState<SearchProfile[]>([]);
  const [connectors, setConnectors] = useState<ConnectorConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [connectorError, setConnectorError] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  async function load() {
    setLoading(true);
    setLoadError("");
    setConnectorError("");

    const [profilesResult, connectorsResult] = await Promise.allSettled([
      getProfiles(),
      getConnectors(),
    ]);

    if (profilesResult.status === "fulfilled") {
      setProfiles(profilesResult.value);
    } else {
      const msg = profilesResult.reason instanceof Error
        ? profilesResult.reason.message
        : "Could not load profiles.";
      setLoadError(msg);
    }

    if (connectorsResult.status === "fulfilled") {
      setConnectors(connectorsResult.value);
    } else {
      const msg = connectorsResult.reason instanceof Error
        ? connectorsResult.reason.message
        : "Could not load sources.";
      setConnectorError(msg);
    }

    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(data: ProfileInput) {
    const p = await createProfile(data); // throws on error — caught in ProfileForm
    setProfiles((prev) => [p, ...prev]);
    setCreating(false);
  }

  async function handleUpdate(id: string, data: ProfileInput) {
    const p = await updateProfile(id, data); // throws on error — caught in ProfileForm
    setProfiles((prev) => prev.map((x) => (x.id === id ? p : x)));
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    setActionError("");
    try {
      await deleteProfile(id);
      setProfiles((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete profile.");
    }
  }

  async function handleToggle(p: SearchProfile) {
    setActionError("");
    try {
      const updated = await updateProfile(p.id, { isActive: !p.isActive } as Partial<ProfileInput>);
      setProfiles((prev) => prev.map((x) => (x.id === p.id ? updated : x)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update profile.");
    }
  }

  async function handleRunComplete(id: string) {
    // Called by ProfileCard when a run finishes — refresh stats
    const updated = await getProfiles();
    setProfiles(updated);
  }

  /* Loading state */
  if (loading)
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-[#4F8CFF]" />
      </div>
    );

  /* Error state — can't load at all */
  if (loadError && profiles.length === 0)
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-4 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/20">
          <AlertCircle className="h-5 w-5 text-[#EF4444] shrink-0 mt-0.5" />
          <div>
            <p className="text-[14px] font-medium text-[#EF4444]">Failed to load profiles</p>
            <p className="text-[12px] text-[#EF4444]/70 mt-0.5">{loadError}</p>
            <p className="text-[12px] text-[#9CA3AF] mt-2">
              Make sure the backend is running and the database migration has been applied.
            </p>
          </div>
        </div>
        <Button
          onClick={load}
          variant="outline"
          className="border-[#374151] text-[#9CA3AF] hover:text-white"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );

  return (
    <div className="space-y-5">
      {/* Non-blocking action error (delete/toggle failed) */}
      {actionError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/20 text-[#EF4444] text-[13px]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {actionError}
          <button
            type="button"
            onClick={() => setActionError("")}
            className="ml-auto text-[#EF4444]/60 hover:text-[#EF4444]"
          >
            ×
          </button>
        </div>
      )}

      {connectorError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/20 text-[#F59E0B] text-[12px]">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          Source status could not be refreshed: {connectorError}
        </div>
      )}

      {/* Partial load error — show banner but still show cached profiles */}
      {loadError && profiles.length > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/20 text-[#F59E0B] text-[12px]">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          Refresh failed: {loadError}
          <button type="button" onClick={load} className="ml-auto underline hover:no-underline">
            Retry
          </button>
        </div>
      )}

      {/* Create new */}
      {creating ? (
        <Card className="bg-[#111827] border-[#4F8CFF]/30 p-6">
          <h3 className="text-[15px] font-semibold text-white mb-5">New Search Profile</h3>
          <ProfileForm
            initial={BLANK}
            connectors={connectors}
            onSave={handleCreate}
            onCancel={() => setCreating(false)}
          />
        </Card>
      ) : (
        <Button onClick={() => setCreating(true)} className="bg-[#4F8CFF] hover:bg-[#4F8CFF]/90 text-white">
          <Plus className="h-4 w-4 mr-2" />
          New Search Profile
        </Button>
      )}

      {/* Empty state */}
      {profiles.length === 0 && !creating && (
        <Card className="bg-[#111827] border-dashed border-[#374151] p-12 text-center">
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 rounded-xl bg-[#4F8CFF]/10 flex items-center justify-center">
              <Zap className="h-6 w-6 text-[#4F8CFF]" />
            </div>
          </div>
          <h3 className="text-[16px] font-semibold text-white mb-2">No search profiles yet</h3>
          <p className="text-[13px] text-[#6B7280] max-w-sm mx-auto mb-4">
            Create a profile to tell the agent what jobs to find, where to look,
            and how often to search — completely automatically.
          </p>
          <Button onClick={() => setCreating(true)} className="bg-[#4F8CFF] hover:bg-[#4F8CFF]/90 text-white">
            <Plus className="h-4 w-4 mr-2" />
            Create First Profile
          </Button>
        </Card>
      )}

      {/* Profile list */}
      {profiles.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {profiles.map((p) =>
            editingId === p.id ? (
              <Card key={p.id} className="bg-[#111827] border-[#4F8CFF]/30 p-6 lg:col-span-2">
                <h3 className="text-[15px] font-semibold text-white mb-5">Edit Profile</h3>
                <ProfileForm
                  initial={{
                    name: p.name,
                    jobTitles: p.jobTitles,
                    locations: p.locations,
                    remoteOnly: p.remoteOnly,
                    includeNearby: p.includeNearby,
                    salaryMin: p.salaryMin,
                    salaryMax: p.salaryMax,
                    experienceLevels: p.experienceLevels,
                    jobTypes: p.jobTypes,
                    postedWithinDays: p.postedWithinDays,
                    mustHaveKeywords: p.mustHaveKeywords,
                    niceToHaveKeywords: p.niceToHaveKeywords,
                    excludedCompanies: p.excludedCompanies,
                    includedCompanies: p.includedCompanies,
                    companySizes: p.companySizes,
                    sources: p.sources,
                    searchMode: p.searchMode,
                    scoreThreshold: p.scoreThreshold,
                    autoResume: p.autoResume,
                    schedule: p.schedule,
                    scheduleIntervalMinutes: p.scheduleIntervalMinutes,
                    isActive: p.isActive,
                  }}
                  connectors={connectors}
                  onSave={(data) => handleUpdate(p.id, data)}
                  onCancel={() => setEditingId(null)}
                />
              </Card>
            ) : (
              <ProfileCard
                key={p.id}
                profile={p}
                onEdit={() => setEditingId(p.id)}
                onDelete={() => handleDelete(p.id)}
                onToggle={() => handleToggle(p)}
                onRunComplete={() => handleRunComplete(p.id)}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
