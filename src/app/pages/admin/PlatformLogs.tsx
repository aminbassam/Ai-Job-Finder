import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Activity,
  CheckCircle2,
  RefreshCw,
  ScrollText,
  Wrench,
  Zap,
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { api } from "../../services/api";

interface PlatformLogSummary {
  total: number;
  errors: number;
  warnings: number;
  info: number;
  activeConnectors: number;
  failedRuns24h: number;
  completedRuns24h: number;
}

interface PlatformLogEntry {
  id: string;
  category: "job_agent" | "connector" | "activity";
  level: "info" | "warning" | "error";
  status: string;
  eventAt: string;
  userId?: string;
  userEmail?: string;
  userName?: string | null;
  source: string;
  message: string;
  details: Record<string, unknown>;
}

interface PlatformLogsResponse {
  summary: PlatformLogSummary;
  logs: PlatformLogEntry[];
}

function fmtDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function levelBadge(level: PlatformLogEntry["level"]) {
  if (level === "error") {
    return "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20";
  }
  if (level === "warning") {
    return "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20";
  }
  return "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20";
}

function categoryMeta(category: PlatformLogEntry["category"]) {
  if (category === "connector") {
    return { label: "Connector", icon: Wrench };
  }
  if (category === "activity") {
    return { label: "Activity", icon: Activity };
  }
  return { label: "Job Agent", icon: Zap };
}

function renderDetails(details: Record<string, unknown>) {
  const entries = Object.entries(details).filter(([, value]) => value !== null && value !== undefined && value !== "");
  if (entries.length === 0) return "—";

  return entries
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
    .join(" • ");
}

