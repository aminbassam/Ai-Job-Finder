import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router";
import {
  MapPin,
  Sparkles,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Zap,
  Loader2,
  Bookmark,
  BookmarkCheck,
  Check,
  X,
  FileText,
  Trash2,
  LayoutGrid,
  List,
  CalendarDays,
  Briefcase,
  Download,
} from "lucide-react";
import {
  getResults,
  setMatchStatus,
  generateResumeWithSelection,
  deleteMatch,
  type JobMatch,
} from "../services/agent.service";
import { applicationsService } from "../services/applications.service";
import { DocumentPreviewModal, type DocumentPreviewRef } from "../components/documents/DocumentPreviewModal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { buildJobInsights } from "../utils/job-insights";
import { ResumeGenerationDialog } from "../components/resume/ResumeGenerationDialog";

function scoreColor(score?: number): string {
  if (score == null) return "#6B7280";
  if (score >= 75) return "#22C55E";
  if (score >= 55) return "#F59E0B";
  return "#EF4444";
}

function tierLabel(tier?: string): { text: string; cls: string } {
  switch (tier) {
    case "strong":
      return { text: "Strong Match", cls: "bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30" };
    case "maybe":
      return { text: "Maybe", cls: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30" };
    case "weak":
    case "reject":
      return { text: "Weak", cls: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/30" };
    default:
      return { text: "Unscored", cls: "bg-[#374151]/50 text-[#9CA3AF] border-[#374151]" };
  }
}

function ScoreRing({ score }: { score?: number }) {
  const color = scoreColor(score);
  const radius = 20;
  const circ = 2 * Math.PI * radius;
  const pct = score != null ? Math.max(0, Math.min(100, score)) / 100 : 0;
  return (
    <div className="relative h-12 w-12 shrink-0">
      <svg width="48" height="48" viewBox="0 0 48 48" className="-rotate-90">
        <circle cx="24" cy="24" r={radius} fill="none" stroke="#1F2937" strokeWidth="4" />
        {score != null && (
          <circle
            cx="24"
            cy="24"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - pct)}
            strokeLinecap="round"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {score != null ? (
          <span className="text-[11px] font-bold" style={{ color }}>{score}</span>
        ) : (
          <span className="text-[10px] text-[#6B7280]">—</span>
        )}
      </div>
    </div>
  );
}

function ScoreBar({ value, max = 25, color }: { value: number; max?: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-[#1F2937]">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function formatShortDate(value?: string) {
  if (!value) return null;
  try {
    return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return value;
  }
}

function formatDateTime(value?: string) {
  if (!value) return null;
  try {
    return new Date(value).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function displayJobId(externalId?: string) {
  if (!externalId) return null;
  const idx = externalId.indexOf("_");
  return idx >= 0 ? externalId.slice(idx + 1) : externalId;
}

type ViewMode = "grid" | "list";

interface CardState {
  moreInfoExpanded: boolean;
  aiExpanded: boolean;
  generating: boolean;
  generated: boolean;
  generateError: string | null;
  deleting: boolean;
  deleteError: string | null;
}

function JobBoardItem({
  job,
  onStatusChange,
  onDelete,
  onApply,
  onResumeLinked,
  onOpenResume,
}: {
  job: JobMatch;
  onStatusChange: (id: string, status: JobMatch["status"]) => void;
  onDelete: (id: string) => Promise<void>;
  onApply: (id: string) => Promise<void>;
  onResumeLinked: (id: string, resume: NonNullable<JobMatch["linkedResume"]>) => void;
  onOpenResume: (doc: DocumentPreviewRef) => void;
}) {
  const navigate = useNavigate();
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [state, setState] = useState<CardState>({
    moreInfoExpanded: false,
    aiExpanded: false,
    generating: false,
    generated: job.resumeGenerated ?? false,
    generateError: null,
    deleting: false,
    deleteError: null,
  });

  const linkedResume = job.linkedResume;
  const isScoring = job.matchTier === "new" && !job.aiScore && !job.scoreBreakdown?.error;
  const hasError = !!job.scoreBreakdown?.error;
  const tier = tierLabel(hasError ? undefined : job.matchTier);
  const dismissed = job.status === "dismissed";
  const breakdown = job.scoreBreakdown;
  const insights = buildJobInsights({
    title: job.title,
    description: job.description,
    requirements: job.requirements,
    location: job.location,
    remote: job.remote,
    scoreBreakdown: breakdown,
  });
  const descriptionPreview = (job.description ?? "").replace(/\s+/g, " ").trim();
  const sourceJobId = displayJobId(job.externalId);
  const hasMoreInformation = Boolean(
    insights.roleHighlights.length > 0 ||
    insights.keyRequirements.length > 0 ||
    descriptionPreview ||
    (job.requirements && job.requirements.length > 0) ||
    job.sourceUrl ||
    sourceJobId
  );
  const hasAiAnalysis = Boolean(
    breakdown ||
    job.aiSummary ||
    insights.bestFitImprovements.length > 0 ||
    insights.keywordFocus.length > 0
  );

  const handleSave = () => {
    const next: JobMatch["status"] = job.status === "saved" ? "new" : "saved";
    onStatusChange(job.id, next);
  };

  const handleApplied = async () => {
    setState((s) => ({ ...s, generateError: null }));
    try {
      await onApply(job.id);
    } catch (err) {
      setState((s) => ({
        ...s,
        generateError: err instanceof Error ? err.message : "Failed to create application.",
      }));
    }
  };

  const handleDismiss = () => {
    onStatusChange(job.id, "dismissed");
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(`Delete "${job.title}" from your Job Board?`);
    if (!confirmed) return;

    setState((s) => ({ ...s, deleting: true, deleteError: null }));
    try {
      await onDelete(job.id);
    } catch (err) {
      setState((s) => ({
        ...s,
        deleting: false,
        deleteError: err instanceof Error ? err.message : "Failed to delete job.",
      }));
    }
  };

  const handleGenerateResume = async (selection: {
    profileIds?: string[];
    useLegacyPreferences?: boolean;
    provider: "openai" | "anthropic";
  }) => {
    setState((s) => ({ ...s, generating: true, generateError: null }));
    try {
      const result = await generateResumeWithSelection(job.id, selection);
      if (result.resume) {
        onResumeLinked(job.id, result.resume);
      }
      setShowResumeDialog(false);
      setState((s) => ({ ...s, generating: false, generated: true }));
    } catch (err) {
      setState((s) => ({
        ...s,
        generating: false,
        generateError: err instanceof Error ? err.message : "Failed to generate resume.",
      }));
    }
  };

  const resumeBlock = (
    <div className="rounded-lg border border-[#4F8CFF]/20 bg-[#0B0F14] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[#4F8CFF]">
            <FileText className="h-3.5 w-3.5" />
            Resume
          </p>
          {linkedResume ? (
            <>
              <p className="truncate text-[13px] font-medium text-white">{linkedResume.title}</p>
              <p className="mt-1 text-[11px] text-[#9CA3AF]">
                Generated for this job{linkedResume.lastModified ? ` • Updated ${formatShortDate(linkedResume.lastModified)}` : ""}
              </p>
            </>
          ) : (
            <p className="text-[12px] text-[#9CA3AF]">
              No tailored resume attached yet. Generate one from this job card when you are ready to apply.
            </p>
          )}
        </div>

        {linkedResume ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                onOpenResume({
                  id: linkedResume.id,
                  title: linkedResume.title,
                  jobTitle: job.title,
                  company: job.company,
                })
              }
              className="rounded-lg border border-[#374151] bg-[#1F2937] px-3 py-1.5 text-[12px] font-medium text-white transition-all hover:bg-[#374151]"
            >
              View
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={handleSave}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all ${
          job.status === "saved"
            ? "border-[#4F8CFF]/30 bg-[#4F8CFF]/10 text-[#4F8CFF]"
            : "border-[#374151] bg-[#1F2937] text-[#9CA3AF] hover:text-white"
        }`}
      >
        {job.status === "saved" ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
        {job.status === "saved" ? "Saved" : "Save"}
      </button>

      <button
        onClick={() => void handleApplied()}
        disabled={job.status === "applied"}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all ${
          job.status === "applied"
            ? "border-[#22C55E]/30 bg-[#22C55E]/10 text-[#22C55E]"
            : "border-[#374151] bg-[#1F2937] text-[#9CA3AF] hover:text-white"
        }`}
      >
        <Check className="h-3.5 w-3.5" />
        {job.status === "applied" ? "Applied" : "Mark Applied"}
      </button>

      <button
        onClick={handleDismiss}
        disabled={dismissed}
        className="flex items-center gap-1.5 rounded-lg border border-[#374151] bg-[#1F2937] px-3 py-1.5 text-[12px] font-medium text-[#9CA3AF] transition-all hover:border-[#EF4444]/30 hover:text-[#EF4444]"
      >
        <X className="h-3.5 w-3.5" />
        Dismiss
      </button>

      <button
        onClick={handleDelete}
        disabled={state.deleting}
        className="flex items-center gap-1.5 rounded-lg border border-[#374151] bg-[#1F2937] px-3 py-1.5 text-[12px] font-medium text-[#9CA3AF] transition-all hover:border-[#EF4444]/30 hover:text-[#EF4444] disabled:opacity-60"
      >
        {state.deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        {state.deleting ? "Deleting…" : "Delete"}
      </button>

      <button
        onClick={() => navigate(`/jobs/${job.id}`)}
        className="flex items-center gap-1.5 rounded-lg border border-[#374151] bg-[#1F2937] px-3 py-1.5 text-[12px] font-medium text-[#9CA3AF] transition-all hover:text-white"
      >
        <Briefcase className="h-3.5 w-3.5" />
        View Details
      </button>

      <div className="flex-1" />

      {linkedResume ? (
        <button
          onClick={() =>
            onOpenResume({
              id: linkedResume.id,
              title: linkedResume.title,
              jobTitle: job.title,
              company: job.company,
            })
          }
          className="flex items-center gap-1.5 rounded-lg border border-[#22C55E]/30 bg-[#22C55E]/10 px-3 py-1.5 text-[12px] font-medium text-[#22C55E] transition-all hover:bg-[#22C55E]/20"
        >
          <Download className="h-3.5 w-3.5" />
          View Resume
        </button>
      ) : (
        <button
          onClick={() => setShowResumeDialog(true)}
          disabled={state.generating}
          className="flex items-center gap-1.5 rounded-lg border border-[#4F8CFF]/30 bg-[#4F8CFF]/10 px-3 py-1.5 text-[12px] font-medium text-[#4F8CFF] transition-all hover:bg-[#4F8CFF]/20 disabled:opacity-60"
        >
          {state.generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
          {state.generating ? "Generating…" : "Generate Resume"}
        </button>
      )}
    </div>
  );

  const expandedMoreInformation = state.moreInfoExpanded && hasMoreInformation ? (
    <div className="mt-4 space-y-4">
      {insights.roleHighlights.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
            Role Highlights
          </p>
          <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-3">
            <ul className="space-y-1.5">
              {insights.roleHighlights.map((item, index) => (
                <li key={`${job.id}-highlight-${index}`} className="flex items-start gap-2 text-[12px] text-[#D1D5DB]">
                  <span className="mt-0.5 text-[#4F8CFF]">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {insights.keyRequirements.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
            Key Requirements
          </p>
          <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-3">
            <ul className="space-y-1.5">
              {insights.keyRequirements.map((item, index) => (
                <li key={`${job.id}-key-req-${index}`} className="flex items-start gap-2 text-[12px] text-[#D1D5DB]">
                  <span className="mt-0.5 text-[#4F8CFF]">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {descriptionPreview && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
            Job Description
          </p>
          <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-3">
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#D1D5DB]">
              {descriptionPreview}
            </p>
          </div>
        </div>
      )}

      {job.requirements && job.requirements.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
            Requirements
          </p>
          <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-3">
            <ul className="space-y-1.5">
              {job.requirements.map((item, index) => (
                <li key={`${job.id}-expanded-req-${index}`} className="flex items-start gap-2 text-[12px] text-[#D1D5DB]">
                  <span className="mt-0.5 text-[#4F8CFF]">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {sourceJobId && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
            Source Job ID
          </p>
          <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-3">
            <p className="break-all font-mono text-[12px] text-[#D1D5DB]">{sourceJobId}</p>
          </div>
        </div>
      )}

      {job.sourceUrl && (
        <a
          href={job.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[12px] text-[#4F8CFF] transition-colors hover:text-[#4F8CFF]/80"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          View Original Posting
        </a>
      )}
    </div>
  ) : null;

  const expandedAiAnalysis = state.aiExpanded && hasAiAnalysis ? (
    <div className="mt-4 space-y-4">
      {job.aiSummary && (
        <div className="rounded-lg border border-[#4F8CFF]/20 bg-[#0B0F14] p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-[#4F8CFF]" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[#4F8CFF]">
              AI Summary
            </span>
          </div>
          <p className="text-[13px] leading-relaxed text-[#D1D5DB]">{job.aiSummary}</p>
        </div>
      )}

      {breakdown && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Skills Match", value: breakdown.skillsMatch, color: "#4F8CFF" },
              { label: "Experience", value: breakdown.experienceMatch, color: "#8B5CF6" },
              { label: "Role Alignment", value: breakdown.roleAlignment, color: "#22C55E" },
              { label: "Location / Salary", value: breakdown.locationSalaryFit, color: "#F59E0B" },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div className="mb-1 flex justify-between">
                  <span className="text-[11px] text-[#9CA3AF]">{label}</span>
                  <span className="text-[11px] font-semibold" style={{ color }}>
                    {value ?? 0}/25
                  </span>
                </div>
                <ScoreBar value={value ?? 0} max={25} color={color} />
              </div>
            ))}
          </div>

          {breakdown.reasoning && (
            <p className="text-[12px] italic text-[#9CA3AF]">{breakdown.reasoning}</p>
          )}

          {breakdown.strengths && breakdown.strengths.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#22C55E]">Why Apply</p>
              <ul className="space-y-1">
                {breakdown.strengths.map((item, index) => (
                  <li key={index} className="flex items-start gap-2 text-[12px] text-[#D1D5DB]">
                    <span className="mt-0.5 text-[#22C55E]">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {breakdown.areasToAddress && breakdown.areasToAddress.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#FB923C]">Areas to Address</p>
              <ul className="space-y-1">
                {breakdown.areasToAddress.map((item, index) => (
                  <li key={index} className="flex items-start gap-2 text-[12px] text-[#D1D5DB]">
                    <span className="mt-0.5 text-[#FB923C]">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {breakdown.weaknesses && breakdown.weaknesses.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#F59E0B]">Concerns</p>
              <ul className="space-y-1">
                {breakdown.weaknesses.map((item, index) => (
                  <li key={index} className="flex items-start gap-2 text-[12px] text-[#D1D5DB]">
                    <span className="mt-0.5 text-[#F59E0B]">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {insights.bestFitImprovements.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#FB923C]">
            Best Fit Improvements
          </p>
          <div className="rounded-lg border border-[#FB923C]/20 bg-[#FB923C]/5 p-3">
            <ul className="space-y-1.5">
              {insights.bestFitImprovements.map((item, index) => (
                <li key={`${job.id}-improvement-${index}`} className="flex items-start gap-2 text-[12px] text-[#D1D5DB]">
                  <span className="mt-0.5 text-[#FB923C]">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {insights.keywordFocus.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
            Keywords To Mirror
          </p>
          <div className="flex flex-wrap gap-2">
            {insights.keywordFocus.map((item) => (
              <span
                key={`${job.id}-keyword-${item}`}
                className="rounded-full border border-[#374151] bg-[#1F2937] px-2 py-1 text-[11px] text-[#D1D5DB]"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  ) : null;

  return (
    <>
    <div className={`rounded-xl border border-[#1F2937] bg-[#111827] p-5 transition-all ${dismissed ? "opacity-40" : "hover:border-[#4F8CFF]/30"}`}>
      <div className="mb-4 flex items-start gap-4">
        <ScoreRing score={job.aiScore} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link to={`/jobs/${job.id}`} className="truncate text-[15px] font-semibold leading-tight text-white transition-colors hover:text-[#4F8CFF]">
                {job.title}
              </Link>
              <p className="text-[13px] text-[#9CA3AF]">{job.company}</p>
            </div>

            <div className="shrink-0">
              {isScoring ? (
                <span className="flex items-center gap-1 rounded-full border border-[#374151] bg-[#1F2937] px-2 py-1 text-[11px] text-[#6B7280]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Scoring…
                </span>
              ) : hasError ? (
                <span className="flex items-center gap-1 text-[11px] text-[#EF4444]">
                  <AlertCircle className="h-3 w-3" />
                  Error
                </span>
              ) : (
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${tier.cls}`}>
                  {tier.text}
                </span>
              )}
            </div>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[12px] text-[#6B7280]">
            {job.createdAt && (
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                Added {formatDateTime(job.createdAt)}
              </span>
            )}
            {job.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {job.location}
              </span>
            )}
            {job.jobType && (
              <span className="flex items-center gap-1">
                <Briefcase className="h-3 w-3" />
                {job.jobType}
              </span>
            )}
            {job.postedAt && (
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                Posted {formatShortDate(job.postedAt)}
              </span>
            )}
            {job.remote && (
              <span className="rounded border border-[#4F8CFF]/20 bg-[#4F8CFF]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#4F8CFF]">
                Remote
              </span>
            )}
            {(job.salaryMin || job.salaryMax) && (
              <span className="text-[#9CA3AF]">
                {[
                  job.salaryMin ? `$${Math.round(job.salaryMin / 1000)}k` : null,
                  job.salaryMax ? `$${Math.round(job.salaryMax / 1000)}k` : null,
                ].filter(Boolean).join(" – ")}
              </span>
            )}
            {job.source && (
              <span className="rounded border border-[#374151] bg-[#1F2937] px-1.5 py-0.5 text-[10px] text-[#9CA3AF]">
                {job.source}
              </span>
            )}
          </div>
        </div>
      </div>

      {hasError && (
        <p className="mb-3 flex items-start gap-1.5 text-[12px] text-[#EF4444]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {job.scoreBreakdown?.error}
        </p>
      )}

      {resumeBlock}

      <div className="mt-4 border-t border-[#1F2937] pt-4">
        {actions}
      </div>

      {state.generateError && (
        <p className="mt-3 flex items-start gap-1 text-[11px] text-[#EF4444]">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          {state.generateError}
        </p>
      )}

      {state.deleteError && (
        <p className="mt-2 flex items-start gap-1 text-[11px] text-[#EF4444]">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          {state.deleteError}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-4">
        {hasMoreInformation && (
          <button
            onClick={() => navigate(`/jobs/${job.id}#job-information`)}
            className="flex items-center gap-1 text-[11px] text-[#6B7280] transition-colors hover:text-[#9CA3AF]"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            Open More Information
          </button>
        )}
        {hasAiAnalysis && (
          <button
            onClick={() => navigate(`/jobs/${job.id}#ai-analysis`)}
            className="flex items-center gap-1 text-[11px] text-[#6B7280] transition-colors hover:text-[#9CA3AF]"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            Open AI Analysis
          </button>
        )}
      </div>
    </div>
    <ResumeGenerationDialog
      open={showResumeDialog}
      onOpenChange={setShowResumeDialog}
      jobTitle={job.title}
      company={job.company}
      generating={state.generating}
      error={state.generateError}
      onGenerate={handleGenerateResume}
    />
    </>
  );
}

function JobBoardTableRow({
  job,
  onStatusChange,
  onDelete,
  onApply,
  onResumeLinked,
  onOpenResume,
}: {
  job: JobMatch;
  onStatusChange: (id: string, status: JobMatch["status"]) => void;
  onDelete: (id: string) => Promise<void>;
  onApply: (id: string) => Promise<void>;
  onResumeLinked: (id: string, resume: NonNullable<JobMatch["linkedResume"]>) => void;
  onOpenResume: (doc: DocumentPreviewRef) => void;
}) {
  const navigate = useNavigate();
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [state, setState] = useState<CardState>({
    moreInfoExpanded: false,
    aiExpanded: false,
    generating: false,
    generated: job.resumeGenerated ?? false,
    generateError: null,
    deleting: false,
    deleteError: null,
  });

  const linkedResume = job.linkedResume;
  const isScoring = job.matchTier === "new" && !job.aiScore && !job.scoreBreakdown?.error;
  const hasError = !!job.scoreBreakdown?.error;
  const tier = tierLabel(hasError ? undefined : job.matchTier);
  const dismissed = job.status === "dismissed";
  const breakdown = job.scoreBreakdown;
  const insights = buildJobInsights({
    title: job.title,
    description: job.description,
    requirements: job.requirements,
    location: job.location,
    remote: job.remote,
    scoreBreakdown: breakdown,
  });
  const descriptionPreview = (job.description ?? "").replace(/\s+/g, " ").trim();
  const sourceJobId = displayJobId(job.externalId);
  const hasMoreInformation = Boolean(
    insights.roleHighlights.length > 0 ||
    insights.keyRequirements.length > 0 ||
    descriptionPreview ||
    (job.requirements && job.requirements.length > 0) ||
    job.sourceUrl ||
    sourceJobId
  );
  const hasAiAnalysis = Boolean(
    breakdown ||
    job.aiSummary ||
    insights.bestFitImprovements.length > 0 ||
    insights.keywordFocus.length > 0
  );
  const isExpanded =
    state.moreInfoExpanded ||
    state.aiExpanded ||
    Boolean(state.generateError) ||
    Boolean(state.deleteError);

  const handleSave = () => {
    const next: JobMatch["status"] = job.status === "saved" ? "new" : "saved";
    onStatusChange(job.id, next);
  };

  const handleApplied = async () => {
    setState((s) => ({ ...s, generateError: null }));
    try {
      await onApply(job.id);
    } catch (err) {
      setState((s) => ({
        ...s,
        generateError: err instanceof Error ? err.message : "Failed to create application.",
      }));
    }
  };

  const handleDismiss = () => {
    onStatusChange(job.id, "dismissed");
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(`Delete "${job.title}" from your Job Board?`);
    if (!confirmed) return;

    setState((s) => ({ ...s, deleting: true, deleteError: null }));
    try {
      await onDelete(job.id);
    } catch (err) {
      setState((s) => ({
        ...s,
        deleting: false,
        deleteError: err instanceof Error ? err.message : "Failed to delete job.",
      }));
    }
  };

  const handleGenerateResume = async (selection: {
    profileIds?: string[];
    useLegacyPreferences?: boolean;
    provider: "openai" | "anthropic";
  }) => {
    setState((s) => ({ ...s, generating: true, generateError: null }));
    try {
      const result = await generateResumeWithSelection(job.id, selection);
      if (result.resume) {
        onResumeLinked(job.id, result.resume);
      }
      setShowResumeDialog(false);
      setState((s) => ({ ...s, generating: false, generated: true }));
    } catch (err) {
      setState((s) => ({
        ...s,
        generating: false,
        generateError: err instanceof Error ? err.message : "Failed to generate resume.",
      }));
    }
  };

  const resumeBlock = (
    <div className="rounded-lg border border-[#4F8CFF]/20 bg-[#0B0F14] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[#4F8CFF]">
            <FileText className="h-3.5 w-3.5" />
            Resume
          </p>
          {linkedResume ? (
            <>
              <p className="truncate text-[13px] font-medium text-white">{linkedResume.title}</p>
              <p className="mt-1 text-[11px] text-[#9CA3AF]">
                Generated for this job{linkedResume.lastModified ? ` • Updated ${formatShortDate(linkedResume.lastModified)}` : ""}
              </p>
            </>
          ) : (
            <p className="text-[12px] text-[#9CA3AF]">
              No tailored resume attached yet. Generate one from this job row when you are ready to apply.
            </p>
          )}
        </div>

        {linkedResume ? (
          <button
            onClick={() =>
              onOpenResume({
                id: linkedResume.id,
                title: linkedResume.title,
                jobTitle: job.title,
                company: job.company,
              })
            }
            className="rounded-lg border border-[#374151] bg-[#1F2937] px-3 py-1.5 text-[12px] font-medium text-white transition-all hover:bg-[#374151]"
          >
            View
          </button>
        ) : null}
      </div>
    </div>
  );

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={handleSave}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all ${
          job.status === "saved"
            ? "border-[#4F8CFF]/30 bg-[#4F8CFF]/10 text-[#4F8CFF]"
            : "border-[#374151] bg-[#1F2937] text-[#9CA3AF] hover:text-white"
        }`}
      >
        {job.status === "saved" ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
        {job.status === "saved" ? "Saved" : "Save"}
      </button>

      <button
        onClick={() => void handleApplied()}
        disabled={job.status === "applied"}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all ${
          job.status === "applied"
            ? "border-[#22C55E]/30 bg-[#22C55E]/10 text-[#22C55E]"
            : "border-[#374151] bg-[#1F2937] text-[#9CA3AF] hover:text-white"
        }`}
      >
        <Check className="h-3.5 w-3.5" />
        {job.status === "applied" ? "Applied" : "Mark Applied"}
      </button>

      <button
        onClick={handleDismiss}
        disabled={dismissed}
        className="flex items-center gap-1.5 rounded-lg border border-[#374151] bg-[#1F2937] px-3 py-1.5 text-[12px] font-medium text-[#9CA3AF] transition-all hover:border-[#EF4444]/30 hover:text-[#EF4444]"
      >
        <X className="h-3.5 w-3.5" />
        Dismiss
      </button>

      <button
        onClick={handleDelete}
        disabled={state.deleting}
        className="flex items-center gap-1.5 rounded-lg border border-[#374151] bg-[#1F2937] px-3 py-1.5 text-[12px] font-medium text-[#9CA3AF] transition-all hover:border-[#EF4444]/30 hover:text-[#EF4444] disabled:opacity-60"
      >
        {state.deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        {state.deleting ? "Deleting…" : "Delete"}
      </button>

      <button
        onClick={() => navigate(`/jobs/${job.id}`)}
        className="flex items-center gap-1.5 rounded-lg border border-[#374151] bg-[#1F2937] px-3 py-1.5 text-[12px] font-medium text-[#9CA3AF] transition-all hover:text-white"
      >
        <Briefcase className="h-3.5 w-3.5" />
        View Details
      </button>
    </div>
  );

  const expandedMoreInformation = state.moreInfoExpanded && hasMoreInformation ? (
    <div className="space-y-4">
      {insights.roleHighlights.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
            Role Highlights
          </p>
          <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-3">
            <ul className="space-y-1.5">
              {insights.roleHighlights.map((item, index) => (
                <li key={`${job.id}-table-highlight-${index}`} className="flex items-start gap-2 text-[12px] text-[#D1D5DB]">
                  <span className="mt-0.5 text-[#4F8CFF]">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {insights.keyRequirements.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
            Key Requirements
          </p>
          <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-3">
            <ul className="space-y-1.5">
              {insights.keyRequirements.map((item, index) => (
                <li key={`${job.id}-table-key-req-${index}`} className="flex items-start gap-2 text-[12px] text-[#D1D5DB]">
                  <span className="mt-0.5 text-[#4F8CFF]">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {descriptionPreview && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
            Job Description
          </p>
          <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-3">
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#D1D5DB]">
              {descriptionPreview}
            </p>
          </div>
        </div>
      )}

      {job.requirements && job.requirements.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
            Requirements
          </p>
          <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-3">
            <ul className="space-y-1.5">
              {job.requirements.map((item, index) => (
                <li key={`${job.id}-table-expanded-req-${index}`} className="flex items-start gap-2 text-[12px] text-[#D1D5DB]">
                  <span className="mt-0.5 text-[#4F8CFF]">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {sourceJobId && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
            Source Job ID
          </p>
          <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-3">
            <p className="break-all font-mono text-[12px] text-[#D1D5DB]">{sourceJobId}</p>
          </div>
        </div>
      )}

      {job.sourceUrl && (
        <a
          href={job.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[12px] text-[#4F8CFF] transition-colors hover:text-[#4F8CFF]/80"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          View Original Posting
        </a>
      )}
    </div>
  ) : null;

  const expandedAiAnalysis = state.aiExpanded && hasAiAnalysis ? (
    <div className="space-y-4">
      {job.aiSummary && (
        <div className="rounded-lg border border-[#4F8CFF]/20 bg-[#0B0F14] p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-[#4F8CFF]" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[#4F8CFF]">
              AI Summary
            </span>
          </div>
          <p className="text-[13px] leading-relaxed text-[#D1D5DB]">{job.aiSummary}</p>
        </div>
      )}

      {breakdown && (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {[
              { label: "Skills Match", value: breakdown.skillsMatch, color: "#4F8CFF" },
              { label: "Experience", value: breakdown.experienceMatch, color: "#8B5CF6" },
              { label: "Role Alignment", value: breakdown.roleAlignment, color: "#22C55E" },
              { label: "Location / Salary", value: breakdown.locationSalaryFit, color: "#F59E0B" },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div className="mb-1 flex justify-between">
                  <span className="text-[11px] text-[#9CA3AF]">{label}</span>
                  <span className="text-[11px] font-semibold" style={{ color }}>
                    {value ?? 0}/25
                  </span>
                </div>
                <ScoreBar value={value ?? 0} max={25} color={color} />
              </div>
            ))}
          </div>

          {breakdown.reasoning && (
            <p className="text-[12px] italic text-[#9CA3AF]">{breakdown.reasoning}</p>
          )}

          {breakdown.strengths && breakdown.strengths.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#22C55E]">Why Apply</p>
              <ul className="space-y-1">
                {breakdown.strengths.map((item, index) => (
                  <li key={index} className="flex items-start gap-2 text-[12px] text-[#D1D5DB]">
                    <span className="mt-0.5 text-[#22C55E]">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {breakdown.areasToAddress && breakdown.areasToAddress.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#FB923C]">Areas to Address</p>
              <ul className="space-y-1">
                {breakdown.areasToAddress.map((item, index) => (
                  <li key={index} className="flex items-start gap-2 text-[12px] text-[#D1D5DB]">
                    <span className="mt-0.5 text-[#FB923C]">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {breakdown.weaknesses && breakdown.weaknesses.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#F59E0B]">Concerns</p>
              <ul className="space-y-1">
                {breakdown.weaknesses.map((item, index) => (
                  <li key={index} className="flex items-start gap-2 text-[12px] text-[#D1D5DB]">
                    <span className="mt-0.5 text-[#F59E0B]">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {insights.bestFitImprovements.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#FB923C]">Best Fit Improvements</p>
          <div className="rounded-lg border border-[#FB923C]/20 bg-[#FB923C]/5 p-3">
            <ul className="space-y-1.5">
              {insights.bestFitImprovements.map((item, index) => (
                <li key={`${job.id}-table-improvement-${index}`} className="flex items-start gap-2 text-[12px] text-[#D1D5DB]">
                  <span className="mt-0.5 text-[#FB923C]">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {insights.keywordFocus.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
            Keywords To Mirror
          </p>
          <div className="flex flex-wrap gap-2">
            {insights.keywordFocus.map((item) => (
              <span
                key={`${job.id}-table-keyword-${item}`}
                className="rounded-full border border-[#374151] bg-[#1F2937] px-2 py-1 text-[11px] text-[#D1D5DB]"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  ) : null;

  return (
    <>
      <TableRow className={`border-[#1F2937] ${dismissed ? "opacity-40" : "hover:bg-[#0B0F14]"}`}>
        <TableCell className="max-w-[420px] whitespace-normal align-top">
          <div className="space-y-2">
            <div>
              <Link to={`/jobs/${job.id}`} className="text-[14px] font-semibold text-white transition-colors hover:text-[#4F8CFF]">
                {job.title}
              </Link>
              <p className="text-[12px] text-[#9CA3AF]">{job.company || "Unknown company"}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#6B7280]">
              {job.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {job.location}
                </span>
              )}
              {job.jobType && (
                <span className="flex items-center gap-1">
                  <Briefcase className="h-3 w-3" />
                  {job.jobType}
                </span>
              )}
              {job.remote && (
                <span className="rounded border border-[#4F8CFF]/20 bg-[#4F8CFF]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#4F8CFF]">
                  Remote
                </span>
              )}
              {job.postedAt && (
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />
                  Posted {formatShortDate(job.postedAt)}
                </span>
              )}
            </div>
          </div>
        </TableCell>

        <TableCell className="align-top">
          <ScoreRing score={job.aiScore} />
        </TableCell>

        <TableCell className="align-top whitespace-normal">
          {isScoring ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#374151] bg-[#1F2937] px-2 py-1 text-[11px] text-[#6B7280]">
              <Loader2 className="h-3 w-3 animate-spin" />
              Scoring…
            </span>
          ) : hasError ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-[#EF4444]">
              <AlertCircle className="h-3 w-3" />
              Error
            </span>
          ) : (
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${tier.cls}`}>
              {tier.text}
            </span>
          )}
        </TableCell>

        <TableCell className="align-top whitespace-normal">
          <div className="space-y-2">
            {job.source && (
              <span className="inline-flex rounded border border-[#374151] bg-[#1F2937] px-1.5 py-0.5 text-[10px] text-[#9CA3AF]">
                {job.source}
              </span>
            )}
            {(job.salaryMin || job.salaryMax) && (
              <p className="text-[11px] text-[#9CA3AF]">
                {[
                  job.salaryMin ? `$${Math.round(job.salaryMin / 1000)}k` : null,
                  job.salaryMax ? `$${Math.round(job.salaryMax / 1000)}k` : null,
                ].filter(Boolean).join(" – ")}
              </p>
            )}
          </div>
        </TableCell>

        <TableCell className="align-top whitespace-normal">
          <div className="space-y-1 text-[11px] text-[#9CA3AF]">
            <p className="font-medium text-white">{formatDateTime(job.createdAt) || "Unknown"}</p>
            {job.postedAt && <p>Posted {formatShortDate(job.postedAt)}</p>}
          </div>
        </TableCell>

        <TableCell className="align-top whitespace-normal">
          {linkedResume ? (
            <div className="space-y-2">
              <p className="line-clamp-2 text-[11px] font-medium text-white">{linkedResume.title}</p>
              <button
                onClick={() =>
                  onOpenResume({
                    id: linkedResume.id,
                    title: linkedResume.title,
                    jobTitle: job.title,
                    company: job.company,
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#22C55E]/30 bg-[#22C55E]/10 px-2.5 py-1.5 text-[11px] font-medium text-[#22C55E] transition-all hover:bg-[#22C55E]/20"
              >
                <Download className="h-3.5 w-3.5" />
                View Resume
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowResumeDialog(true)}
              disabled={state.generating}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#4F8CFF]/30 bg-[#4F8CFF]/10 px-2.5 py-1.5 text-[11px] font-medium text-[#4F8CFF] transition-all hover:bg-[#4F8CFF]/20 disabled:opacity-60"
            >
              {state.generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              {state.generating ? "Generating…" : "Generate"}
            </button>
          )}
        </TableCell>

        <TableCell className="min-w-[220px] align-top whitespace-normal">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => navigate(`/jobs/${job.id}`)}
              className="inline-flex items-center gap-1 rounded-lg border border-[#374151] bg-[#1F2937] px-2.5 py-1.5 text-[11px] font-medium text-[#9CA3AF] transition-all hover:text-white"
            >
              <Briefcase className="h-3.5 w-3.5" />
              Open
            </button>
            {hasMoreInformation && (
              <button
                onClick={() => navigate(`/jobs/${job.id}#job-information`)}
                className="inline-flex items-center gap-1 rounded-lg border border-[#374151] bg-[#1F2937] px-2.5 py-1.5 text-[11px] font-medium text-[#9CA3AF] transition-all hover:text-white"
              >
                <ChevronDown className="h-3.5 w-3.5" />
                Info
              </button>
            )}
            {hasAiAnalysis && (
              <button
                onClick={() => navigate(`/jobs/${job.id}#ai-analysis`)}
                className="inline-flex items-center gap-1 rounded-lg border border-[#374151] bg-[#1F2937] px-2.5 py-1.5 text-[11px] font-medium text-[#9CA3AF] transition-all hover:text-white"
              >
                <ChevronDown className="h-3.5 w-3.5" />
                AI
              </button>
            )}
          </div>
        </TableCell>
      </TableRow>

      {isExpanded && (
        <TableRow className="border-[#1F2937] bg-[#0B0F14] hover:bg-[#0B0F14]">
          <TableCell colSpan={7} className="whitespace-normal p-4">
            <div className="space-y-4">
              {resumeBlock}

              <div className="border-t border-[#1F2937] pt-4">
                {actions}
              </div>

              {state.generateError && (
                <p className="flex items-start gap-1 text-[11px] text-[#EF4444]">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                  {state.generateError}
                </p>
              )}

              {state.deleteError && (
                <p className="flex items-start gap-1 text-[11px] text-[#EF4444]">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                  {state.deleteError}
                </p>
              )}

              {expandedMoreInformation}
              {expandedAiAnalysis}
            </div>
          </TableCell>
        </TableRow>
      )}
      <ResumeGenerationDialog
        open={showResumeDialog}
        onOpenChange={setShowResumeDialog}
        jobTitle={job.title}
        company={job.company}
        generating={state.generating}
        error={state.generateError}
        onGenerate={handleGenerateResume}
      />
    </>
  );
}

type TabId = "all" | "strong" | "maybe" | "new" | "saved" | "applied";

const TABS: { id: TabId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "strong", label: "Strong" },
  { id: "maybe", label: "Maybe" },
  { id: "new", label: "New" },
  { id: "saved", label: "Saved" },
  { id: "applied", label: "Applied" },
];

const LIMIT = 20;

function tabToQuery(tab: TabId): { tier?: string; status?: string } {
  switch (tab) {
    case "strong": return { tier: "strong" };
    case "maybe": return { tier: "maybe" };
    case "new": return { status: "new" };
    case "saved": return { status: "saved" };
    case "applied": return { status: "applied" };
    default: return {};
  }
}

function jobMatchesTab(job: JobMatch, tab: TabId): boolean {
  switch (tab) {
    case "strong":
      return job.matchTier === "strong";
    case "maybe":
      return job.matchTier === "maybe";
    case "new":
      return job.status === "new";
    case "saved":
      return job.status === "saved";
    case "applied":
      return job.status === "applied";
    default:
      return job.status !== "dismissed";
  }
}

export function JobBoard() {
  const [tab, setTab] = useState<TabId>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [jobs, setJobs] = useState<JobMatch[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});
  const [viewingResume, setViewingResume] = useState<DocumentPreviewRef | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasUnscored = jobs.some((j) => j.matchTier === "new" && !j.aiScore && !j.scoreBreakdown?.error);

  const fetchJobs = useCallback(async (reset = false, requestedOffset?: number) => {
    const currentOffset = reset ? 0 : (requestedOffset ?? offset);
    if (reset) setLoading(true);
    try {
      const q = tabToQuery(tab);
      const res = await getResults({ ...q, limit: LIMIT, offset: currentOffset });
      if (reset) {
        setJobs(res.matches);
        setOffset(LIMIT);
      } else {
        setJobs((prev) => {
          const ids = new Set(prev.map((j) => j.id));
          return [...prev, ...res.matches.filter((m) => !ids.has(m.id))];
        });
        setOffset((prev) => prev + LIMIT);
      }
      setTotal(res.total);
    } finally {
      if (reset) setLoading(false);
    }
  }, [tab, offset]);

  const silentRefresh = useCallback(async () => {
    try {
      const q = tabToQuery(tab);
      const res = await getResults({ ...q, limit: offset || LIMIT, offset: 0 });
      setJobs((prev) => {
        const map = new Map(res.matches.map((m) => [m.id, m]));
        return prev.map((j) => map.get(j.id) ?? j);
      });
      setTotal(res.total);
    } catch {
      // ignore
    }
  }, [tab, offset]);

  const refreshCounts = useCallback(async () => {
    const counts: Record<string, number> = {};
    await Promise.allSettled(
      TABS.map(async ({ id }) => {
        const q = tabToQuery(id);
        const res = await getResults({ ...q, limit: 1, offset: 0 });
        counts[id] = res.total;
      })
    );
    setTabCounts(counts);
  }, []);

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  useEffect(() => {
    setOffset(0);
    void fetchJobs(true, 0);
  }, [tab]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (hasUnscored) {
      pollRef.current = setInterval(() => {
        silentRefresh();
      }, 4000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [hasUnscored, silentRefresh]);

  const handleStatusChange = async (id: string, status: JobMatch["status"]) => {
    const previousJobs = jobs;
    const targetJob = jobs.find((job) => job.id === id);
    if (!targetJob) return;

    const updatedJob = { ...targetJob, status };
    const matchedBefore = jobMatchesTab(targetJob, tab);
    const matchesAfter = jobMatchesTab(updatedJob, tab);

    setJobs((prev) => prev.map((j) => (j.id === id ? updatedJob : j)));
    if (matchedBefore && !matchesAfter) {
      setTotal((prev) => Math.max(0, prev - 1));
    } else if (!matchedBefore && matchesAfter) {
      setTotal((prev) => prev + 1);
    }

    try {
      await setMatchStatus(id, status);
      await refreshCounts();
    } catch {
      setJobs(previousJobs);
      setTotal((prev) => {
        if (matchedBefore && !matchesAfter) return prev + 1;
        if (!matchedBefore && matchesAfter) return Math.max(0, prev - 1);
        return prev;
      });
    }
  };

  const handleApply = async (id: string) => {
    const previousJobs = jobs;
    const targetJob = jobs.find((job) => job.id === id);
    if (!targetJob) return;

    const updatedJob = { ...targetJob, status: "applied" as JobMatch["status"] };
    const matchedBefore = jobMatchesTab(targetJob, tab);
    const matchesAfter = jobMatchesTab(updatedJob, tab);

    setJobs((prev) => prev.map((job) => (job.id === id ? updatedJob : job)));
    if (matchedBefore && !matchesAfter) {
      setTotal((prev) => Math.max(0, prev - 1));
    } else if (!matchedBefore && matchesAfter) {
      setTotal((prev) => prev + 1);
    }

    try {
      await applicationsService.createFromMatch(id);
      await refreshCounts();
    } catch (err) {
      setJobs(previousJobs);
      setTotal((prev) => {
        if (matchedBefore && !matchesAfter) return prev + 1;
        if (!matchedBefore && matchesAfter) return Math.max(0, prev - 1);
        return prev;
      });
      throw err;
    }
  };

  const handleDelete = async (id: string) => {
    const previousJobs = jobs;
    const previousTotal = total;
    setJobs((prev) => prev.filter((j) => j.id !== id));
    setTotal((prev) => Math.max(0, prev - 1));

    try {
      await deleteMatch(id);
      await refreshCounts();
    } catch (err) {
      setJobs(previousJobs);
      setTotal(previousTotal);
      throw err;
    }
  };

  const handleResumeLinked = (id: string, resume: NonNullable<JobMatch["linkedResume"]>) => {
    setJobs((prev) =>
      prev.map((job) =>
        job.id === id
          ? { ...job, resumeGenerated: true, linkedResume: resume }
          : job
      )
    );
  };

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      await fetchJobs(false, offset);
    } finally {
      setLoadingMore(false);
    }
  };

  const visibleJobs = jobs.filter((job) => jobMatchesTab(job, tab));

  return (
    <div className="p-8">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="mb-1 text-[32px] font-semibold text-white">Job Board</h1>
          <p className="text-[14px] text-[#9CA3AF]">
            Review matched jobs, compare fit, and manage each tailored resume from the same workspace.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/resume"
            className="inline-flex items-center gap-2 rounded-lg border border-[#374151] bg-[#111827] px-3 py-2 text-[12px] font-medium text-[#D1D5DB] transition-all hover:border-[#4F8CFF]/30 hover:text-white"
          >
            <FileText className="h-4 w-4" />
            Open Master Resume
          </Link>

          <div className="flex items-center gap-1 rounded-lg border border-[#1F2937] bg-[#111827] p-1">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all ${
                viewMode === "grid" ? "bg-[#4F8CFF] text-white" : "text-[#9CA3AF] hover:text-white"
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              Grid
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all ${
                viewMode === "list" ? "bg-[#4F8CFF] text-white" : "text-[#9CA3AF] hover:text-white"
              }`}
            >
              <List className="h-4 w-4" />
              List
            </button>
          </div>

          {hasUnscored && (
            <div className="flex items-center gap-2 rounded-lg border border-[#F59E0B]/20 bg-[#F59E0B]/10 px-3 py-2 text-[12px] text-[#F59E0B]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Scoring jobs…
            </div>
          )}
        </div>
      </div>

      <div className="mb-6 border-b border-[#1F2937]">
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-[13px] font-medium transition-all ${
                tab === id ? "border-[#4F8CFF] text-[#4F8CFF]" : "border-transparent text-[#6B7280] hover:text-white"
              }`}
            >
              {label}
              {tabCounts[id] != null && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                  tab === id ? "bg-[#4F8CFF]/20 text-[#4F8CFF]" : "bg-[#1F2937] text-[#6B7280]"
                }`}>
                  {tabCounts[id]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-[#4F8CFF]" />
        </div>
      ) : visibleJobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          {tab === "all" ? (
            <>
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#4F8CFF]/10">
                <Zap className="h-8 w-8 text-[#4F8CFF]" />
              </div>
              <h3 className="mb-2 text-[18px] font-semibold text-white">No jobs yet</h3>
              <p className="mb-5 max-w-sm text-[14px] text-[#9CA3AF]">
                Run your agent or import jobs manually to start reviewing matches and generating tailored resumes.
              </p>
              <Link
                to="/agent"
                className="inline-flex items-center gap-2 rounded-lg bg-[#4F8CFF] px-5 py-2.5 text-[13px] font-medium text-white transition-all hover:bg-[#4F8CFF]/90"
              >
                <Zap className="h-4 w-4" />
                Go to Agent
              </Link>
            </>
          ) : (
            <>
              <p className="mb-1 text-[15px] font-medium text-white">No jobs in this category</p>
              <p className="text-[13px] text-[#9CA3AF]">
                Try a different tab or run your agent to find more matches.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {visibleJobs.map((job) => (
                <JobBoardItem
                  key={job.id}
                  job={job}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDelete}
                  onApply={handleApply}
                  onResumeLinked={handleResumeLinked}
                  onOpenResume={setViewingResume}
                />
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[#1F2937] bg-[#111827]">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1F2937] hover:bg-transparent">
                    <TableHead className="h-12 text-[#9CA3AF]">Job</TableHead>
                    <TableHead className="h-12 text-[#9CA3AF]">Score</TableHead>
                    <TableHead className="h-12 text-[#9CA3AF]">Match</TableHead>
                    <TableHead className="h-12 text-[#9CA3AF]">Source</TableHead>
                    <TableHead className="h-12 text-[#9CA3AF]">Added</TableHead>
                    <TableHead className="h-12 text-[#9CA3AF]">Resume</TableHead>
                    <TableHead className="h-12 text-[#9CA3AF]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleJobs.map((job) => (
                    <JobBoardTableRow
                      key={job.id}
                      job={job}
                      onStatusChange={handleStatusChange}
                      onDelete={handleDelete}
                      onApply={handleApply}
                      onResumeLinked={handleResumeLinked}
                      onOpenResume={setViewingResume}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {jobs.length < total && (
            <div className="mt-8 flex justify-center">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 rounded-lg border border-[#374151] bg-[#1F2937] px-6 py-2.5 text-[13px] font-medium text-white transition-all disabled:opacity-60 hover:bg-[#374151]"
              >
                {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loadingMore ? "Loading…" : `Load More (${total - jobs.length} remaining)`}
              </button>
            </div>
          )}
        </>
      )}

      {viewingResume && (
        <DocumentPreviewModal doc={viewingResume} onClose={() => setViewingResume(null)} />
      )}
    </div>
  );
}
