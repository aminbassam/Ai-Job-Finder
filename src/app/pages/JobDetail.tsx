import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Sparkles,
  FileText,
  Bookmark,
  Check,
  ExternalLink,
  Loader2,
  AlertCircle,
  Briefcase,
} from "lucide-react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  getResult,
  generateResumeWithSelection,
  setMatchStatus,
  type JobMatch,
} from "../services/agent.service";
import { applicationsService } from "../services/applications.service";
import { DocumentPreviewModal, type DocumentPreviewRef } from "../components/documents/DocumentPreviewModal";
import { buildJobInsights } from "../utils/job-insights";
import { ResumeGenerationDialog } from "../components/resume/ResumeGenerationDialog";

function formatDate(value?: string) {
  if (!value) return null;
  try {
    return new Date(value).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
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
      year: "numeric",
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

function scoreColor(score?: number): string {
  if (score == null) return "#6B7280";
  if (score >= 75) return "#22C55E";
  if (score >= 55) return "#F59E0B";
  return "#EF4444";
}

type DetailTab = "overview" | "information" | "analysis";

function tabFromHash(hash: string): DetailTab {
  if (hash === "#job-information") return "information";
  if (hash === "#ai-analysis") return "analysis";
  return "overview";
}

export function JobDetail() {
  const { id } = useParams();
  const location = useLocation();
  const [job, setJob] = useState<JobMatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewingResume, setViewingResume] = useState<DocumentPreviewRef | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>(tabFromHash(location.hash));

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getResult(id)
      .then(setJob)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load job."))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    setActiveTab(tabFromHash(location.hash));
  }, [location.hash]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-[#4F8CFF]" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="p-8">
        <p className="flex items-center gap-2 text-[14px] text-[#EF4444]">
          <AlertCircle className="h-4 w-4" />
          {error ?? "Job not found."}
        </p>
      </div>
    );
  }

  const breakdown = job.scoreBreakdown;
  const score = job.aiScore ?? 0;
  const sourceJobId = displayJobId(job.externalId);
  const insights = buildJobInsights({
    title: job.title,
    description: job.description,
    requirements: job.requirements,
    location: job.location,
    remote: job.remote,
    scoreBreakdown: breakdown,
  });
  const hasAnalysis = Boolean(job.aiSummary || breakdown || insights.bestFitImprovements.length > 0 || insights.keywordFocus.length > 0);

  return (
    <div className="p-8">
      <Link to="/jobs" className="mb-6 inline-flex items-center gap-2 text-[14px] text-[#9CA3AF] transition-colors hover:text-white">
        <ArrowLeft className="h-4 w-4" />
        Back to Job Board
      </Link>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="border-[#1F2937] bg-[#111827] p-6">
            <div className="mb-4 flex items-start justify-between gap-6">
              <div className="flex-1">
                <h1 className="mb-2 text-[28px] font-semibold text-white">{job.title}</h1>
                <p className="mb-3 text-[18px] text-[#9CA3AF]">{job.company}</p>
                <div className="flex flex-wrap items-center gap-4 text-[14px] text-[#9CA3AF]">
                  {job.location && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4" />
                      {job.location}
                    </span>
                  )}
                  {job.jobType && (
                    <span className="flex items-center gap-1.5">
                      <Briefcase className="h-4 w-4" />
                      {job.jobType}
                    </span>
                  )}
                  {job.postedAt && (
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4" />
                      Posted {formatDate(job.postedAt)}
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] px-5 py-4 text-center">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#6B7280]">Fit Score</p>
                <p className="mt-1 text-[28px] font-semibold" style={{ color: scoreColor(job.aiScore) }}>
                  {job.aiScore ?? "—"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {job.source && (
                <span className="rounded-full border border-[#374151] bg-[#1F2937] px-2.5 py-1 text-[11px] text-[#9CA3AF]">
                  {job.source}
                </span>
              )}
              {job.remote && (
                <span className="rounded-full border border-[#4F8CFF]/20 bg-[#4F8CFF]/10 px-2.5 py-1 text-[11px] text-[#4F8CFF]">
                  Remote
                </span>
              )}
              {job.matchTier && (
                <span className="rounded-full border border-[#22C55E]/20 bg-[#22C55E]/10 px-2.5 py-1 text-[11px] text-[#22C55E]">
                  {job.matchTier}
                </span>
              )}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#6B7280]">Added To Job Board</p>
                <p className="mt-1 text-[13px] text-[#D1D5DB]">{formatDateTime(job.createdAt) ?? "Unknown"}</p>
              </div>
              <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#6B7280]">Status</p>
                <p className="mt-1 text-[13px] capitalize text-[#D1D5DB]">{job.status}</p>
              </div>
              <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#6B7280]">Salary Range</p>
                <p className="mt-1 text-[13px] text-[#D1D5DB]">
                  {(job.salaryMin || job.salaryMax)
                    ? [
                        job.salaryMin ? `$${Math.round(job.salaryMin / 1000)}k` : null,
                        job.salaryMax ? `$${Math.round(job.salaryMax / 1000)}k` : null,
                      ].filter(Boolean).join(" – ")
                    : "Not listed"}
                </p>
              </div>
              <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#6B7280]">Profile</p>
                <p className="mt-1 text-[13px] text-[#D1D5DB]">{job.profileName ?? "Imported manually"}</p>
              </div>
            </div>
          </Card>

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as DetailTab)} className="space-y-5">
            <div className="overflow-x-auto">
              <TabsList className="h-auto w-full min-w-max justify-start border border-[#1F2937] bg-[#111827] p-1">
                <TabsTrigger value="overview" className="gap-2 px-4 py-2 text-[13px] data-[state=active]:bg-[#4F8CFF] data-[state=active]:text-white">
                  <Briefcase className="h-4 w-4" />
                  Overview
                </TabsTrigger>
                <TabsTrigger value="information" className="gap-2 px-4 py-2 text-[13px] data-[state=active]:bg-[#4F8CFF] data-[state=active]:text-white">
                  <FileText className="h-4 w-4" />
                  More Information
                </TabsTrigger>
                <TabsTrigger value="analysis" className="gap-2 px-4 py-2 text-[13px] data-[state=active]:bg-[#4F8CFF] data-[state=active]:text-white">
                  <Sparkles className="h-4 w-4" />
                  AI Analysis
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview">
              <Card className="border-[#1F2937] bg-[#111827] p-6">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-[20px] font-semibold text-white">Role Overview</h2>
                    <p className="mt-1 text-[13px] text-[#9CA3AF]">
                      Quick understanding of the role, what matters most, and where to focus next.
                    </p>
                  </div>
                  <div className="rounded-lg border border-[#4F8CFF]/20 bg-[#4F8CFF]/10 px-4 py-3 text-right">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[#6B7280]">Fit Snapshot</p>
                    <p className="mt-1 text-[24px] font-semibold" style={{ color: scoreColor(job.aiScore) }}>
                      {job.aiScore ?? "—"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-4">
                    <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#6B7280]">Top Role Highlights</p>
                    {insights.roleHighlights.length > 0 ? (
                      <ul className="space-y-2">
                        {insights.roleHighlights.map((item, index) => (
                          <li key={index} className="pl-5 text-[14px] text-[#D1D5DB]">• {item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[13px] text-[#9CA3AF]">No structured highlights extracted yet.</p>
                    )}
                  </div>

                  <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-4">
                    <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#6B7280]">Best Next Improvements</p>
                    {insights.bestFitImprovements.length > 0 ? (
                      <ul className="space-y-2">
                        {insights.bestFitImprovements.slice(0, 4).map((item, index) => (
                          <li key={index} className="pl-5 text-[14px] text-[#D1D5DB]">• {item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[13px] text-[#9CA3AF]">AI fit-improvement suggestions will appear here when available.</p>
                    )}
                  </div>
                </div>

                {job.aiSummary && (
                  <div className="mt-5 rounded-lg border border-[#4F8CFF]/20 bg-[#4F8CFF]/5 p-4">
                    <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#4F8CFF]">AI Summary</p>
                    <p className="text-[14px] leading-relaxed text-[#D1D5DB]">{job.aiSummary}</p>
                  </div>
                )}

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveTab("information")}
                    className="rounded-lg border border-[#374151] bg-[#1F2937] px-4 py-2 text-[12px] font-medium text-[#D1D5DB] transition-all hover:border-[#4F8CFF]/30 hover:text-white"
                  >
                    Read Full Job Details
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("analysis")}
                    className="rounded-lg border border-[#374151] bg-[#1F2937] px-4 py-2 text-[12px] font-medium text-[#D1D5DB] transition-all hover:border-[#4F8CFF]/30 hover:text-white"
                  >
                    Review AI Analysis
                  </button>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="information">
              <Card id="job-information" className="scroll-mt-24 border-[#1F2937] bg-[#111827] p-6">
                <h2 className="mb-2 text-[20px] font-semibold text-white">More Information</h2>
                <p className="mb-5 text-[13px] text-[#9CA3AF]">
                  Full job description, requirements, source metadata, and the original posting link.
                </p>

                <h3 className="mb-4 text-[18px] font-semibold text-white">Job Description</h3>
                <p className="mb-6 whitespace-pre-wrap text-[14px] leading-relaxed text-[#9CA3AF]">
                  {job.description ?? "No description available yet."}
                </p>

                {insights.roleHighlights.length > 0 && (
                  <div className="mb-6">
                    <h3 className="mb-3 text-[16px] font-semibold text-white">Role Highlights</h3>
                    <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-4">
                      <ul className="space-y-2">
                        {insights.roleHighlights.map((item, index) => (
                          <li key={index} className="pl-5 text-[14px] text-[#D1D5DB]">• {item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {sourceJobId && (
                    <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-4">
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6B7280]">Source Job ID</p>
                      <p className="break-all font-mono text-[13px] text-[#D1D5DB]">{sourceJobId}</p>
                    </div>
                  )}

                  <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-4">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6B7280]">Original Posting</p>
                    {job.sourceUrl ? (
                      <a
                        href={job.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-[13px] text-[#4F8CFF] transition-colors hover:text-white"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open original job posting
                      </a>
                    ) : (
                      <p className="text-[13px] text-[#9CA3AF]">Original link not available.</p>
                    )}
                  </div>
                </div>

                {job.requirements && job.requirements.length > 0 ? (
                  <div className="mt-6">
                    <h3 className="mb-3 text-[16px] font-semibold text-white">Requirements</h3>
                    <ul className="space-y-2">
                      {job.requirements.map((req, index) => (
                        <li key={index} className="pl-5 text-[14px] text-[#9CA3AF]">• {req}</li>
                      ))}
                    </ul>
                  </div>
                ) : insights.keyRequirements.length > 0 ? (
                  <div className="mt-6">
                    <h3 className="mb-3 text-[16px] font-semibold text-white">Key Requirements</h3>
                    <ul className="space-y-2">
                      {insights.keyRequirements.map((req, index) => (
                        <li key={index} className="pl-5 text-[14px] text-[#9CA3AF]">• {req}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </Card>
            </TabsContent>

            <TabsContent value="analysis">
              <Card id="ai-analysis" className="scroll-mt-24 border-[#1F2937] bg-[#111827] p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-[#4F8CFF]" />
                  <h2 className="text-[20px] font-semibold text-white">AI Analysis</h2>
                </div>
                <p className="mb-5 text-[13px] text-[#9CA3AF]">
                  Understand why this role fits, where the gaps are, and what to improve in your resume before applying.
                </p>

                {job.aiSummary && (
                  <div className="mb-5 rounded-lg border border-[#4F8CFF]/20 bg-[#4F8CFF]/5 p-4">
                    <p className="text-[13px] leading-relaxed text-[#D1D5DB]">{job.aiSummary}</p>
                  </div>
                )}

                {breakdown ? (
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {[
                        { label: "Skills Match", value: breakdown.skillsMatch ?? 0, color: "#4F8CFF" },
                        { label: "Experience", value: breakdown.experienceMatch ?? 0, color: "#8B5CF6" },
                        { label: "Role Alignment", value: breakdown.roleAlignment ?? 0, color: "#22C55E" },
                        { label: "Location / Salary", value: breakdown.locationSalaryFit ?? 0, color: "#F59E0B" },
                      ].map((item) => (
                        <div key={item.label} className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-4">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-[13px] text-white">{item.label}</span>
                            <span className="text-[13px] font-semibold" style={{ color: item.color }}>
                              {item.value}/25
                            </span>
                          </div>
                          <Progress value={(item.value / 25) * 100} className="h-2" />
                        </div>
                      ))}
                    </div>

                    {breakdown.reasoning && (
                      <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-4">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6B7280]">Reasoning</p>
                        <p className="text-[13px] leading-relaxed text-[#D1D5DB]">{breakdown.reasoning}</p>
                      </div>
                    )}

                    {breakdown.strengths && breakdown.strengths.length > 0 && (
                      <div>
                        <h3 className="mb-3 text-[16px] font-semibold text-white">Why You’re A Strong Match</h3>
                        <div className="rounded-lg border border-[#22C55E]/20 bg-[#22C55E]/5 p-4">
                          <ul className="space-y-2">
                            {breakdown.strengths.map((item, index) => (
                              <li key={index} className="pl-5 text-[14px] text-[#D1D5DB]">• {item}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}

                    {breakdown.weaknesses && breakdown.weaknesses.length > 0 && (
                      <div>
                        <h3 className="mb-3 text-[16px] font-semibold text-white">Potential Concerns</h3>
                        <div className="rounded-lg border border-[#F59E0B]/20 bg-[#F59E0B]/5 p-4">
                          <ul className="space-y-2">
                            {breakdown.weaknesses.map((item, index) => (
                              <li key={index} className="pl-5 text-[14px] text-[#D1D5DB]">• {item}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}

                    {breakdown.areasToAddress && breakdown.areasToAddress.length > 0 && (
                      <div>
                        <h3 className="mb-3 text-[16px] font-semibold text-white">Areas To Address</h3>
                        <div className="rounded-lg border border-[#FB923C]/20 bg-[#FB923C]/5 p-4">
                          <ul className="space-y-2">
                            {breakdown.areasToAddress.map((item, index) => (
                              <li key={index} className="pl-5 text-[14px] text-[#D1D5DB]">• {item}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-[#1F2937] bg-[#0B0F14] p-5">
                    <p className="text-[13px] text-[#9CA3AF]">
                      Detailed scoring is not available yet for this job, but the fit guidance below is still based on the role description.
                    </p>
                  </div>
                )}

                {insights.bestFitImprovements.length > 0 && (
                  <div className="mt-6">
                    <h3 className="mb-3 text-[16px] font-semibold text-white">How To Improve Fit</h3>
                    <div className="rounded-lg border border-[#FB923C]/20 bg-[#FB923C]/5 p-4">
                      <ul className="space-y-2">
                        {insights.bestFitImprovements.map((item, index) => (
                          <li key={index} className="pl-5 text-[14px] text-[#D1D5DB]">• {item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {insights.keywordFocus.length > 0 && (
                  <div className="mt-6">
                    <h3 className="mb-3 text-[16px] font-semibold text-white">Keywords To Mirror In Your Resume</h3>
                    <div className="flex flex-wrap gap-2">
                      {insights.keywordFocus.map((item) => (
                        <span
                          key={item}
                          className="rounded-full border border-[#374151] bg-[#1F2937] px-2.5 py-1 text-[12px] text-[#D1D5DB]"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {!hasAnalysis && (
                  <div className="rounded-lg border border-dashed border-[#1F2937] bg-[#0B0F14] p-5">
                    <p className="text-[13px] text-[#9CA3AF]">
                      AI analysis will appear here after this job has been scored.
                    </p>
                  </div>
                )}
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <Card className="sticky top-6 border-[#1F2937] bg-[#111827] p-6">
            <div className="space-y-3">
              {job.linkedResume ? (
                <Button
                  className="w-full bg-[#22C55E] text-white hover:bg-[#22C55E]/90"
                  onClick={() =>
                    setViewingResume({
                      id: job.linkedResume!.id,
                      title: job.linkedResume!.title,
                      jobTitle: job.title,
                      company: job.company,
                    })
                  }
                >
                  <FileText className="mr-2 h-4 w-4" />
                  View Tailored Resume
                </Button>
              ) : (
                <Button
                  className="w-full bg-[#4F8CFF] text-white hover:bg-[#4F8CFF]/90"
                  disabled={generating}
                  onClick={() => setShowResumeDialog(true)}
                >
                  {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                  {generating ? "Generating…" : "Generate Resume"}
                </Button>
              )}

              <Button
                className="w-full border-[#374151] bg-[#1F2937] text-white hover:bg-[#374151]"
                variant="outline"
                onClick={async () => {
                  try {
                    const nextStatus = job.status === "saved" ? "new" : "saved";
                    await setMatchStatus(job.id, nextStatus);
                    setJob((prev) => (prev ? { ...prev, status: nextStatus } : prev));
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed to update job.");
                  }
                }}
              >
                <Bookmark className="mr-2 h-4 w-4" />
                {job.status === "saved" ? "Unsave Job" : "Save Job"}
              </Button>

              <Button
                className="w-full border-[#374151] bg-[#1F2937] text-white hover:bg-[#374151]"
                variant="outline"
                onClick={async () => {
                  try {
                    await applicationsService.createFromMatch(job.id);
                    setJob((prev) => (prev ? { ...prev, status: "applied" } : prev));
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed to create application.");
                  }
                }}
              >
                <Check className="mr-2 h-4 w-4" />
                Mark Applied
              </Button>

              {job.sourceUrl && (
                <a
                  href={job.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-[#374151] bg-[#1F2937] px-4 py-2 text-[14px] text-white transition-colors hover:bg-[#374151]"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open Original Posting
                </a>
              )}

              <div className="border-t border-[#1F2937] pt-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6B7280]">Quick Navigation</p>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("information")}
                    className="w-full rounded-md border border-[#374151] bg-[#1F2937] px-4 py-2 text-left text-[13px] text-white transition-colors hover:bg-[#374151]"
                  >
                    Open More Information
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("analysis")}
                    className="w-full rounded-md border border-[#374151] bg-[#1F2937] px-4 py-2 text-left text-[13px] text-white transition-colors hover:bg-[#374151]"
                  >
                    Open AI Analysis
                  </button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {viewingResume && (
        <DocumentPreviewModal doc={viewingResume} onClose={() => setViewingResume(null)} />
      )}

      <ResumeGenerationDialog
        open={showResumeDialog}
        onOpenChange={setShowResumeDialog}
        jobTitle={job.title}
        company={job.company}
        generating={generating}
        error={error}
        onGenerate={async (selection) => {
          setGenerating(true);
          setError(null);
          try {
            const result = await generateResumeWithSelection(job.id, selection);
            if (result.resume) {
              setJob((prev) => prev ? { ...prev, resumeGenerated: true, linkedResume: result.resume } : prev);
            }
            setShowResumeDialog(false);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to generate resume.");
          } finally {
            setGenerating(false);
          }
        }}
      />
    </div>
  );
}
