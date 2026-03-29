import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, Loader2, Table as TableIcon, AlertCircle, FileText } from "lucide-react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { ScoreBadge } from "../components/shared/ScoreBadge";
import { applicationsService, type ApplicationItem, type ApplicationStatus } from "../services/applications.service";

const STATUS_OPTIONS: ApplicationStatus[] = [
  "draft",
  "ready",
  "applied",
  "interview",
  "offer",
  "accepted",
  "rejected",
  "withdrawn",
];

function getStatusColor(status: ApplicationStatus) {
  const colors: Record<ApplicationStatus, string> = {
    draft: "bg-[#374151]/20 text-[#D1D5DB] border-[#374151]",
    ready: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30",
    applied: "bg-[#8B5CF6]/10 text-[#8B5CF6] border-[#8B5CF6]/30",
    interview: "bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30",
    offer: "bg-[#06B6D4]/10 text-[#06B6D4] border-[#06B6D4]/30",
    accepted: "bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30",
    rejected: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/30",
    withdrawn: "bg-[#6B7280]/20 text-[#9CA3AF] border-[#6B7280]/30",
  };
  return colors[status];
}

function formatDate(value?: string | null) {
  if (!value) return "Not applied";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusLabel(status: ApplicationStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function Applications() {
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function loadApplications() {
    setLoading(true);
    setError(null);
    try {
      const data = await applicationsService.list();
      setApplications(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load applications.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadApplications();
  }, []);

  async function handleStatusChange(applicationId: string, status: ApplicationStatus) {
    const previous = applications;
    setUpdatingId(applicationId);
    setApplications((current) =>
      current.map((application) =>
        application.id === applicationId ? { ...application, status } : application
      )
    );

    try {
      await applicationsService.update(applicationId, { status });
    } catch (err) {
      setApplications(previous);
      setError(err instanceof Error ? err.message : "Failed to update application status.");
    } finally {
      setUpdatingId(null);
    }
  }

  const kanbanColumns = useMemo(
    () => [
      { id: "draft", title: "Draft" },
      { id: "ready", title: "Ready" },
      { id: "applied", title: "Applied" },
      { id: "interview", title: "Interview" },
      { id: "offer", title: "Offer" },
      { id: "accepted", title: "Accepted" },
      { id: "rejected", title: "Rejected" },
    ] satisfies { id: ApplicationStatus; title: string }[],
    []
  );

  const totalApplications = applications.length;
  const appliedCount = applications.filter((application) => application.status === "applied").length;
  const interviewCount = applications.filter((application) => application.status === "interview").length;
  const avgScore = totalApplications > 0
    ? Math.round(applications.reduce((sum, application) => sum + application.score, 0) / totalApplications)
    : 0;

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="mb-2 text-[32px] font-semibold text-white">Applications</h1>
          <p className="text-[14px] text-[#9CA3AF]">
            Track applied jobs, update application stages manually, and review the combined fit score for each submission.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === "table" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("table")}
            className={
              viewMode === "table"
                ? "bg-[#4F8CFF] hover:bg-[#4F8CFF]/90 text-white"
                : "bg-[#1F2937] hover:bg-[#374151] text-white border-[#374151]"
            }
          >
            <TableIcon className="mr-2 h-4 w-4" />
            Table
          </Button>
          <Button
            variant={viewMode === "kanban" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("kanban")}
            className={
              viewMode === "kanban"
                ? "bg-[#4F8CFF] hover:bg-[#4F8CFF]/90 text-white"
                : "bg-[#1F2937] hover:bg-[#374151] text-white border-[#374151]"
            }
          >
            <LayoutGrid className="mr-2 h-4 w-4" />
            Kanban
          </Button>
        </div>
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
      ) : totalApplications === 0 ? (
        <Card className="border-[#1F2937] bg-[#111827] p-10 text-center">
          <FileText className="mx-auto mb-4 h-8 w-8 text-[#4F8CFF]" />
          <h2 className="mb-2 text-[18px] font-semibold text-white">No applications yet</h2>
          <p className="text-[13px] text-[#9CA3AF]">
            Mark a job as applied from the Job Board and it will appear here automatically.
          </p>
        </Card>
      ) : (
        <>
          {viewMode === "table" && (
            <Card className="border-[#1F2937] bg-[#111827]">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1F2937] hover:bg-transparent">
                    <TableHead className="text-[#9CA3AF]">Job Title</TableHead>
                    <TableHead className="text-[#9CA3AF]">Company</TableHead>
                    <TableHead className="text-[#9CA3AF]">Status</TableHead>
                    <TableHead className="text-[#9CA3AF]">Score</TableHead>
                    <TableHead className="text-[#9CA3AF]">Source</TableHead>
                    <TableHead className="text-[#9CA3AF]">Applied</TableHead>
                    <TableHead className="text-[#9CA3AF]">Resume</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {applications.map((application) => (
                    <TableRow key={application.id} className="border-[#1F2937] hover:bg-[#0B0F14]">
                      <TableCell className="text-white font-medium">{application.jobTitle}</TableCell>
                      <TableCell className="text-[#9CA3AF]">{application.company}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className={`text-[11px] capitalize ${getStatusColor(application.status)}`}>
                            {application.status}
                          </Badge>
                          <select
                            value={application.status}
                            onChange={(event) => void handleStatusChange(application.id, event.target.value as ApplicationStatus)}
                            disabled={updatingId === application.id}
                            className="rounded-md border border-[#374151] bg-[#0B0F14] px-2 py-1 text-[12px] text-white outline-none"
                          >
                            {STATUS_OPTIONS.map((status) => (
                              <option key={status} value={status}>{statusLabel(status)}</option>
                            ))}
                          </select>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <ScoreBadge score={application.score} size="sm" />
                          <p className="text-[10px] text-[#9CA3AF]">
                            Resume {application.resumeScore}% · Job Fit {application.jobFitScore}%
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-[#9CA3AF]">{application.source}</TableCell>
                      <TableCell className="text-[#9CA3AF]">{formatDate(application.appliedDate)}</TableCell>
                      <TableCell className="max-w-[280px] text-[12px] text-[#D1D5DB]">
                        {application.resumeTitle ?? "No resume linked"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          {viewMode === "kanban" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-7">
              {kanbanColumns.map((column) => {
                const items = applications.filter((application) => application.status === column.id);
                return (
                  <div key={column.id}>
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-[14px] font-semibold text-white">{column.title}</h3>
                      <Badge variant="secondary" className="bg-[#1F2937] text-[11px] text-[#9CA3AF]">
                        {items.length}
                      </Badge>
                    </div>
                    <div className="space-y-3">
                      {items.length === 0 ? (
                        <Card className="border-dashed border-[#1F2937] bg-[#111827] p-5 text-center">
                          <p className="text-[11px] text-[#9CA3AF]">No applications</p>
                        </Card>
                      ) : (
                        items.map((application) => (
                          <Card key={application.id} className="border-[#1F2937] bg-[#111827] p-4">
                            <div className="mb-3">
                              <h4 className="mb-1 line-clamp-2 text-[13px] font-semibold text-white">{application.jobTitle}</h4>
                              <p className="text-[12px] text-[#9CA3AF]">{application.company}</p>
                            </div>
                            <div className="mb-3 flex items-center justify-between gap-2">
                              <ScoreBadge score={application.score} size="sm" />
                              <span className="text-[10px] text-[#9CA3AF]">{application.source}</span>
                            </div>
                            <div className="mb-2 text-[10px] text-[#9CA3AF]">
                              Resume {application.resumeScore}% · Job Fit {application.jobFitScore}%
                            </div>
                            <select
                              value={application.status}
                              onChange={(event) => void handleStatusChange(application.id, event.target.value as ApplicationStatus)}
                              disabled={updatingId === application.id}
                              className="w-full rounded-md border border-[#374151] bg-[#0B0F14] px-2 py-1.5 text-[12px] text-white outline-none"
                            >
                              {STATUS_OPTIONS.map((status) => (
                                <option key={status} value={status}>{statusLabel(status)}</option>
                              ))}
                            </select>
                            <p className="mt-2 text-[10px] text-[#9CA3AF]">{formatDate(application.appliedDate)}</p>
                          </Card>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-4">
            <Card className="border-[#1F2937] bg-[#111827] p-6">
              <p className="mb-1 text-[13px] text-[#9CA3AF]">Total Applications</p>
              <p className="text-[24px] font-semibold text-white">{totalApplications}</p>
            </Card>
            <Card className="border-[#1F2937] bg-[#111827] p-6">
              <p className="mb-1 text-[13px] text-[#9CA3AF]">Applied</p>
              <p className="text-[24px] font-semibold text-[#8B5CF6]">{appliedCount}</p>
            </Card>
            <Card className="border-[#1F2937] bg-[#111827] p-6">
              <p className="mb-1 text-[13px] text-[#9CA3AF]">Interview Stage</p>
              <p className="text-[24px] font-semibold text-[#22C55E]">{interviewCount}</p>
            </Card>
            <Card className="border-[#1F2937] bg-[#111827] p-6">
              <p className="mb-1 text-[13px] text-[#9CA3AF]">Average Score</p>
              <p className="text-[24px] font-semibold text-[#4F8CFF]">{avgScore}%</p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
