import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Briefcase, Loader2, Send, Target, TrendingUp } from "lucide-react";
import { Card } from "../components/ui/card";
import { StatCard } from "../components/shared/StatCard";
import { analyticsService, type DashboardAnalytics, type FunnelPoint, type JobsPerWeekPoint, type ScoreDistributionPoint, type SourcePerformancePoint } from "../services/analytics.service";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

function stageCount(funnel: FunnelPoint[], stage: string) {
  return funnel.find((entry) => entry.stage === stage)?.count ?? 0;
}

function weightedAverageScore(sources: SourcePerformancePoint[]) {
  const totalJobs = sources.reduce((sum, source) => sum + source.jobs, 0);
  if (totalJobs === 0) return 0;
  const weighted = sources.reduce((sum, source) => sum + (source.avgScore * source.jobs), 0);
  return Math.round(weighted / totalJobs);
}

function tooltipStyle() {
  return {
    backgroundColor: "#111827",
    border: "1px solid #1F2937",
    borderRadius: "8px",
    color: "#F5F5F7",
  };
}

function EmptyAnalyticsPanel({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="flex h-[300px] items-center justify-center rounded-xl border border-dashed border-[#1F2937] bg-[#0B0F14] p-6 text-center">
      <div>
        <p className="text-[14px] font-medium text-white">{title}</p>
        <p className="mt-1 text-[12px] text-[#9CA3AF]">{message}</p>
      </div>
    </div>
  );
}

