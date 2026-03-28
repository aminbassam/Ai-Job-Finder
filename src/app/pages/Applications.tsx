import { useState } from "react";
import { LayoutGrid, Table as TableIcon } from "lucide-react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { ScoreBadge } from "../components/shared/ScoreBadge";
import { mockApplications } from "../data/mockData";

export function Applications() {
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      new: "bg-[#4F8CFF]/10 text-[#4F8CFF] border-[#4F8CFF]/30",
      ready: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30",
      applied: "bg-[#8B5CF6]/10 text-[#8B5CF6] border-[#8B5CF6]/30",
      interview: "bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30",
      rejected: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/30",
    };
    return colors[status] || colors.new;
  };

  const kanbanColumns = [
    { id: "new", title: "New", status: "new" },
    { id: "ready", title: "Ready", status: "ready" },
    { id: "applied", title: "Applied", status: "applied" },
    { id: "interview", title: "Interview", status: "interview" },
    { id: "rejected", title: "Rejected", status: "rejected" },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[32px] font-semibold text-white mb-2">Applications</h1>
          <p className="text-[14px] text-[#9CA3AF]">
            Track your job applications and their status
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
            <TableIcon className="h-4 w-4 mr-2" />
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
            <LayoutGrid className="h-4 w-4 mr-2" />
            Kanban
          </Button>
        </div>
      </div>

      {/* Table View */}
      {viewMode === "table" && (
        <Card className="bg-[#111827] border-[#1F2937]">
          <Table>
            <TableHeader>
              <TableRow className="border-[#1F2937] hover:bg-transparent">
                <TableHead className="text-[#9CA3AF]">Job Title</TableHead>
                <TableHead className="text-[#9CA3AF]">Company</TableHead>
                <TableHead className="text-[#9CA3AF]">Status</TableHead>
                <TableHead className="text-[#9CA3AF]">Score</TableHead>
                <TableHead className="text-[#9CA3AF]">Source</TableHead>
                <TableHead className="text-[#9CA3AF]">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockApplications.map((app) => (
                <TableRow key={app.id} className="border-[#1F2937] hover:bg-[#0B0F14]">
                  <TableCell className="text-white font-medium">{app.jobTitle}</TableCell>
                  <TableCell className="text-[#9CA3AF]">{app.company}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={`text-[11px] capitalize ${getStatusColor(app.status)}`}>
                      {app.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <ScoreBadge score={app.score} size="sm" />
                  </TableCell>
                  <TableCell className="text-[#9CA3AF]">{app.source}</TableCell>
                  <TableCell className="text-[#9CA3AF]">
                    {app.appliedDate || "Not applied"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Kanban View */}
      {viewMode === "kanban" && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {kanbanColumns.map((column) => {
            const apps = mockApplications.filter((app) => app.status === column.status);
            return (
              <div key={column.id}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[14px] font-semibold text-white">{column.title}</h3>
                  <Badge variant="secondary" className="text-[11px] bg-[#1F2937] text-[#9CA3AF]">
                    {apps.length}
                  </Badge>
                </div>
                <div className="space-y-3">
                  {apps.length === 0 ? (
                    <Card className="bg-[#111827] border-[#1F2937] border-dashed p-6 text-center">
                      <p className="text-[12px] text-[#9CA3AF]">No applications</p>
                    </Card>
                  ) : (
                    apps.map((app) => (
                      <Card
                        key={app.id}
                        className="bg-[#111827] border-[#1F2937] p-4 hover:border-[#4F8CFF]/30 transition-colors cursor-pointer"
                      >
                        <div className="mb-3">
                          <h4 className="text-[13px] font-semibold text-white mb-1 line-clamp-2">
                            {app.jobTitle}
                          </h4>
                          <p className="text-[12px] text-[#9CA3AF]">{app.company}</p>
                        </div>
                        <div className="flex items-center justify-between">
                          <ScoreBadge score={app.score} size="sm" />
                          <span className="text-[11px] text-[#9CA3AF]">{app.source}</span>
                        </div>
                        {app.appliedDate && (
                          <p className="text-[10px] text-[#9CA3AF] mt-2">Applied {app.appliedDate}</p>
                        )}
                      </Card>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-8">
        <Card className="bg-[#111827] border-[#1F2937] p-6">
          <p className="text-[13px] text-[#9CA3AF] mb-1">Total Applications</p>
          <p className="text-[24px] font-semibold text-white">{mockApplications.length}</p>
        </Card>
        <Card className="bg-[#111827] border-[#1F2937] p-6">
          <p className="text-[13px] text-[#9CA3AF] mb-1">Applied</p>
          <p className="text-[24px] font-semibold text-[#8B5CF6]">
            {mockApplications.filter((a) => a.status === "applied").length}
          </p>
        </Card>
        <Card className="bg-[#111827] border-[#1F2937] p-6">
          <p className="text-[13px] text-[#9CA3AF] mb-1">Interview Stage</p>
          <p className="text-[24px] font-semibold text-[#22C55E]">
            {mockApplications.filter((a) => a.status === "interview").length}
          </p>
        </Card>
        <Card className="bg-[#111827] border-[#1F2937] p-6">
          <p className="text-[13px] text-[#9CA3AF] mb-1">Response Rate</p>
          <p className="text-[24px] font-semibold text-[#4F8CFF]">75%</p>
        </Card>
      </div>
    </div>
  );
}
