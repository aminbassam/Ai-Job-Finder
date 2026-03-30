import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
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
  generateCoverLetter,
  deleteMatch,
  bulkDeleteMatches,
  type JobMatch,
} from "../services/agent.service";
import { masterResumeService, type MatchedJobSuggestion } from "../services/masterResume.service";
import { applicationsService } from "../services/applications.service";
import { DocumentPreviewModal, type DocumentPreviewRef } from "../components/documents/DocumentPreviewModal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { buildJobInsights } from "../utils/job-insights";
import { ResumeGenerationDialog } from "../components/resume/ResumeGenerationDialog";
import { useConfirmationDialog } from "../components/ui/confirmation-dialog";

const CONNECTOR_NAMES: Record<string, string> = {
  remotive: "Remotive",
  arbeitnow: "Arbeitnow",
  linkedin: "LinkedIn",
  indeed: "Indeed",
  glassdoor: "Glassdoor",
  ziprecruiter: "ZipRecruiter",
  usajobs: "USAJobs",
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  upwork: "Upwork",
  gmail: "Gmail",
  builtinaustin: "Built In Austin",
};

const EXTENSION_CAPTURE_SOURCES = new Set([
  "linkedin",
  "indeed",
  "glassdoor",
  "ziprecruiter",
  "lever",
  "greenhouse",
  "workday",
]);

