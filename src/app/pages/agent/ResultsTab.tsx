import { useState, useEffect, useCallback, useRef } from "react";
import {
  Loader2, ExternalLink, Bookmark, CheckCircle, XCircle,
  ChevronDown, ChevronUp, Briefcase, MapPin, DollarSign,
  Zap, Filter, RefreshCw, Clock, Sparkles, AlertCircle,
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { JobMatch, getResults, setMatchStatus } from "../../services/agent.service";

/* ─── Tier badge ─────────────────────────────────────────────────────── */
function TierBadge({ tier }: { tier?: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    strong: { label: "Strong fit", cls: "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20" },
    maybe: { label: "Maybe", cls: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20" },
    weak: { label: "Weak match", cls: "bg-[#6B7280]/10 text-[#9CA3AF] border-[#374151]" },
    reject: { label: "No match", cls: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20" },
    new: { label: "Unscored", cls: "bg-[#1F2937] text-[#6B7280] border-[#374151]" },
  };
  const { label, cls } = map[tier ?? "new"] ?? map.new;
  return <Badge className={`text-[10px] border ${cls}`}>{label}</Badge>;
}

/* ─── Source badge ───────────────────────────────────────────────────── */
function SourceBadge({ source }: { source: string }) {
  const colors: Record<string, string> = {
    google: "#4285F4",
    greenhouse: "#24a362",
    lever: "#3c5a99",
    ashby: "#7c3aed",
    upwork: "#14a800",
    manual: "#6B7280",
  };
  const color = colors[source] ?? "#6B7280";
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-[#9CA3AF]">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {source.charAt(0).toUpperCase() + source.slice(1)}
    </span>
  );
}

/* ─── Score ring ─────────────────────────────────────────────────────── */
function ScoreRing({ score }: { score: number }) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const fill = circ - (circ * score) / 100;
  const color = score >= 75 ? "#10B981" : score >= 55 ? "#F59E0B" : "#EF4444";
  return (
    <div className="relative h-12 w-12 shrink-0">
      <svg width="48" height="48" className="-rotate-90">
        <circle cx="24" cy="24" r={r} stroke="#1F2937" strokeWidth="3" fill="none" />
        <circle
          cx="24" cy="24" r={r}
          stroke={color} strokeWidth="3" fill="none"
          strokeDasharray={circ}
          strokeDashoffset={fill}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[12px] font-bold text-white">
        {score}
      </span>
    </div>
  );
}

/* ─── Match card ─────────────────────────────────────────────────────── */
function MatchCard({
  match,
  onStatus,
}: {
  match: JobMatch;
  onStatus: (id: string, s: JobMatch["status"]) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const salary =
    match.salaryMin || match.salaryMax
      ? `$${(match.salaryMin ?? 0) / 1000}k${match.salaryMax ? ` – $${match.salaryMax / 1000}k` : "+"}`
      : null;

  const isSaved = match.status === "saved";
  const isApplied = match.status === "applied";
  const isDismissed = match.status === "dismissed";

  return (
    <Card
      className={`bg-[#111827] border-[#1F2937] p-5 transition-opacity ${
        isDismissed ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-start gap-4">
        {match.aiScore != null && <ScoreRing score={match.aiScore} />}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <h3 className="text-[15px] font-semibold text-white leading-tight">{match.title}</h3>
                <TierBadge tier={match.matchTier} />
              </div>
              <div className="flex items-center gap-3 text-[12px] flex-wrap">
                {match.company && (
                  <span className="flex items-center gap-1 text-[#9CA3AF]">
                    <Briefcase className="h-3 w-3" />{match.company}
                  </span>
                )}
                {match.location && (
                  <span className="flex items-center gap-1 text-[#9CA3AF]">
                    <MapPin className="h-3 w-3" />{match.location}
                  </span>
                )}
                {match.remote && (
                  <span className="text-[#10B981] text-[11px] font-medium">Remote</span>
                )}
                {match.jobType && (
                  <span className="text-[#E5E7EB] text-[11px] font-medium capitalize">
                    {match.jobType.replace(/-/g, " ")}
                  </span>
                )}
                {salary && (
                  <span className="flex items-center gap-1 text-[#9CA3AF]">
                    <DollarSign className="h-3 w-3" />{salary}
                  </span>
                )}
                <SourceBadge source={match.source} />
              </div>
            </div>
            <div className="flex gap-1.5 shrink-0">
              {match.sourceUrl && (
                <a
                  href={match.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg text-[#6B7280] hover:text-[#4F8CFF] hover:bg-[#4F8CFF]/10 transition-colors"
                  title="Open job"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
              <button
                type="button"
                onClick={() => onStatus(match.id, isSaved ? "new" : "saved")}
                className={`p-1.5 rounded-lg transition-colors ${
                  isSaved
                    ? "text-[#4F8CFF] bg-[#4F8CFF]/10"
                    : "text-[#6B7280] hover:text-[#4F8CFF] hover:bg-[#4F8CFF]/10"
                }`}
                title={isSaved ? "Unsave" : "Save"}
              >
                <Bookmark className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onStatus(match.id, isApplied ? "new" : "applied")}
                className={`p-1.5 rounded-lg transition-colors ${
                  isApplied
                    ? "text-[#10B981] bg-[#10B981]/10"
                    : "text-[#6B7280] hover:text-[#10B981] hover:bg-[#10B981]/10"
                }`}
                title={isApplied ? "Mark not applied" : "Mark applied"}
              >
                <CheckCircle className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onStatus(match.id, isDismissed ? "new" : "dismissed")}
                className={`p-1.5 rounded-lg transition-colors ${
                  isDismissed
                    ? "text-[#EF4444] bg-[#EF4444]/10"
                    : "text-[#6B7280] hover:text-[#EF4444] hover:bg-[#EF4444]/10"
                }`}
                title={isDismissed ? "Restore" : "Dismiss"}
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Scoring state */}
          {match.matchTier === "new" && !match.aiScore && (() => {
            const scoringError = (match.scoreBreakdown as Record<string, unknown> | undefined)?.error as string | undefined;
            if (scoringError) {
              return (
                <div className="flex items-start gap-1.5 mt-2 text-[11px] text-[#F87171]">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px" />
                  <span>{scoringError}</span>
                </div>
              );
            }
            return (
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-[#6B7280]">
                <Loader2 className="h-3 w-3 animate-spin text-[#4F8CFF]" />
                AI scoring in progress…
              </div>
            );
          })()}

          {/* AI summary preview (collapsed) */}
          {!expanded && match.aiSummary && (
            <p className="mt-2 text-[12px] text-[#6B7280] leading-relaxed line-clamp-2">
              {match.aiSummary}
            </p>
          )}

          {/* Toggle */}
          {(match.scoreBreakdown || match.aiSummary || match.description) && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 text-[11px] text-[#6B7280] hover:text-[#9CA3AF] transition-colors mt-2"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? "Hide details" : "Show details"}
            </button>
          )}

          {expanded && (
            <div className="mt-3 space-y-3">
              {/* AI Summary */}
              {match.aiSummary && (
                <div className="p-3 rounded-lg bg-[#0B0F14] border border-[#4F8CFF]/20">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Sparkles className="h-3 w-3 text-[#4F8CFF]" />
                    <span className="text-[10px] font-semibold text-[#4F8CFF] uppercase tracking-wide">AI Summary</span>
                  </div>
                  <p className="text-[12px] text-[#D1D5DB] leading-relaxed">{match.aiSummary}</p>
                </div>
              )}

              {/* AI Score breakdown */}
              {match.scoreBreakdown && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wide">Match breakdown</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { key: "skillsMatch",       label: "Skills match",       max: 25, color: "#10B981" },
                      { key: "experienceMatch",    label: "Experience fit",     max: 25, color: "#F59E0B" },
                      { key: "roleAlignment",      label: "Role alignment",     max: 25, color: "#4F8CFF" },
                      { key: "locationSalaryFit",  label: "Location / salary",  max: 25, color: "#A78BFA" },
                    ] as const).map(({ key, label, max, color }) => {
                      const val = (match.scoreBreakdown as Record<string, number>)[key] ?? 0;
                      const pct = Math.round((val / max) * 100);
                      return (
                        <div key={key} className="p-2.5 rounded-lg bg-[#0B0F14] border border-[#1F2937]">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] text-[#9CA3AF]">{label}</span>
                            <span className="text-[12px] font-bold text-white">{val}<span className="text-[9px] text-[#4B5563]">/{max}</span></span>
                          </div>
                          <div className="h-1 rounded-full bg-[#1F2937] overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, backgroundColor: color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {match.scoreBreakdown.reasoning && (
                    <p className="text-[11px] text-[#9CA3AF] leading-relaxed italic px-0.5">
                      {match.scoreBreakdown.reasoning}
                    </p>
                  )}
                </div>
              )}

              {/* Raw description fallback if no AI summary */}
              {!match.aiSummary && match.description && (
                <p className="text-[12px] text-[#9CA3AF] leading-relaxed">
                  {match.description.replace(/<[^>]+>/g, " ").slice(0, 600)}
                  {match.description.length > 600 ? "…" : ""}
                </p>
              )}

              {/* Requirements */}
              {match.requirements && match.requirements.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {match.requirements.slice(0, 8).map((r) => (
                    <span key={r} className="px-2 py-0.5 rounded bg-[#1F2937] text-[#9CA3AF] text-[11px]">{r}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[#1F2937]">
            {match.profileName && (
              <span className="text-[11px] text-[#4B5563]">
                via {match.profileName}
              </span>
            )}
            {match.postedAt && (
              <span className="text-[11px] text-[#4B5563] flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(match.postedAt).toLocaleDateString()}
              </span>
            )}
            {isApplied && (
              <Badge className="bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20 text-[10px] ml-auto">
                Applied
              </Badge>
            )}
            {isSaved && !isApplied && (
              <Badge className="bg-[#4F8CFF]/10 text-[#4F8CFF] border-[#4F8CFF]/20 text-[10px] ml-auto">
                Saved
              </Badge>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ─── Filter pill ────────────────────────────────────────────────────── */
function FilterPill({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition-all ${
        active
          ? "bg-[#4F8CFF] text-white border-[#4F8CFF]"
          : "bg-[#111827] text-[#9CA3AF] border-[#1F2937] hover:border-[#374151] hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

/* ─── Main tab ────────────────────────────────────────────────────────── */
export function ResultsTab() {
  const [matches, setMatches] = useState<JobMatch[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tierFilter, setTierFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("new");
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const result = await getResults({
        tier: tierFilter || undefined,
        status: statusFilter || undefined,
        limit: LIMIT,
        offset: reset ? 0 : offset,
      });
      if (reset) {
        setMatches(result.matches);
        setOffset(0);
      } else {
        setMatches((prev) => [...prev, ...result.matches]);
      }
      setTotal(result.total);
      return result.matches;
    } finally {
      setLoading(false);
    }
  }, [tierFilter, statusFilter, offset]);

  const isUnscored = (m: JobMatch) =>
    m.matchTier === "new" && !m.aiScore &&
    !(m.scoreBreakdown as Record<string, unknown> | undefined)?.error;

  // Poll every 4s while any job is still unscored (tier = "new", no aiScore, no error)
  useEffect(() => {
    const hasPending = matches.some(isUnscored);
    if (hasPending && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        const updated = await getResults({
          tier: tierFilter || undefined,
          status: statusFilter || undefined,
          limit: LIMIT,
          offset: 0,
        }).catch(() => null);
        if (!updated) return;
        setMatches(updated.matches);
        setTotal(updated.total);
        const stillPending = updated.matches.some(isUnscored);
        if (!stillPending && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }, 4000);
    } else if (!hasPending && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [matches, tierFilter, statusFilter]);

  useEffect(() => { load(true); }, [tierFilter, statusFilter]);

  async function handleStatus(id: string, status: JobMatch["status"]) {
    await setMatchStatus(id, status);
    setMatches((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status } : m))
    );
  }

  const tierOptions = [
    { label: "All tiers", value: "" },
    { label: "Strong fits", value: "strong" },
    { label: "Maybe", value: "maybe" },
    { label: "Weak", value: "weak" },
  ];

  const statusOptions = [
    { label: "New", value: "new" },
    { label: "Saved", value: "saved" },
    { label: "Applied", value: "applied" },
    { label: "All", value: "" },
  ];

  return (
    <div className="space-y-5">
      {/* Filters + refresh */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-[#6B7280] shrink-0" />
          <div className="flex gap-1.5 flex-wrap">
            {tierOptions.map((o) => (
              <FilterPill
                key={o.value}
                label={o.label}
                active={tierFilter === o.value}
                onClick={() => setTierFilter(o.value)}
              />
            ))}
          </div>
          <div className="w-px h-5 bg-[#1F2937] mx-1" />
          <div className="flex gap-1.5 flex-wrap">
            {statusOptions.map((o) => (
              <FilterPill
                key={o.value}
                label={o.label}
                active={statusFilter === o.value}
                onClick={() => setStatusFilter(o.value)}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-[#6B7280]">{total} results</span>
          <button
            type="button"
            onClick={() => load(true)}
            className="text-[#6B7280] hover:text-white transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Results */}
      {loading && matches.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[#4F8CFF]" />
        </div>
      ) : matches.length === 0 ? (
        <Card className="bg-[#111827] border-dashed border-[#374151] p-12 text-center">
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 rounded-xl bg-[#4F8CFF]/10 flex items-center justify-center">
              <Zap className="h-6 w-6 text-[#4F8CFF]" />
            </div>
          </div>
          <h3 className="text-[16px] font-semibold text-white mb-2">No results yet</h3>
          <p className="text-[13px] text-[#6B7280] max-w-sm mx-auto">
            Create a search profile and run it — or change the filters above.
          </p>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {matches.map((m) => (
              <MatchCard key={m.id} match={m} onStatus={handleStatus} />
            ))}
          </div>

          {matches.length < total && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => { setOffset((o) => o + LIMIT); load(); }}
                disabled={loading}
                className="border-[#374151] text-[#9CA3AF] hover:text-white"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Load more ({total - matches.length} remaining)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