export function PlatformLogs() {
  const [data, setData] = useState<PlatformLogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("all");
  const [level, setLevel] = useState("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "120" });
      if (category !== "all") params.set("category", category);
      if (level !== "all") params.set("level", level);
      const response = await api.get<PlatformLogsResponse>(`/admin/logs?${params.toString()}`);
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load platform logs.");
    } finally {
      setLoading(false);
    }
  }, [category, level]);

  useEffect(() => {
    load();
  }, [load]);

  const logs = (data?.logs ?? []).filter((entry) => {
    if (!search.trim()) return true;
    const haystack = [
      entry.source,
      entry.message,
      entry.userName ?? "",
      entry.userEmail ?? "",
      entry.status,
      renderDetails(entry.details),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-white">Platform Logs</h1>
          <p className="text-[14px] text-[#9CA3AF] mt-1">
            Track job-agent runs, connector health, and user activity in one place.
          </p>
        </div>
        <Button
          onClick={load}
          disabled={loading}
          className="bg-[#4F8CFF] hover:bg-[#4F8CFF]/90 text-white"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh Logs
        </Button>
      </div>

      {data && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="bg-[#111827] border-[#1F2937] p-4">
            <p className="text-[12px] text-[#6B7280]">Log entries</p>
            <p className="mt-2 text-[26px] font-bold text-white">{data.summary.total}</p>
            <p className="mt-1 text-[12px] text-[#9CA3AF]">Current filtered system events</p>
          </Card>
          <Card className="bg-[#111827] border-[#1F2937] p-4">
            <p className="text-[12px] text-[#6B7280]">Issues to review</p>
            <div className="mt-2 flex items-center gap-4">
              <span className="text-[22px] font-bold text-[#EF4444]">{data.summary.errors}</span>
              <span className="text-[14px] font-semibold text-[#F59E0B]">{data.summary.warnings} warnings</span>
            </div>
            <p className="mt-1 text-[12px] text-[#9CA3AF]">Failures and degraded states</p>
          </Card>
          <Card className="bg-[#111827] border-[#1F2937] p-4">
            <p className="text-[12px] text-[#6B7280]">Job Agent last 24h</p>
            <div className="mt-2 flex items-center gap-4">
              <span className="text-[22px] font-bold text-white">{data.summary.completedRuns24h}</span>
              <span className="text-[14px] font-semibold text-[#EF4444]">{data.summary.failedRuns24h} failed</span>
            </div>
            <p className="mt-1 text-[12px] text-[#9CA3AF]">Completed vs failed runs</p>
          </Card>
          <Card className="bg-[#111827] border-[#1F2937] p-4">
            <p className="text-[12px] text-[#6B7280]">Active connectors</p>
            <p className="mt-2 text-[26px] font-bold text-white">{data.summary.activeConnectors}</p>
            <p className="mt-1 text-[12px] text-[#9CA3AF]">Sources currently enabled</p>
          </Card>
        </div>
      )}

      <Card className="bg-[#111827] border-[#1F2937] p-4">
        <div className="grid gap-3 lg:grid-cols-[1.2fr,180px,180px,auto]">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search message, profile, connector, or user…"
            className="bg-[#0B0F14] border-[#1F2937] text-white placeholder:text-[#4B5563]"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-10 rounded-md border border-[#1F2937] bg-[#0B0F14] px-3 text-[13px] text-white outline-none focus:border-[#4F8CFF]"
          >
            <option value="all">All categories</option>
            <option value="job_agent">Job Agent</option>
            <option value="connector">Connector</option>
            <option value="activity">Activity</option>
          </select>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="h-10 rounded-md border border-[#1F2937] bg-[#0B0F14] px-3 text-[13px] text-white outline-none focus:border-[#4F8CFF]"
          >
            <option value="all">All levels</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>
          <div className="flex items-center text-[12px] text-[#6B7280]">
            Showing {logs.length} entries
          </div>
        </div>
      </Card>

      {error && (
        <Card className="bg-[#EF4444]/10 border-[#EF4444]/20 p-4">
          <div className="flex items-center gap-2 text-[#EF4444] text-[13px]">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        </Card>
      )}

      <Card className="bg-[#111827] border-[#1F2937] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-[#0F172A]">
              <tr className="border-b border-[#1F2937] text-left">
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">Time</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">Category</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">Level</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">User</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">Source</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">Event</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[#6B7280]">
                    <RefreshCw className="mx-auto mb-3 h-5 w-5 animate-spin text-[#4F8CFF]" />
                    Loading platform logs…
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[#6B7280]">
                    <ScrollText className="mx-auto mb-3 h-5 w-5 text-[#4F8CFF]" />
                    No logs match the current filters.
                  </td>
                </tr>
              ) : (
                logs.map((entry) => {
                  const meta = categoryMeta(entry.category);
                  const Icon = meta.icon;

                  return (
                    <tr key={entry.id} className="border-b border-[#1F2937] align-top hover:bg-[#0F172A]/50">
                      <td className="px-4 py-4 text-[12px] text-[#9CA3AF] whitespace-nowrap">
                        {fmtDateTime(entry.eventAt)}
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant="outline" className="border-[#374151] bg-[#0B0F14] text-[#9CA3AF] text-[11px]">
                          <Icon className="mr-1 h-3 w-3" />
                          {meta.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant="outline" className={`text-[11px] capitalize ${levelBadge(entry.level)}`}>
                          {entry.level === "info" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                          {entry.level === "warning" && <AlertCircle className="mr-1 h-3 w-3" />}
                          {entry.level === "error" && <AlertCircle className="mr-1 h-3 w-3" />}
                          {entry.level}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 text-[12px] text-white">
                        <div>{entry.userName || "Unknown user"}</div>
                        <div className="text-[#6B7280]">{entry.userEmail || "—"}</div>
                      </td>
                      <td className="px-4 py-4 text-[12px] text-white max-w-[220px]">
                        <div className="font-medium">{entry.source}</div>
                        <div className="text-[#6B7280] capitalize">{entry.status}</div>
                      </td>
                      <td className="px-4 py-4 text-[12px] text-[#E5E7EB] max-w-[360px]">
                        {entry.message}
                      </td>
                      <td className="px-4 py-4 text-[12px] text-[#9CA3AF] max-w-[320px]">
                        {renderDetails(entry.details)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
