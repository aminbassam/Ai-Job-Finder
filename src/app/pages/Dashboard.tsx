import {
  AlertCircle,
  AlertTriangle,
  Briefcase,
  Clock,
  FileText,
  Loader2,
  Send,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { DocumentPreviewModal, type DocumentPreviewRef } from "../components/documents/DocumentPreviewModal";
import { ScoreBadge } from "../components/shared/ScoreBadge";
import { StatCard } from "../components/shared/StatCard";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Progress } from "../components/ui/progress";
import { useAuth } from "../contexts/AuthContext";
import { analyticsService, type DashboardAnalytics, type FunnelPoint, type JobsPerWeekPoint, type SourcePerformancePoint } from "../services/analytics.service";
import { applicationsService, type ApplicationItem } from "../services/applications.service";
import { getResults, type JobMatch } from "../services/agent.service";
import { documentsService, type DocumentItem } from "../services/documents.service";
import { settingsService, type AiProviderInfo } from "../services/settings.service";

function stageCount(funnel: FunnelPoint[], stage: string) {
  return funnel.find((entry) => entry.stage === stage)?.count ?? 0;
}

function formatRelativeTime(value?: string | null) {
  if (!value) return "Recently";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Recently";

  const diffMs = Date.now() - parsed.getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? "" : "s"} ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;

  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatResumeDate(value?: string | null) {
  if (!value) return "Updated recently";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function weightedAverageScore(sources: SourcePerformancePoint[]) {
  const totalJobs = sources.reduce((sum, source) => sum + source.jobs, 0);
  if (totalJobs === 0) return 0;
  const weighted = sources.reduce((sum, source) => sum + (source.avgScore * source.jobs), 0);
  return Math.round(weighted / totalJobs);
}

function EmptyDataCard({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[#1F2937] bg-[#0B0F14] px-5 py-8 text-center">
      <p className="text-[14px] font-medium text-white">{title}</p>
      <p className="mt-1 text-[12px] text-[#9CA3AF]">{message}</p>
    </div>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  const [providers, setProviders] = useState<AiProviderInfo[]>([]);
  const [stats, setStats] = useState<DashboardAnalytics | null>(null);
  const [recentJobs, setRecentJobs] = useState<JobMatch[]>([]);
  const [recentResumes, setRecentResumes] = useState<DocumentItem[]>([]);
  const [sourcePerformance, setSourcePerformance] = useState<SourcePerformancePoint[]>([]);
  const [jobsPerWeek, setJobsPerWeek] = useState<JobsPerWeekPoint[]>([]);
  const [funnel, setFunnel] = useState<FunnelPoint[]>([]);
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [jobsTotal, setJobsTotal] = useState(0);
  const [viewingResume, setViewingResume] = useState<DocumentPreviewRef | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard(showLoader = false) {
      if (showLoader) {
        setLoading(true);
      }
      setError(null);
      try {
        const [
          nextProviders,
          dashboardStats,
          recentJobsResponse,
          documents,
          nextSourcePerformance,
          nextJobsPerWeek,
          nextFunnel,
          nextApplications,
        ] = await Promise.all([
          settingsService.getAiProviders().catch(() => []),
          analyticsService.getDashboard(),
          getResults({ sort: "recent", limit: 6 }),
          documentsService.list("resume"),
          analyticsService.getSourcePerformance(),
          analyticsService.getJobsPerWeek(),
          analyticsService.getFunnel(),
          applicationsService.list().catch(() => []),
        ]);

        if (cancelled) return;

        setProviders(nextProviders);
        setStats(dashboardStats);
        setRecentJobs(recentJobsResponse.matches);
        setJobsTotal(recentJobsResponse.total);
        setRecentResumes(
          documents
            .filter((document) => document.kind === "resume" && document.resumeType === "tailored")
            .slice(0, 4)
        );
        setSourcePerformance(nextSourcePerformance);
        setJobsPerWeek(nextJobsPerWeek);
        setFunnel(nextFunnel);
        setApplications(nextApplications);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load dashboard.");
      } finally {
        if (!cancelled && showLoader) {
          setLoading(false);
        }
      }
    }

    void loadDashboard(true);

    const handleWindowFocus = () => {
      void loadDashboard();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadDashboard();
      }
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const hasConnectedProvider = providers.some((provider) => provider.status === "connected");
  const totalJobsFound = stageCount(funnel, "Jobs Found") || jobsTotal;
  const appliedCount = stageCount(funnel, "Applied");
  const interviewCount = stageCount(funnel, "Interview");
  const offerCount = stageCount(funnel, "Offer");
  const averageMatchScore = weightedAverageScore(sourcePerformance);
  const interviewRate = appliedCount > 0 ? Math.round((interviewCount / appliedCount) * 100) : 0;
  const bestSource = useMemo(
    () => [...sourcePerformance].sort((a, b) => b.avgScore - a.avgScore || b.jobs - a.jobs)[0] ?? null,
    [sourcePerformance]
  );
  const strongestWeek = useMemo(
    () => [...jobsPerWeek].sort((a, b) => b.jobs - a.jobs)[0] ?? null,
    [jobsPerWeek]
  );
  const highestScoringJobs = useMemo(
    () =>
      [...recentJobs]
        .filter((job) => typeof job.aiScore === "number")
        .sort((a, b) => (b.aiScore ?? 0) - (a.aiScore ?? 0))
        .slice(0, 3),
    [recentJobs]
  );
  const topResumeCount = recentResumes.length;
  const sourceMaxJobs = Math.max(...sourcePerformance.map((source) => source.jobs), 1);
  const hasAnyDashboardData =
    totalJobsFound > 0 ||
    (stats?.jobsFoundToday ?? 0) > 0 ||
    (stats?.highMatchJobs ?? 0) > 0 ||
    (stats?.resumesGenerated ?? 0) > 0 ||
    (stats?.applicationsSent ?? 0) > 0 ||
    recentJobs.length > 0 ||
    recentResumes.length > 0 ||
    sourcePerformance.length > 0 ||
    jobsPerWeek.some((entry) => entry.jobs > 0) ||
    applications.length > 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="mb-2 text-[28px] font-semibold text-white sm:text-[30px] lg:text-[32px]">Dashboard</h1>
        <p className="text-[13px] text-[#9CA3AF] sm:text-[14px]">
          Welcome back! Here&apos;s the live view of your job pipeline, resume output, and application progress.
        </p>
        {!hasConnectedProvider && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#4F8CFF]/20 bg-[#4F8CFF]/10 px-4 py-3 text-[12px] text-[#DBEAFE] sm:text-[13px]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#93C5FD]" />
            <p>
              Set up your AI API key in{" "}
              <Link to="/settings?tab=ai" className="font-medium text-white underline underline-offset-2">
                Settings
              </Link>{" "}
              first to unlock resume generation, job analysis, and the rest of the AI-powered features.
            </p>
          </div>
        )}
        {user?.isDemo && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#F59E0B]/20 bg-[#F59E0B]/10 px-4 py-3 text-[12px] text-[#FCD34D] sm:text-[13px]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              You are using the shared demo account. Demo data and anything added here are automatically cleared every 24 hours.
            </p>
          </div>
        )}
        {!loading && !error && !hasAnyDashboardData && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#1F2937] bg-[#111827] px-4 py-3 text-[12px] text-[#D1D5DB] sm:text-[13px]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#9CA3AF]" />
            <p>
              No data available to display yet. Start by adding a resume profile, running a job search, importing jobs, or generating your first tailored resume.
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-[#7F1D1D] bg-[#7F1D1D]/10 px-4 py-3 text-[12px] text-[#FCA5A5] sm:text-[13px]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-[#4F8CFF]" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:mb-8 sm:gap-5 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Jobs Found Today"
              value={stats?.jobsFoundToday ?? 0}
              icon={Briefcase}
              change={hasAnyDashboardData ? `${totalJobsFound} jobs tracked overall` : "No data available yet"}
              changeType={hasAnyDashboardData ? "positive" : "neutral"}
            />
            <StatCard
              title="High Match Jobs (70+)"
              value={stats?.highMatchJobs ?? 0}
              icon={Target}
              change={hasAnyDashboardData ? `${highestScoringJobs.length} strong fits in your latest jobs` : "No data available yet"}
              changeType={hasAnyDashboardData ? "positive" : "neutral"}
            />
            <StatCard
              title="Resumes Generated"
              value={stats?.resumesGenerated ?? 0}
              icon={FileText}
              change={hasAnyDashboardData ? `${topResumeCount} recent tailored resumes ready` : "No data available yet"}
              changeType="neutral"
            />
            <StatCard
              title="Applications Sent"
              value={stats?.applicationsSent ?? 0}
              icon={Send}
              change={
                hasAnyDashboardData
                  ? (interviewRate > 0 ? `${interviewRate}% interview rate` : `${offerCount} offers so far`)
                  : "No data available yet"
              }
              changeType={interviewRate > 0 ? "positive" : "neutral"}
            />
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 sm:mb-8 sm:gap-6 lg:grid-cols-3">
            <Card className="border-[#1F2937] bg-[#111827] p-4 sm:p-5 lg:col-span-2 lg:p-6">
              <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-[18px] font-semibold text-white">Recent Jobs Added</h2>
                  <p className="mt-1 text-[12px] text-[#9CA3AF]">Newest jobs saved, imported, or found by the agent.</p>
                </div>
                <Button asChild variant="ghost" size="sm" className="justify-start px-0 text-[#9CA3AF] hover:text-white sm:justify-center sm:px-3">
                  <Link to="/jobs">Open Job Board</Link>
                </Button>
              </div>

              <div className="space-y-4">
                {recentJobs.length === 0 ? (
                  <EmptyDataCard
                    title="No jobs added yet"
                    message="Run a profile, import a job, or use the extension and your latest jobs will show up here."
                  />
                ) : (
                  recentJobs.map((job) => (
                    <Link
                      key={job.id}
                      to={`/jobs/${job.id}`}
                      className="block rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4 transition-colors hover:border-[#4F8CFF]/30"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-semibold text-white">{job.title}</p>
                          <p className="mt-1 text-[12px] text-[#9CA3AF]">
                            {[job.company, job.location].filter(Boolean).join(" · ") || "Job Board"}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
                          {typeof job.aiScore === "number" && <ScoreBadge score={job.aiScore} size="sm" />}
                          <Badge variant="secondary" className="border-[#374151] bg-[#111827] text-[10px] text-[#9CA3AF]">
                            {job.source === "extension" ? "Extension" : job.source.replaceAll("_", " ")}
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-[#9CA3AF]">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Added {formatRelativeTime(job.createdAt)}
                        </span>
                        {job.linkedResume?.title && (
                          <span>Resume: {job.linkedResume.title}</span>
                        )}
                        {job.matchTier && (
                          <span className="capitalize">{job.matchTier} fit</span>
                        )}
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </Card>

            <Card className="border-[#1F2937] bg-[#111827] p-4 sm:p-5 lg:p-6">
              <div className="mb-6 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[#4F8CFF]" />
                <h2 className="text-[18px] font-semibold text-white">Live Snapshot</h2>
              </div>
              <div className="space-y-4">
                <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-4">
                  <p className="text-[11px] uppercase tracking-wide text-[#6B7280]">Average Match Score</p>
                  <p className="mt-1 text-[24px] font-semibold text-white">{averageMatchScore}%</p>
                  <p className="text-[12px] text-[#9CA3AF]">
                    {sourcePerformance.length > 0 ? "Weighted across all scored job sources." : "No data available to display yet."}
                  </p>
                </div>
                <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-4">
                  <p className="text-[11px] uppercase tracking-wide text-[#6B7280]">Best Source Right Now</p>
                  <p className="mt-1 text-[16px] font-semibold text-white">{bestSource?.source ?? "No source data yet"}</p>
                  <p className="text-[12px] text-[#9CA3AF]">
                    {bestSource ? `${bestSource.avgScore}% avg score across ${bestSource.jobs} jobs.` : "Run the agent or import jobs to build source insights."}
                  </p>
                </div>
                <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-4">
                  <p className="text-[11px] uppercase tracking-wide text-[#6B7280]">Application Funnel</p>
                  {appliedCount === 0 && interviewCount === 0 && offerCount === 0 ? (
                    <p className="mt-2 text-[12px] text-[#9CA3AF]">No data available to display yet.</p>
                  ) : (
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center sm:gap-3">
                      <div>
                        <p className="text-[18px] font-semibold text-white">{appliedCount}</p>
                        <p className="text-[11px] text-[#9CA3AF]">Applied</p>
                      </div>
                      <div>
                        <p className="text-[18px] font-semibold text-white">{interviewCount}</p>
                        <p className="text-[11px] text-[#9CA3AF]">Interview</p>
                      </div>
                      <div>
                        <p className="text-[18px] font-semibold text-white">{offerCount}</p>
                        <p className="text-[11px] text-[#9CA3AF]">Offer</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-4">
                  <p className="text-[11px] uppercase tracking-wide text-[#6B7280]">Strongest Week</p>
                  <p className="mt-1 text-[16px] font-semibold text-white">
                    {strongestWeek ? `${strongestWeek.week} · ${strongestWeek.jobs} jobs` : "No weekly trend yet"}
                  </p>
                  <p className="text-[12px] text-[#9CA3AF]">
                    {strongestWeek ? "Your highest job discovery volume so far." : "Weekly analytics will appear once job history builds up."}
                  </p>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
            <Card className="border-[#1F2937] bg-[#111827] p-4 sm:p-5 lg:p-6">
              <h2 className="mb-6 text-[18px] font-semibold text-white">Source Breakdown</h2>
              <div className="space-y-5">
                {sourcePerformance.length === 0 ? (
                  <EmptyDataCard
                    title="No source data yet"
                    message="Once jobs are found or imported, source performance will appear here automatically."
                  />
                ) : (
                  sourcePerformance.map((source) => (
                    <div key={source.source}>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[13px] text-white">{source.source}</span>
                        <span className="text-[13px] font-semibold text-[#9CA3AF]">
                          {source.jobs} jobs · {Math.round(source.avgScore)}%
                        </span>
                      </div>
                      <Progress value={(source.jobs / sourceMaxJobs) * 100} className="h-2" />
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card className="border-[#1F2937] bg-[#111827] p-4 sm:p-5 lg:p-6">
              <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-[18px] font-semibold text-white">Recent Resumes Generated</h2>
                  <p className="mt-1 text-[12px] text-[#9CA3AF]">Latest tailored resumes generated from your job pipeline.</p>
                </div>
                <Button asChild variant="ghost" size="sm" className="justify-start px-0 text-[#9CA3AF] hover:text-white sm:justify-center sm:px-3">
                  <Link to="/jobs">Open Job Board</Link>
                </Button>
              </div>
              <div className="space-y-3">
                {recentResumes.length === 0 ? (
                  <EmptyDataCard
                    title="No generated resumes yet"
                    message="Generate a resume from the Job Board and the newest versions will show up here."
                  />
                ) : (
                  recentResumes.map((resume) => (
                    <button
                      key={resume.id}
                      type="button"
                      onClick={() =>
                        setViewingResume({
                          id: resume.id,
                          title: resume.title,
                          jobTitle: resume.jobTitle,
                          company: resume.company,
                        })
                      }
                      className="w-full rounded-lg border border-[#1F2937] bg-[#0B0F14] p-4 text-left transition-colors hover:border-[#4F8CFF]/30"
                    >
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-medium text-white">{resume.title}</p>
                          <p className="mt-1 text-[11px] text-[#9CA3AF]">
                            {[resume.company, resume.jobTitle].filter(Boolean).join(" · ") || "Tailored resume"}
                          </p>
                        </div>
                        <FileText className="h-4 w-4 shrink-0 text-[#9CA3AF]" />
                      </div>
                      <div className="mb-2 flex flex-wrap gap-2">
                        {resume.tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="border-[#374151] bg-[#111827] text-[10px] text-[#9CA3AF]"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-[11px] text-[#9CA3AF]">Updated {formatResumeDate(resume.lastModified)}</p>
                    </button>
                  ))
                )}
              </div>
            </Card>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-3">
            <Card className="border-[#1F2937] bg-[#111827] p-4 sm:p-5 lg:p-6">
              <h3 className="mb-2 text-[14px] font-semibold text-[#4F8CFF]">Top Matching Roles</h3>
              <div className="space-y-2 text-[12px] text-[#9CA3AF]">
                {highestScoringJobs.length === 0 ? (
                  <p>No scored jobs yet. Connect your AI provider and score jobs to unlock this view.</p>
                ) : (
                  highestScoringJobs.map((job) => (
                    <p key={job.id}>
                      {job.title} {job.company ? `at ${job.company}` : ""} ({job.aiScore}%)
                    </p>
                  ))
                )}
              </div>
            </Card>
            <Card className="border-[#1F2937] bg-[#111827] p-4 sm:p-5 lg:p-6">
              <h3 className="mb-2 text-[14px] font-semibold text-[#22C55E]">Applications Momentum</h3>
              <p className="text-[12px] text-[#9CA3AF]">
                {applications.length > 0
                  ? `You have ${applications.length} applications tracked, with ${interviewCount} interview-stage opportunities and ${offerCount} offers so far.`
                  : "Applications will appear here as soon as you start marking jobs applied from the Job Board."}
              </p>
            </Card>
            <Card className="border-[#1F2937] bg-[#111827] p-4 sm:p-5 lg:p-6">
              <h3 className="mb-2 text-[14px] font-semibold text-[#F59E0B]">Next Best Opportunity</h3>
              <p className="text-[12px] text-[#9CA3AF]">
                {stats?.highMatchJobs
                  ? `You currently have ${stats.highMatchJobs} high-match jobs ready for priority follow-up. Focus on the top-scoring roles first.`
                  : "Keep your agent running and import strong-fit roles to build out your high-match queue."}
              </p>
            </Card>
          </div>
        </>
      )}

      {viewingResume && (
        <DocumentPreviewModal
          doc={viewingResume}
          onClose={() => setViewingResume(null)}
        />
      )}
    </div>
  );
}