function formatSource(job: Pick<JobMatch, "source" | "profileId">): { label: string; cls: string } {
  if (!job.source) return { label: "Unknown", cls: "bg-[#1F2937] text-[#6B7280] border-[#374151]" };
  if (job.source === "manual")
    return { label: "Manual", cls: "bg-[#374151] text-[#9CA3AF] border-[#4B5563]" };
  if (job.source === "extension")
    return { label: "Extension", cls: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/25" };
  if (!job.profileId && EXTENSION_CAPTURE_SOURCES.has(job.source)) {
    const sourceName = CONNECTOR_NAMES[job.source] ?? job.source.charAt(0).toUpperCase() + job.source.slice(1);
    return { label: `Extension · ${sourceName}`, cls: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/25" };
  }
  const connectorName = CONNECTOR_NAMES[job.source] ?? job.source.charAt(0).toUpperCase() + job.source.slice(1);
  return { label: `Agent · ${connectorName}`, cls: "bg-[#4F8CFF]/10 text-[#4F8CFF] border-[#4F8CFF]/20" };
}

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
type TabId = "all" | "strong" | "maybe" | "new" | "saved" | "applied";
type ScoreFilter = "all" | "75" | "60" | "40";
type AddedFilter = "all" | "1h" | "6h" | "12h" | "24h" | "48h" | "72h" | "7d" | "14d" | "30d" | "90d";
type SortMode = "match" | "recent" | "oldest" | "score-high" | "score-low";

function shouldLinkAiSettings(message?: string | null) {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return (
    normalized.includes("ai provider") ||
    normalized.includes("api key") ||
    normalized.includes("connect and select an ai provider") ||
    normalized.includes("provider first")
  );
}

function InlineJobError({ message }: { message?: string | null }) {
  if (!message) return null;

  return (
    <div className="flex items-start gap-2 text-[11px] text-[#EF4444]">
      <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
      <div className="space-y-1">
        <p>{message}</p>
        {shouldLinkAiSettings(message) && (
          <Link
            to="/settings?tab=ai"
            className="inline-flex font-medium text-[#FCA5A5] underline underline-offset-2 transition-colors hover:text-white"
          >
            Open AI Settings
          </Link>
        )}
      </div>
    </div>
  );
}

interface CardState {
  moreInfoExpanded: boolean;
  aiExpanded: boolean;
  generating: boolean;
  generatingCoverLetter: boolean;
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
  onCoverLetterLinked,
  onOpenResume,
}: {
  job: JobMatch;
  onStatusChange: (id: string, status: JobMatch["status"]) => void;
  onDelete: (id: string) => Promise<void>;
  onApply: (id: string) => Promise<void>;
  onResumeLinked: (id: string, resume: NonNullable<JobMatch["linkedResume"]>) => void;
  onCoverLetterLinked: (id: string, coverLetter: NonNullable<JobMatch["linkedCoverLetter"]>) => void;
  onOpenResume: (doc: DocumentPreviewRef) => void;
}) {
  const navigate = useNavigate();
  const { confirm, confirmationDialog } = useConfirmationDialog();
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [state, setState] = useState<CardState>({
    moreInfoExpanded: false,
    aiExpanded: false,
    generating: false,
    generatingCoverLetter: false,
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

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: "Delete this job?",
      description: `This will remove "${job.title}" from your Job Board.`,
      confirmLabel: "Delete Job",
      cancelLabel: "Cancel",
      variant: "destructive",
    });
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

  const handleGenerateCoverLetter = async () => {
    setState((s) => ({ ...s, generatingCoverLetter: true, generateError: null }));
    try {
      const result = await generateCoverLetter(job.id);
      if (result.coverLetter) {
        onCoverLetterLinked(job.id, result.coverLetter);
      }
    } catch (err) {
      setState((s) => ({
        ...s,
        generateError: err instanceof Error ? err.message : "Failed to generate cover letter.",
      }));
    } finally {
      setState((s) => ({ ...s, generatingCoverLetter: false }));
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

  const coverLetterBlock = (
    <div className="rounded-lg border border-[#1D4ED8]/20 bg-[#0B0F14] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[#93C5FD]">
            <Sparkles className="h-3.5 w-3.5" />
            Cover Letter
          </p>
          {job.linkedCoverLetter ? (
            <>
              <p className="truncate text-[13px] font-medium text-white">{job.linkedCoverLetter.title}</p>
              <p className="mt-1 text-[11px] text-[#9CA3AF]">
                Generated for this job{job.linkedCoverLetter.lastModified ? ` • Updated ${formatShortDate(job.linkedCoverLetter.lastModified)}` : ""}
              </p>
            </>
          ) : (
            <p className="text-[12px] text-[#9CA3AF]">
              No cover letter attached yet. Generate one directly from this job card when you are ready.
            </p>
          )}
        </div>

        {job.linkedCoverLetter ? (
          <button
            onClick={() =>
              onOpenResume({
                id: job.linkedCoverLetter!.id,
                title: job.linkedCoverLetter!.title,
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

      {job.linkedCoverLetter ? (
        <button
          onClick={() =>
            onOpenResume({
              id: job.linkedCoverLetter!.id,
              title: job.linkedCoverLetter!.title,
              jobTitle: job.title,
              company: job.company,
            })
          }
          className="flex items-center gap-1.5 rounded-lg border border-[#1D4ED8]/30 bg-[#1D4ED8]/10 px-3 py-1.5 text-[12px] font-medium text-[#93C5FD] transition-all hover:bg-[#1D4ED8]/20"
        >
          <Download className="h-3.5 w-3.5" />
          View Cover Letter
        </button>
      ) : (
        <button
          onClick={() => void handleGenerateCoverLetter()}
          disabled={state.generatingCoverLetter}
          className="flex items-center gap-1.5 rounded-lg border border-[#1D4ED8]/30 bg-[#1D4ED8]/10 px-3 py-1.5 text-[12px] font-medium text-[#93C5FD] transition-all hover:bg-[#1D4ED8]/20 disabled:opacity-60"
        >
          {state.generatingCoverLetter ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {state.generatingCoverLetter ? "Generating…" : "Generate Cover Letter"}
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
              <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${formatSource(job).cls}`}>
                {formatSource(job).label}
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

      <div className="space-y-3">
        {resumeBlock}
        {coverLetterBlock}
      </div>

      <div className="mt-4 border-t border-[#1F2937] pt-4">
        {actions}
      </div>

      {state.generateError && <div className="mt-3"><InlineJobError message={state.generateError} /></div>}

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
    {confirmationDialog}
    </>
  );
}

function JobBoardTableRow({
  job,
  isSelected,
  onToggleSelect,
  onStatusChange,
  onDelete,
  onApply,
  onResumeLinked,
  onCoverLetterLinked,
  onOpenResume,
}: {
  job: JobMatch;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onStatusChange: (id: string, status: JobMatch["status"]) => void;
  onDelete: (id: string) => Promise<void>;
  onApply: (id: string) => Promise<void>;
  onResumeLinked: (id: string, resume: NonNullable<JobMatch["linkedResume"]>) => void;
  onCoverLetterLinked: (id: string, coverLetter: NonNullable<JobMatch["linkedCoverLetter"]>) => void;
  onOpenResume: (doc: DocumentPreviewRef) => void;
}) {
  const navigate = useNavigate();
  const { confirm, confirmationDialog } = useConfirmationDialog();
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [state, setState] = useState<CardState>({
    moreInfoExpanded: false,
    aiExpanded: false,
    generating: false,
    generatingCoverLetter: false,
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

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: "Delete this job?",
      description: `This will remove "${job.title}" from your Job Board.`,
      confirmLabel: "Delete Job",
      cancelLabel: "Cancel",
      variant: "destructive",
    });
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

  const handleGenerateCoverLetter = async () => {
    setState((s) => ({ ...s, generatingCoverLetter: true, generateError: null }));
    try {
      const result = await generateCoverLetter(job.id);
      if (result.coverLetter) {
        onCoverLetterLinked(job.id, result.coverLetter);
      }
    } catch (err) {
      setState((s) => ({
        ...s,
        generateError: err instanceof Error ? err.message : "Failed to generate cover letter.",
      }));
    } finally {
      setState((s) => ({ ...s, generatingCoverLetter: false }));
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
      <TableRow className={`border-[#1F2937] ${dismissed ? "opacity-40" : "hover:bg-[#0B0F14]"} ${isSelected ? "bg-[#4F8CFF]/5" : ""}`}>
        <TableCell className="w-10 pl-4 align-top">
          <input
            type="checkbox"
            checked={isSelected ?? false}
            onChange={() => onToggleSelect?.(job.id)}
            className="mt-1 h-4 w-4 cursor-pointer rounded border-[#374151] accent-[#4F8CFF]"
          />
        </TableCell>
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
              <span
                className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium ${formatSource(job).cls}`}
              >
                {formatSource(job).label}
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
              {job.linkedCoverLetter ? (
                <button
                  onClick={() =>
                    onOpenResume({
                      id: job.linkedCoverLetter!.id,
                      title: job.linkedCoverLetter!.title,
                      jobTitle: job.title,
                      company: job.company,
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#1D4ED8]/30 bg-[#1D4ED8]/10 px-2.5 py-1.5 text-[11px] font-medium text-[#93C5FD] transition-all hover:bg-[#1D4ED8]/20"
                >
                  <Download className="h-3.5 w-3.5" />
                  View Cover Letter
                </button>
              ) : (
                <button
                  onClick={() => void handleGenerateCoverLetter()}
                  disabled={state.generatingCoverLetter}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#1D4ED8]/30 bg-[#1D4ED8]/10 px-2.5 py-1.5 text-[11px] font-medium text-[#93C5FD] transition-all hover:bg-[#1D4ED8]/20 disabled:opacity-60"
                >
                  {state.generatingCoverLetter ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {state.generatingCoverLetter ? "Generating…" : "Cover Letter"}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={() => setShowResumeDialog(true)}
                disabled={state.generating}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#4F8CFF]/30 bg-[#4F8CFF]/10 px-2.5 py-1.5 text-[11px] font-medium text-[#4F8CFF] transition-all hover:bg-[#4F8CFF]/20 disabled:opacity-60"
              >
                {state.generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                {state.generating ? "Generating…" : "Resume"}
              </button>
              {job.linkedCoverLetter ? (
                <button
                  onClick={() =>
                    onOpenResume({
                      id: job.linkedCoverLetter!.id,
                      title: job.linkedCoverLetter!.title,
                      jobTitle: job.title,
                      company: job.company,
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#1D4ED8]/30 bg-[#1D4ED8]/10 px-2.5 py-1.5 text-[11px] font-medium text-[#93C5FD] transition-all hover:bg-[#1D4ED8]/20"
                >
                  <Download className="h-3.5 w-3.5" />
                  Cover Letter
                </button>
              ) : (
                <button
                  onClick={() => void handleGenerateCoverLetter()}
                  disabled={state.generatingCoverLetter}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#1D4ED8]/30 bg-[#1D4ED8]/10 px-2.5 py-1.5 text-[11px] font-medium text-[#93C5FD] transition-all hover:bg-[#1D4ED8]/20 disabled:opacity-60"
                >
                  {state.generatingCoverLetter ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {state.generatingCoverLetter ? "Generating…" : "Cover Letter"}
                </button>
              )}
            </div>
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
          <TableCell colSpan={8} className="whitespace-normal p-4">
            <div className="space-y-4">
              <div className="space-y-3">
                {resumeBlock}
                {coverLetterBlock}
              </div>

              <div className="border-t border-[#1F2937] pt-4">
                {actions}
              </div>

              {state.generateError && <InlineJobError message={state.generateError} />}

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
      {confirmationDialog}
    </>
  );
}

const TABS: { id: TabId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "strong", label: "Strong" },
  { id: "maybe", label: "Maybe" },
  { id: "new", label: "New" },
  { id: "saved", label: "Saved" },
  { id: "applied", label: "Applied" },
];

const LIMIT = 20;

function tabToQuery(tab: TabId): { tier?: string; status?: string; createdWithinHours?: number } {
  switch (tab) {
    case "strong": return { tier: "strong" };
    case "maybe": return { tier: "maybe" };
    case "new": return { status: "new", createdWithinHours: 24 };
    case "saved": return { status: "saved" };
    case "applied": return { status: "applied" };
    default: return {};
  }
}

function isRecentWithinHours(value: string | undefined, hours: number) {
  if (!value) return false;
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) return false;
  return Date.now() - parsed <= hours * 60 * 60 * 1000;
}

function jobMatchesTab(job: JobMatch, tab: TabId): boolean {
  switch (tab) {
    case "strong":
      return job.matchTier === "strong";
    case "maybe":
      return job.matchTier === "maybe";
    case "new":
      return job.status === "new" && isRecentWithinHours(job.createdAt, 24);
    case "saved":
      return job.status === "saved";
    case "applied":
      return job.status === "applied";
    default:
      return job.status !== "dismissed";
  }
}

function parseTab(value: string | null): TabId {
  return TABS.some((tab) => tab.id === value) ? (value as TabId) : "all";
}

function parseViewMode(value: string | null): ViewMode {
  return value === "list" ? "list" : "grid";
}

function parseScoreFilter(value: string | null): ScoreFilter {
  return value === "75" || value === "60" || value === "40" ? value : "all";
}

function parseAddedFilter(value: string | null): AddedFilter {
  return value === "1h" ||
    value === "6h" ||
    value === "12h" ||
    value === "24h" ||
    value === "48h" ||
    value === "72h" ||
    value === "7d" ||
    value === "14d" ||
    value === "30d" ||
    value === "90d"
    ? value
    : "all";
}

function parseSortMode(value: string | null): SortMode {
  return value === "recent" || value === "oldest" || value === "score-high" || value === "score-low"
    ? value
    : "match";
}

function scoreMinForFilter(scoreFilter: ScoreFilter): number | undefined {
  if (scoreFilter === "75" || scoreFilter === "60" || scoreFilter === "40") return Number(scoreFilter);
  return undefined;
}

function hoursForAddedFilter(addedFilter: AddedFilter): number | undefined {
  switch (addedFilter) {
    case "1h": return 1;
    case "6h": return 6;
    case "12h": return 12;
    case "24h": return 24;
    case "48h": return 48;
    case "72h": return 72;
    case "3d": return 72;
    case "7d": return 168;
    case "14d": return 336;
    case "30d": return 720;
    case "90d": return 2160;
    default: return undefined;
  }
}

function normalizeResumeMatchedJob(job: MatchedJobSuggestion): JobMatch {
  return {
    id: job.id,
    source: job.source,
    sourceUrl: job.sourceUrl,
    title: job.title,
    company: job.company,
    location: job.location,
    remote: job.remote,
    aiScore: job.aiScore,
    aiSummary: job.aiSummary,
    scoreBreakdown: job.scoreBreakdown,
    matchTier: job.matchTier as JobMatch["matchTier"],
    status: job.status as JobMatch["status"],
    linkedResume: job.linkedResume
      ? {
          id: job.linkedResume.id,
          title: job.linkedResume.title,
          lastModified: job.linkedResume.lastModified,
          resumeType: job.linkedResume.resumeType as "master" | "tailored" | undefined,
        }
      : undefined,
    postedAt: job.postedAt,
    createdAt: job.createdAt,
  };
}

function jobPassesFilters(job: JobMatch, filters: {
  source: string;
  score: ScoreFilter;
  added: AddedFilter;
}) {
  if (filters.source !== "all" && job.source !== filters.source) {
    return false;
  }

  const minScore = scoreMinForFilter(filters.score);
  if (minScore != null && (job.aiScore ?? 0) < minScore) {
    return false;
  }

  const addedHours = hoursForAddedFilter(filters.added);
  if (addedHours != null && !isRecentWithinHours(job.createdAt, addedHours)) {
    return false;
  }

  return true;
}

export function JobBoard() {
  const { confirm, confirmationDialog } = useConfirmationDialog();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<TabId>(() => parseTab(searchParams.get("tab")));
  const [viewMode, setViewMode] = useState<ViewMode>(() => parseViewMode(searchParams.get("view")));
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>(() => parseScoreFilter(searchParams.get("score")));
  const [addedFilter, setAddedFilter] = useState<AddedFilter>(() => parseAddedFilter(searchParams.get("added")));
  const [sourceFilter, setSourceFilter] = useState<string>(() => searchParams.get("source") ?? "all");
  const [sortMode, setSortMode] = useState<SortMode>(() => parseSortMode(searchParams.get("sort")));
  const [jobs, setJobs] = useState<JobMatch[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});
  const [viewingDocument, setViewingDocument] = useState<DocumentPreviewRef | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeProfileId = searchParams.get("profileId") || undefined;
  const activeProfileName = searchParams.get("profileName") || "";
  const activeResumeProfileId = searchParams.get("resumeProfileId") || undefined;
  const activeResumeProfileName = searchParams.get("resumeProfileName") || "";

  const hasUnscored = jobs.some((j) => j.matchTier === "new" && !j.aiScore && !j.scoreBreakdown?.error);

  const updateSearch = useCallback((next: {
    tab?: TabId;
    view?: ViewMode;
    profileId?: string;
    profileName?: string;
    resumeProfileId?: string;
    resumeProfileName?: string;
    score?: ScoreFilter;
    added?: AddedFilter;
    source?: string;
    sort?: SortMode;
  }) => {
    const params = new URLSearchParams(searchParams);
    if (next.tab) params.set("tab", next.tab);
    if (next.view) params.set("view", next.view);
    if (next.profileId) params.set("profileId", next.profileId);
    if (next.profileName) params.set("profileName", next.profileName);
    if (next.resumeProfileId) params.set("resumeProfileId", next.resumeProfileId);
    if (next.resumeProfileName) params.set("resumeProfileName", next.resumeProfileName);
    if (next.score && next.score !== "all") params.set("score", next.score); else if (next.score) params.delete("score");
    if (next.added && next.added !== "all") params.set("added", next.added); else if (next.added) params.delete("added");
    if (next.source && next.source !== "all") params.set("source", next.source); else if (next.source) params.delete("source");
    if (next.sort && next.sort !== "match") params.set("sort", next.sort); else if (next.sort) params.delete("sort");
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const nextTab = parseTab(searchParams.get("tab"));
    const nextView = parseViewMode(searchParams.get("view"));
    const nextScore = parseScoreFilter(searchParams.get("score"));
    const nextAdded = parseAddedFilter(searchParams.get("added"));
    const nextSource = searchParams.get("source") ?? "all";
    const nextSort = parseSortMode(searchParams.get("sort"));
    setTab((current) => current === nextTab ? current : nextTab);
    setViewMode((current) => current === nextView ? current : nextView);
    setScoreFilter((current) => current === nextScore ? current : nextScore);
    setAddedFilter((current) => current === nextAdded ? current : nextAdded);
    setSourceFilter((current) => current === nextSource ? current : nextSource);
    setSortMode((current) => current === nextSort ? current : nextSort);
  }, [searchParams]);

  const fetchJobs = useCallback(async (reset = false, requestedOffset?: number) => {
    const currentOffset = reset ? 0 : (requestedOffset ?? offset);
    if (reset) setLoading(true);
    try {
      if (activeResumeProfileId) {
        const matchedJobs = await masterResumeService.getMatchedJobs(activeResumeProfileId);
        const normalized = matchedJobs.map(normalizeResumeMatchedJob);
        setJobs(normalized);
        setOffset(normalized.length);
        setTotal(normalized.length);
        return;
      }

      const q = tabToQuery(tab);
      const res = await getResults({
        ...q,
        profileId: activeProfileId,
        source: sourceFilter !== "all" ? sourceFilter : undefined,
        sort: sortMode === "match" ? undefined : sortMode,
        scoreMin: scoreMinForFilter(scoreFilter),
        createdWithinHours: q.createdWithinHours ?? hoursForAddedFilter(addedFilter),
        limit: LIMIT,
        offset: currentOffset,
      });
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
  }, [tab, offset, activeProfileId, activeResumeProfileId, sourceFilter, sortMode, scoreFilter, addedFilter]);

  const silentRefresh = useCallback(async () => {
    try {
      if (activeResumeProfileId) {
        const matchedJobs = await masterResumeService.getMatchedJobs(activeResumeProfileId);
        setJobs(matchedJobs.map(normalizeResumeMatchedJob));
        setTotal(matchedJobs.length);
        return;
      }

      const q = tabToQuery(tab);
      const res = await getResults({
        ...q,
        profileId: activeProfileId,
        source: sourceFilter !== "all" ? sourceFilter : undefined,
        sort: sortMode === "match" ? undefined : sortMode,
        scoreMin: scoreMinForFilter(scoreFilter),
        createdWithinHours: q.createdWithinHours ?? hoursForAddedFilter(addedFilter),
        limit: offset || LIMIT,
        offset: 0,
      });
      setJobs((prev) => {
        const map = new Map(res.matches.map((m) => [m.id, m]));
        return prev.map((j) => map.get(j.id) ?? j);
      });
      setTotal(res.total);
    } catch {
      // ignore
    }
  }, [tab, offset, activeProfileId, activeResumeProfileId, sourceFilter, sortMode, scoreFilter, addedFilter]);

  const refreshCounts = useCallback(async () => {
    if (activeResumeProfileId) {
      const counts: Record<string, number> = {};
      TABS.forEach(({ id }) => {
        counts[id] = jobs.filter((job) =>
          jobMatchesTab(job, id) &&
          jobPassesFilters(job, {
            source: sourceFilter,
            score: scoreFilter,
            added: addedFilter,
          })
        ).length;
      });
      setTabCounts(counts);
      return;
    }

    const counts: Record<string, number> = {};
    await Promise.allSettled(
      TABS.map(async ({ id }) => {
        const q = tabToQuery(id);
        const res = await getResults({
          ...q,
          profileId: activeProfileId,
          source: sourceFilter !== "all" ? sourceFilter : undefined,
          scoreMin: scoreMinForFilter(scoreFilter),
          createdWithinHours: q.createdWithinHours ?? hoursForAddedFilter(addedFilter),
          limit: 1,
          offset: 0,
        });
        counts[id] = res.total;
      })
    );
    setTabCounts(counts);
  }, [activeProfileId, activeResumeProfileId, jobs, sourceFilter, scoreFilter, addedFilter]);

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  useEffect(() => {
    setSelectedIds(new Set());
    setOffset(0);
    void fetchJobs(true, 0);
  }, [tab, activeProfileId, activeResumeProfileId, scoreFilter, addedFilter, sourceFilter, sortMode]);

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

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const confirmed = await confirm({
      title: `Delete ${selectedIds.size} job${selectedIds.size > 1 ? "s" : ""}?`,
      description: `This will permanently remove ${selectedIds.size} selected job${selectedIds.size > 1 ? "s" : ""} from your Job Board.`,
      confirmLabel: selectedIds.size > 1 ? "Delete Jobs" : "Delete Job",
      cancelLabel: "Cancel",
      variant: "destructive",
    });
    if (!confirmed) return;
    const ids = Array.from(selectedIds);
    setJobs((prev) => prev.filter((j) => !selectedIds.has(j.id)));
    setTotal((prev) => Math.max(0, prev - ids.length));
    setSelectedIds(new Set());
    try {
      await bulkDeleteMatches(ids);
      await refreshCounts();
    } catch {
      void fetchJobs(true, 0);
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

  const handleCoverLetterLinked = (id: string, coverLetter: NonNullable<JobMatch["linkedCoverLetter"]>) => {
    setJobs((prev) =>
      prev.map((job) =>
        job.id === id
          ? { ...job, linkedCoverLetter: coverLetter }
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

  const sourceOptions = useMemo(() => {
    return Array.from(new Set(jobs.map((job) => job.source).filter(Boolean))).sort();
  }, [jobs]);

  const visibleJobs = useMemo(() => {
    const filtered = jobs.filter((job) =>
      jobMatchesTab(job, tab) &&
      jobPassesFilters(job, {
        source: sourceFilter,
        score: scoreFilter,
        added: addedFilter,
      })
    );

    if (activeResumeProfileId && sortMode === "match") {
      return filtered;
    }
    if (sortMode === "recent") {
      return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    if (sortMode === "oldest") {
      return filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }
    if (sortMode === "score-high" || sortMode === "match") {
      return filtered.sort((a, b) => (b.aiScore ?? 0) - (a.aiScore ?? 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    if (sortMode === "score-low") {
      return filtered.sort((a, b) => (a.aiScore ?? 0) - (b.aiScore ?? 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    return filtered;
  }, [jobs, tab, sourceFilter, scoreFilter, addedFilter, sortMode, activeResumeProfileId]);
  const allVisibleSelected = visibleJobs.length > 0 && visibleJobs.every((j) => selectedIds.has(j.id));
  const someVisibleSelected = visibleJobs.some((j) => selectedIds.has(j.id));

  const handleToggleAll = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleJobs.forEach((j) => next.delete(j.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleJobs.forEach((j) => next.add(j.id));
        return next;
      });
    }
  };

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
              onClick={() => {
                setViewMode("grid");
                updateSearch({ view: "grid" });
              }}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all ${
                viewMode === "grid" ? "bg-[#4F8CFF] text-white" : "text-[#9CA3AF] hover:text-white"
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              Grid
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode("list");
                updateSearch({ view: "list" });
              }}
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

      {activeProfileId && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-[#4F8CFF]/20 bg-[#4F8CFF]/10 px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#4F8CFF]">Profile Filter</p>
            <p className="text-[13px] text-white">
              Showing jobs found by {activeProfileName || "this search profile"} in {viewMode === "list" ? "table" : "grid"} view.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams(searchParams);
              params.delete("profileId");
              params.delete("profileName");
              setSearchParams(params, { replace: true });
            }}
            className="ml-auto rounded-lg border border-[#374151] bg-[#111827] px-3 py-1.5 text-[12px] font-medium text-[#D1D5DB] transition-all hover:border-[#4F8CFF]/30 hover:text-white"
          >
            Clear Filter
          </button>
        </div>
      )}

      {activeResumeProfileId && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-[#22C55E]/20 bg-[#22C55E]/10 px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#86EFAC]">Resume Match Filter</p>
            <p className="text-[13px] text-white">
              Showing Job Board matches ranked for {activeResumeProfileName || "this resume profile"}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams(searchParams);
              params.delete("resumeProfileId");
              params.delete("resumeProfileName");
              setSearchParams(params, { replace: true });
            }}
            className="ml-auto rounded-lg border border-[#374151] bg-[#111827] px-3 py-1.5 text-[12px] font-medium text-[#D1D5DB] transition-all hover:border-[#22C55E]/30 hover:text-white"
          >
            Clear Resume Filter
          </button>
        </div>
      )}

      <div className="mb-6 rounded-xl border border-[#1F2937] bg-[#111827] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold text-white">Filters</p>
            <p className="text-[12px] text-[#6B7280]">Narrow jobs by freshness, score quality, source, and sort order.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setScoreFilter("all");
              setAddedFilter("all");
              setSourceFilter("all");
              setSortMode("match");
              updateSearch({ score: "all", added: "all", source: "all", sort: "match" });
            }}
            className="text-[12px] text-[#6B7280] transition-colors hover:text-white"
          >
            Reset filters
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1">
            <span className="text-[11px] uppercase tracking-wide text-[#6B7280]">Added</span>
            <select
              value={addedFilter}
              onChange={(event) => {
                const next = event.target.value as AddedFilter;
                setAddedFilter(next);
                updateSearch({ added: next });
              }}
              className="w-full rounded-lg border border-[#374151] bg-[#0B0F14] px-3 py-2 text-[13px] text-white"
            >
              <option value="all">Any time</option>
              <option value="1h">Last 1 hour</option>
              <option value="6h">Last 6 hours</option>
              <option value="12h">Last 12 hours</option>
              <option value="24h">Last 24 hours</option>
              <option value="48h">Last 48 hours</option>
              <option value="72h">Last 72 hours</option>
              <option value="3d">Last 3 days</option>
              <option value="7d">Last 7 days</option>
              <option value="14d">Last 14 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-[11px] uppercase tracking-wide text-[#6B7280]">Match score</span>
            <select
              value={scoreFilter}
              onChange={(event) => {
                const next = event.target.value as ScoreFilter;
                setScoreFilter(next);
                updateSearch({ score: next });
              }}
              className="w-full rounded-lg border border-[#374151] bg-[#0B0F14] px-3 py-2 text-[13px] text-white"
            >
              <option value="all">Any score</option>
              <option value="75">75 and up</option>
              <option value="60">60 and up</option>
              <option value="40">40 and up</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-[11px] uppercase tracking-wide text-[#6B7280]">Source</span>
            <select
              value={sourceFilter}
              onChange={(event) => {
                const next = event.target.value;
                setSourceFilter(next);
                updateSearch({ source: next });
              }}
              className="w-full rounded-lg border border-[#374151] bg-[#0B0F14] px-3 py-2 text-[13px] text-white"
            >
              <option value="all">All sources</option>
              {sourceOptions.map((source) => (
                <option key={source} value={source}>
                  {formatSource({ source, profileId: undefined }).label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-[11px] uppercase tracking-wide text-[#6B7280]">Sort</span>
            <select
              value={sortMode}
              onChange={(event) => {
                const next = event.target.value as SortMode;
                setSortMode(next);
                updateSearch({ sort: next });
              }}
              className="w-full rounded-lg border border-[#374151] bg-[#0B0F14] px-3 py-2 text-[13px] text-white"
            >
              <option value="match">Best match</option>
              <option value="recent">Newest added</option>
              <option value="oldest">Oldest added</option>
              <option value="score-high">Highest score</option>
              <option value="score-low">Lowest score</option>
            </select>
          </label>
        </div>
      </div>

      <div className="mb-6 border-b border-[#1F2937]">
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                updateSearch({ tab: id });
              }}
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
                  onCoverLetterLinked={handleCoverLetterLinked}
                  onOpenResume={setViewingDocument}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-3 rounded-lg border border-[#374151] bg-[#1F2937] px-4 py-2.5">
                  <span className="text-[13px] text-[#D1D5DB]">
                    {selectedIds.size} job{selectedIds.size > 1 ? "s" : ""} selected
                  </span>
                  <button
                    onClick={() => void handleBulkDelete()}
                    className="flex items-center gap-1.5 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 py-1.5 text-[12px] font-medium text-[#EF4444] transition-all hover:bg-[#EF4444]/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Selected
                  </button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="ml-auto text-[12px] text-[#6B7280] transition-colors hover:text-[#9CA3AF]"
                  >
                    Clear
                  </button>
                </div>
              )}

              <div className="overflow-hidden rounded-xl border border-[#1F2937] bg-[#111827]">
                <Table>
                  <TableHeader>
                    <TableRow className="border-[#1F2937] hover:bg-transparent">
                      <TableHead className="h-12 w-10 pl-4">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          ref={(el) => { if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected; }}
                          onChange={handleToggleAll}
                          className="h-4 w-4 cursor-pointer rounded border-[#374151] accent-[#4F8CFF]"
                        />
                      </TableHead>
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
                        isSelected={selectedIds.has(job.id)}
                        onToggleSelect={handleToggleSelect}
                        onStatusChange={handleStatusChange}
                        onDelete={handleDelete}
                        onApply={handleApply}
                        onResumeLinked={handleResumeLinked}
                        onCoverLetterLinked={handleCoverLetterLinked}
                        onOpenResume={setViewingDocument}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
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

      {viewingDocument && (
        <DocumentPreviewModal doc={viewingDocument} onClose={() => setViewingDocument(null)} />
      )}
      {confirmationDialog}
    </div>
  );
}