export function Analytics() {
  const COLORS = ["#4F8CFF", "#22C55E", "#F59E0B", "#EF4444", "#8B5CF6"];
  const [dashboardStats, setDashboardStats] = useState<DashboardAnalytics | null>(null);
  const [jobsPerWeek, setJobsPerWeek] = useState<JobsPerWeekPoint[]>([]);
  const [sourcePerformance, setSourcePerformance] = useState<SourcePerformancePoint[]>([]);
  const [funnel, setFunnel] = useState<FunnelPoint[]>([]);
  const [scoreDistribution, setScoreDistribution] = useState<ScoreDistributionPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAnalytics() {
      setLoading(true);
      setError(null);
      try {
        const [
          nextDashboardStats,
          nextJobsPerWeek,
          nextSourcePerformance,
          nextFunnel,
          nextScoreDistribution,
        ] = await Promise.all([
          analyticsService.getDashboard(),
          analyticsService.getJobsPerWeek(),
          analyticsService.getSourcePerformance(),
          analyticsService.getFunnel(),
          analyticsService.getScoreDistribution(),
        ]);

        if (cancelled) return;

        setDashboardStats(nextDashboardStats);
        setJobsPerWeek(nextJobsPerWeek);
        setSourcePerformance(nextSourcePerformance);
        setFunnel(nextFunnel);
        setScoreDistribution(nextScoreDistribution);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load analytics.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadAnalytics();

    return () => {
      cancelled = true;
    };
  }, []);

  const totalJobsFound = stageCount(funnel, "Jobs Found");
  const highMatchCount = stageCount(funnel, "High Match");
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
  const hasAnyAnalyticsData =
    totalJobsFound > 0 ||
    highMatchCount > 0 ||
    appliedCount > 0 ||
    interviewCount > 0 ||
    offerCount > 0 ||
    (dashboardStats?.resumesGenerated ?? 0) > 0 ||
    jobsPerWeek.some((entry) => entry.jobs > 0) ||
    sourcePerformance.length > 0 ||
    scoreDistribution.some((entry) => entry.count > 0);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="mb-2 text-[32px] font-semibold text-white">Analytics</h1>
        <p className="text-[14px] text-[#9CA3AF]">
          Track your real job-search performance across jobs found, match quality, resumes generated, and application progress.
        </p>
        {!loading && !error && !hasAnyAnalyticsData && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#1F2937] bg-[#111827] px-4 py-3 text-[13px] text-[#D1D5DB]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#9CA3AF]" />
            <p>
              No data available to display yet. Once jobs, resumes, and applications start coming in, your analytics will appear here automatically.
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-[#7F1D1D] bg-[#7F1D1D]/10 px-4 py-3 text-[13px] text-[#FCA5A5]">
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
          <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Jobs Found"
              value={totalJobsFound}
              icon={Briefcase}
              change={hasAnyAnalyticsData ? `${dashboardStats?.jobsFoundToday ?? 0} added today` : "No data available yet"}
              changeType={hasAnyAnalyticsData ? "positive" : "neutral"}
            />
            <StatCard
              title="Avg Match Score"
              value={`${averageMatchScore}%`}
              icon={Target}
              change={hasAnyAnalyticsData ? `${highMatchCount} jobs at 70%+` : "No data available yet"}
              changeType={hasAnyAnalyticsData && averageMatchScore >= 70 ? "positive" : "neutral"}
            />
            <StatCard
              title="Applications Sent"
              value={appliedCount}
              icon={Send}
              change={hasAnyAnalyticsData ? `${offerCount} offers in the funnel` : "No data available yet"}
              changeType={offerCount > 0 ? "positive" : "neutral"}
            />
            <StatCard
              title="Interview Rate"
              value={`${interviewRate}%`}
              icon={TrendingUp}
              change={hasAnyAnalyticsData ? `${interviewCount} interviews tracked` : "No data available yet"}
              changeType={hasAnyAnalyticsData && interviewRate >= 20 ? "positive" : "neutral"}
            />
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="border-[#1F2937] bg-[#111827] p-5">
              <p className="text-[11px] uppercase tracking-wide text-[#6B7280]">Resumes Generated</p>
              <p className="mt-2 text-[24px] font-semibold text-white">{dashboardStats?.resumesGenerated ?? 0}</p>
              <p className="text-[12px] text-[#9CA3AF]">
                {(dashboardStats?.resumesGenerated ?? 0) > 0 ? "Tailored resumes created from your scored jobs." : "No data available to display yet."}
              </p>
            </Card>
            <Card className="border-[#1F2937] bg-[#111827] p-5">
              <p className="text-[11px] uppercase tracking-wide text-[#6B7280]">Best Source</p>
              <p className="mt-2 text-[18px] font-semibold text-white">{bestSource?.source ?? "No source data yet"}</p>
              <p className="text-[12px] text-[#9CA3AF]">
                {bestSource ? `${bestSource.avgScore}% average match score across ${bestSource.jobs} jobs.` : "Source insights appear after jobs are imported or found."}
              </p>
            </Card>
            <Card className="border-[#1F2937] bg-[#111827] p-5">
              <p className="text-[11px] uppercase tracking-wide text-[#6B7280]">Strongest Week</p>
              <p className="mt-2 text-[18px] font-semibold text-white">
                {strongestWeek ? `${strongestWeek.week} · ${strongestWeek.jobs} jobs` : "No weekly history yet"}
              </p>
              <p className="text-[12px] text-[#9CA3AF]">Your best discovery week based on saved and scored jobs.</p>
            </Card>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="border-[#1F2937] bg-[#111827] p-6">
              <h2 className="mb-6 text-[18px] font-semibold text-white">Jobs Found Per Week</h2>
              {jobsPerWeek.some((entry) => entry.jobs > 0) ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={jobsPerWeek}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                    <XAxis dataKey="week" stroke="#9CA3AF" style={{ fontSize: 12 }} />
                    <YAxis stroke="#9CA3AF" style={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle()} />
                    <Line
                      type="monotone"
                      dataKey="jobs"
                      stroke="#4F8CFF"
                      strokeWidth={2}
                      dot={{ fill: "#4F8CFF", r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyAnalyticsPanel
                  title="No data available to display"
                  message="Weekly job trends will appear here once jobs are found or imported."
                />
              )}
            </Card>

            <Card className="border-[#1F2937] bg-[#111827] p-6">
              <h2 className="mb-6 text-[18px] font-semibold text-white">Match Score Distribution</h2>
              {scoreDistribution.some((entry) => entry.count > 0) ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={scoreDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                    <XAxis dataKey="range" stroke="#9CA3AF" style={{ fontSize: 12 }} />
                    <YAxis stroke="#9CA3AF" style={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle()} />
                    <Bar dataKey="count" fill="#4F8CFF" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyAnalyticsPanel
                  title="No data available to display"
                  message="Score distribution will appear after jobs have been scored."
                />
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="border-[#1F2937] bg-[#111827] p-6">
              <h2 className="mb-6 text-[18px] font-semibold text-white">Source Performance</h2>
              <div className="space-y-5">
                {sourcePerformance.length === 0 ? (
                  <p className="text-[13px] text-[#9CA3AF]">No source performance data yet.</p>
                ) : (
                  sourcePerformance.map((source, index) => (
                    <div key={source.source} className="flex items-center justify-between">
                      <div className="flex flex-1 items-center gap-3">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <div className="flex-1">
                          <p className="text-[13px] font-medium text-white">{source.source}</p>
                          <p className="text-[12px] text-[#9CA3AF]">{source.jobs} jobs found</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[14px] font-semibold text-white">{Math.round(source.avgScore)}%</p>
                        <p className="text-[11px] text-[#9CA3AF]">avg score</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card className="border-[#1F2937] bg-[#111827] p-6">
              <h2 className="mb-6 text-[18px] font-semibold text-white">Application Funnel</h2>
              {funnel.some((entry) => entry.count > 0) ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={funnel} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                    <XAxis type="number" stroke="#9CA3AF" style={{ fontSize: 12 }} allowDecimals={false} />
                    <YAxis dataKey="stage" type="category" stroke="#9CA3AF" style={{ fontSize: 12 }} width={100} />
                    <Tooltip contentStyle={tooltipStyle()} />
                    <Bar dataKey="count" fill="#22C55E" radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyAnalyticsPanel
                  title="No data available to display"
                  message="Application funnel analytics will appear once you begin saving and applying to jobs."
                />
              )}
            </Card>
          </div>

          <Card className="mt-6 border-[#1F2937] bg-[#111827] p-6">
            <h2 className="mb-4 text-[18px] font-semibold text-white">Key Insights</h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="rounded-lg border border-[#4F8CFF]/20 bg-[#4F8CFF]/5 p-4">
                <h3 className="mb-2 text-[14px] font-semibold text-[#4F8CFF]">Best Source</h3>
                <p className="text-[13px] text-[#9CA3AF]">
                  {bestSource
                    ? `${bestSource.source} is leading with an average match score of ${Math.round(bestSource.avgScore)}%.`
                    : "Source performance will appear here after jobs are added."}
                </p>
              </div>
              <div className="rounded-lg border border-[#22C55E]/20 bg-[#22C55E]/5 p-4">
                <h3 className="mb-2 text-[14px] font-semibold text-[#22C55E]">Strong Week</h3>
                <p className="text-[13px] text-[#9CA3AF]">
                  {strongestWeek
                    ? `${strongestWeek.week} was your strongest week with ${strongestWeek.jobs} jobs added.`
                    : "Weekly momentum insight will show once more history is available."}
                </p>
              </div>
              <div className="rounded-lg border border-[#F59E0B]/20 bg-[#F59E0B]/5 p-4">
                <h3 className="mb-2 text-[14px] font-semibold text-[#F59E0B]">Opportunity</h3>
                <p className="text-[13px] text-[#9CA3AF]">
                  {highMatchCount > 0
                    ? `You have ${highMatchCount} high-match jobs in the pipeline. Prioritizing those should improve conversion.`
                    : "As soon as jobs are scored above 70%, they’ll be highlighted here as priority opportunities."}
                </p>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
