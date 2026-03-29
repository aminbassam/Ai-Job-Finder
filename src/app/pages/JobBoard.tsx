import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapPin,
  Sparkles,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Zap,
  Loader2,
  CheckCircle2,
  Bookmark,
  BookmarkCheck,
  Check,
  X,
  FileText,
} from "lucide-react";
import { getResults, setMatchStatus, generateResume, JobMatch } from "../services/agent.service";

/* ─── helpers ──────────────────────────────────────────────────────────── */

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
    <div className="relative w-12 h-12 shrink-0">
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
    <div className="h-1.5 bg-[#1F2937] rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

/* ─── JobBoardCard ─────────────────────────────────────────────────────── */

interface CardState {
  expanded: boolean;
  generating: boolean;
  generated: boolean;
  generateError: string | null;
}

function JobBoardCard({
  job,
  onStatusChange,
}: {
  job: JobMatch;
  onStatusChange: (id: string, status: JobMatch["status"]) => void;
}) {
  const navigate = useNavigate();
  const [state, setState] = useState<CardState>({
    expanded: false,
    generating: false,
    generated: job.resumeGenerated ?? false,
    generateError: null,
  });

  const isScoring =
    job.matchTier === "new" && !job.aiScore && !job.scoreBreakdown?.error;
  const hasError = !!job.scoreBreakdown?.error;
  const tier = tierLabel(hasError ? undefined : job.matchTier);
  const dismissed = job.status === "dismissed";

  const handleSave = () => {
    const next: JobMatch["status"] = job.status === "saved" ? "new" : "saved";
    onStatusChange(job.id, next);
  };

  const handleApplied = () => {
    onStatusChange(job.id, "applied");
  };

  const handleDismiss = () => {
    onStatusChange(job.id, "dismissed");
  };

  const handleGenerateResume = async () => {
    setState((s) => ({ ...s, generating: true, generateError: null }));
    try {
      await generateResume(job.id);
      setState((s) => ({ ...s, generating: false, generated: true }));
    } catch (err) {
      setState((s) => ({
        ...s,
        generating: false,
        generateError: (err as Error).message ?? "Failed to generate resume.",
      }));
    }
  };

  const breakdown = job.scoreBreakdown;

  return (
    <div
      className={`bg-[#111827] border border-[#1F2937] rounded-xl p-5 transition-all ${
        dismissed ? "opacity-40" : "hover:border-[#4F8CFF]/30"
      }`}
    >
      {/* Top row */}
      <div className="flex items-start gap-4 mb-3">
        <ScoreRing score={job.aiScore} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold text-white leading-tight truncate">
                {job.title}
              </h3>
              <p className="text-[13px] text-[#9CA3AF]">{job.company}</p>
            </div>

            {/* Tier badge */}
            <div className="shrink-0">
              {isScoring ? (
                <span className="flex items-center gap-1 text-[11px] text-[#6B7280] bg-[#1F2937] px-2 py-1 rounded-full border border-[#374151]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Scoring…
                </span>
              ) : hasError ? (
                <span className="flex items-center gap-1 text-[11px] text-[#EF4444]">
                  <AlertCircle className="h-3 w-3" />
                  Error
                </span>
              ) : (
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${tier.cls}`}
                >
                  {tier.text}
                </span>
              )}
            </div>
          </div>

          {/* Meta row */}
          <div className="flex items-center flex-wrap gap-3 mt-1.5 text-[12px] text-[#6B7280]">
            {job.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {job.location}
              </span>
            )}
            {job.remote && (
              <span className="bg-[#4F8CFF]/10 text-[#4F8CFF] px-1.5 py-0.5 rounded text-[10px] font-medium border border-[#4F8CFF]/20">
                Remote
              </span>
            )}
            {(job.salaryMin || job.salaryMax) && (
              <span className="text-[#9CA3AF]">
                {[
                  job.salaryMin ? `$${Math.round(job.salaryMin / 1000)}k` : null,
                  job.salaryMax ? `$${Math.round(job.salaryMax / 1000)}k` : null,
                ]
                  .filter(Boolean)
                  .join(" – ")}
              </span>
            )}
            {job.source && (
              <span className="bg-[#1F2937] text-[#9CA3AF] px-1.5 py-0.5 rounded text-[10px] border border-[#374151]">
                {job.source}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Error text */}
      {hasError && (
        <p className="text-[12px] text-[#EF4444] mb-3 flex items-start gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          {job.scoreBreakdown?.error}
        </p>
      )}

      {/* AI summary preview */}
      {job.aiSummary && (
        <p className="text-[12px] text-[#9CA3AF] mb-3 line-clamp-2">{job.aiSummary}</p>
      )}

      {/* Action buttons row */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <button
          onClick={handleSave}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all ${
            job.status === "saved"
              ? "bg-[#4F8CFF]/10 text-[#4F8CFF] border-[#4F8CFF]/30"
              : "bg-[#1F2937] text-[#9CA3AF] border-[#374151] hover:text-white"
          }`}
        >
          {job.status === "saved" ? (
            <BookmarkCheck className="h-3.5 w-3.5" />
          ) : (
            <Bookmark className="h-3.5 w-3.5" />
          )}
          {job.status === "saved" ? "Saved" : "Save"}
        </button>

        <button
          onClick={handleApplied}
          disabled={job.status === "applied"}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all ${
            job.status === "applied"
              ? "bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30"
              : "bg-[#1F2937] text-[#9CA3AF] border-[#374151] hover:text-white"
          }`}
        >
          <Check className="h-3.5 w-3.5" />
          {job.status === "applied" ? "Applied" : "Mark Applied"}
        </button>

        <button
          onClick={handleDismiss}
          disabled={dismissed}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border bg-[#1F2937] text-[#9CA3AF] border-[#374151] hover:text-[#EF4444] hover:border-[#EF4444]/30 transition-all"
        >
          <X className="h-3.5 w-3.5" />
          Dismiss
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Generate resume */}
        {state.generated || job.resumeGenerated ? (
          <button
            onClick={() => navigate("/resumes")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30 hover:bg-[#22C55E]/20 transition-all"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Resume in Vault →
          </button>
        ) : (
          <button
            onClick={handleGenerateResume}
            disabled={state.generating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border bg-[#4F8CFF]/10 text-[#4F8CFF] border-[#4F8CFF]/30 hover:bg-[#4F8CFF]/20 transition-all disabled:opacity-60"
          >
            {state.generating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            {state.generating ? "Generating…" : "Generate Resume"}
          </button>
        )}
      </div>

      {/* Generate error */}
      {state.generateError && (
        <p className="text-[11px] text-[#EF4444] mb-2 flex items-start gap-1">
          <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
          {state.generateError}
        </p>
      )}

      {/* Expand toggle */}
      {!isScoring && !hasError && breakdown && (
        <button
          onClick={() => setState((s) => ({ ...s, expanded: !s.expanded }))}
          className="flex items-center gap-1 text-[11px] text-[#6B7280] hover:text-[#9CA3AF] transition-colors"
        >
          {state.expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {state.expanded ? "Hide AI Analysis" : "Show AI Analysis"}
        </button>
      )}

      {/* Expanded AI analysis */}
      {state.expanded && breakdown && (
        <div className="mt-4 space-y-4">
          {/* Summary */}
          {job.aiSummary && (
            <div className="bg-[#0B0F14] border border-[#4F8CFF]/20 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <Sparkles className="h-3.5 w-3.5 text-[#4F8CFF]" />
                <span className="text-[11px] font-semibold text-[#4F8CFF] uppercase tracking-wide">
                  AI Summary
                </span>
              </div>
              <p className="text-[13px] text-[#D1D5DB] leading-relaxed">{job.aiSummary}</p>
            </div>
          )}

          {/* Score breakdown */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Skills Match", value: breakdown.skillsMatch, color: "#4F8CFF" },
              { label: "Experience", value: breakdown.experienceMatch, color: "#8B5CF6" },
              { label: "Role Alignment", value: breakdown.roleAlignment, color: "#22C55E" },
              { label: "Location / Salary", value: breakdown.locationSalaryFit, color: "#F59E0B" },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div className="flex justify-between mb-1">
                  <span className="text-[11px] text-[#9CA3AF]">{label}</span>
                  <span className="text-[11px] font-semibold" style={{ color }}>
                    {value ?? 0}/25
                  </span>
                </div>
                <ScoreBar value={value ?? 0} max={25} color={color} />
              </div>
            ))}
          </div>

          {/* Reasoning */}
          {breakdown.reasoning && (
            <p className="text-[12px] text-[#9CA3AF] italic">{breakdown.reasoning}</p>
          )}

          {/* Strengths */}
          {breakdown.strengths && breakdown.strengths.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-[#22C55E] uppercase tracking-wide mb-1.5">
                Why Apply
              </p>
              <ul className="space-y-1">
                {breakdown.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-[#D1D5DB]">
                    <span className="text-[#22C55E] mt-0.5">•</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Weaknesses */}
          {breakdown.weaknesses && breakdown.weaknesses.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-[#F59E0B] uppercase tracking-wide mb-1.5">
                Concerns
              </p>
              <ul className="space-y-1">
                {breakdown.weaknesses.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-[#D1D5DB]">
                    <span className="text-[#F59E0B] mt-0.5">•</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Areas to address */}
          {breakdown.areasToAddress && breakdown.areasToAddress.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-[#FB923C] uppercase tracking-wide mb-1.5">
                Areas to Address
              </p>
              <ul className="space-y-1">
                {breakdown.areasToAddress.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-[#D1D5DB]">
                    <span className="text-[#FB923C] mt-0.5">•</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* External link */}
          {job.sourceUrl && (
            <a
              href={job.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] text-[#4F8CFF] hover:text-[#4F8CFF]/80 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View Original Posting
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Main page ────────────────────────────────────────────────────────── */

type TabId = "all" | "strong" | "maybe" | "new" | "applied";

const TABS: { id: TabId; label: string }[] = [
  { id: "all",     label: "All" },
  { id: "strong",  label: "Strong" },
  { id: "maybe",   label: "Maybe" },
  { id: "new",     label: "New" },
  { id: "applied", label: "Applied" },
];

const LIMIT = 20;

function tabToQuery(tab: TabId): { tier?: string; status?: string } {
  switch (tab) {
    case "strong":  return { tier: "strong" };
    case "maybe":   return { tier: "maybe" };
    case "new":     return { status: "new" };
    case "applied": return { status: "applied" };
    default:        return {};
  }
}

export function JobBoard() {
  const [tab, setTab] = useState<TabId>("all");
  const [jobs, setJobs] = useState<JobMatch[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasUnscored = jobs.some(
    (j) => j.matchTier === "new" && !j.aiScore && !j.scoreBreakdown?.error
  );

  const fetchJobs = useCallback(
    async (reset = false) => {
      const currentOffset = reset ? 0 : offset;
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
      } catch {
        // silently ignore
      } finally {
        if (reset) setLoading(false);
      }
    },
    [tab, offset]
  );

  // Silent re-fetch for polling (updates existing cards in-place)
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

  // Fetch tab counts once on mount
  useEffect(() => {
    const fetchCounts = async () => {
      const counts: Record<string, number> = {};
      await Promise.allSettled(
        TABS.map(async ({ id }) => {
          const q = tabToQuery(id);
          const res = await getResults({ ...q, limit: 1, offset: 0 });
          counts[id] = res.total;
        })
      );
      setTabCounts(counts);
    };
    fetchCounts();
  }, []);

  // Fetch on tab change
  useEffect(() => {
    setOffset(0);
    fetchJobs(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Polling
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
    // Optimistically update
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status } : j)));
    try {
      await setMatchStatus(id, status);
    } catch {
      // revert on error
      setJobs((prev) => prev.map((j) => (j.id === id ? { ...j } : j)));
    }
  };

  const handleLoadMore = async () => {
    setLoadingMore(true);
    const q = tabToQuery(tab);
    try {
      const res = await getResults({ ...q, limit: LIMIT, offset });
      setJobs((prev) => {
        const ids = new Set(prev.map((j) => j.id));
        return [...prev, ...res.matches.filter((m) => !ids.has(m.id))];
      });
      setOffset((prev) => prev + LIMIT);
      setTotal(res.total);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  };

  const visibleJobs = jobs.filter((j) => j.status !== "dismissed" || tab === "all");

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[32px] font-semibold text-white mb-1">Job Board</h1>
          <p className="text-[14px] text-[#9CA3AF]">
            AI-matched jobs ranked by fit score
          </p>
        </div>
        {hasUnscored && (
          <div className="flex items-center gap-2 text-[12px] text-[#F59E0B] bg-[#F59E0B]/10 border border-[#F59E0B]/20 px-3 py-2 rounded-lg">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Scoring jobs…
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-[#1F2937] mb-6">
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-3 text-[13px] font-medium border-b-2 transition-all whitespace-nowrap ${
                tab === id
                  ? "border-[#4F8CFF] text-[#4F8CFF]"
                  : "border-transparent text-[#6B7280] hover:text-white"
              }`}
            >
              {label}
              {tabCounts[id] != null && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    tab === id
                      ? "bg-[#4F8CFF]/20 text-[#4F8CFF]"
                      : "bg-[#1F2937] text-[#6B7280]"
                  }`}
                >
                  {tabCounts[id]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 text-[#4F8CFF] animate-spin" />
        </div>
      ) : visibleJobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          {tab === "all" ? (
            <>
              <div className="h-16 w-16 rounded-2xl bg-[#4F8CFF]/10 flex items-center justify-center mb-4">
                <Zap className="h-8 w-8 text-[#4F8CFF]" />
              </div>
              <h3 className="text-[18px] font-semibold text-white mb-2">No jobs yet</h3>
              <p className="text-[14px] text-[#9CA3AF] mb-5 max-w-sm">
                Run your agent or import jobs manually to start reviewing matches.
              </p>
              <a
                href="/agent"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#4F8CFF] hover:bg-[#4F8CFF]/90 text-white text-[13px] font-medium rounded-lg transition-all"
              >
                <Zap className="h-4 w-4" />
                Go to Agent
              </a>
            </>
          ) : (
            <>
              <p className="text-[15px] font-medium text-white mb-1">No jobs in this category</p>
              <p className="text-[13px] text-[#9CA3AF]">
                Try a different tab or run your agent to find more matches.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {visibleJobs.map((job) => (
              <JobBoardCard
                key={job.id}
                job={job}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>

          {/* Load more */}
          {jobs.length < total && (
            <div className="flex justify-center mt-8">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#1F2937] hover:bg-[#374151] text-white text-[13px] font-medium rounded-lg border border-[#374151] transition-all disabled:opacity-60"
              >
                {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loadingMore ? "Loading…" : `Load More (${total - jobs.length} remaining)`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
