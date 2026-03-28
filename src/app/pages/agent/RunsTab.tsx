import { useState, useEffect } from "react";
import { Loader2, CheckCircle2, XCircle, Clock, Zap, RefreshCw } from "lucide-react";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { AgentRun, getRuns } from "../../services/agent.service";

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 className="h-4 w-4 text-[#10B981]" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-[#EF4444]" />;
  return <Loader2 className="h-4 w-4 text-[#4F8CFF] animate-spin" />;
}

function duration(run: AgentRun): string {
  if (!run.completedAt) return "Running…";
  const ms = new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.round(s / 60)}m ${s % 60}s`;
}

export function RunsTab() {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { setRuns(await getRuns()); } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  if (loading)
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[#4F8CFF]" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-white">Recent Runs</h3>
        <button type="button" onClick={load} className="text-[#6B7280] hover:text-white transition-colors">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {runs.length === 0 ? (
        <Card className="bg-[#111827] border-dashed border-[#374151] p-12 text-center">
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 rounded-xl bg-[#4F8CFF]/10 flex items-center justify-center">
              <Zap className="h-6 w-6 text-[#4F8CFF]" />
            </div>
          </div>
          <h3 className="text-[15px] font-semibold text-white mb-2">No runs yet</h3>
          <p className="text-[13px] text-[#6B7280]">
            Create a search profile and run it manually, or wait for the scheduler.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => (
            <Card key={run.id} className="bg-[#111827] border-[#1F2937] p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5"><StatusIcon status={run.status} /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-[14px] font-medium text-white truncate">
                      {run.profileName ?? "Unknown profile"}
                    </span>
                    <Badge
                      className={`text-[10px] border shrink-0 ${
                        run.trigger === "manual"
                          ? "bg-[#4F8CFF]/10 text-[#4F8CFF] border-[#4F8CFF]/20"
                          : "bg-[#1F2937] text-[#6B7280] border-[#374151]"
                      }`}
                    >
                      {run.trigger}
                    </Badge>
                  </div>

                  {run.status === "completed" && (
                    <div className="flex items-center gap-4 text-[12px]">
                      <span className="text-[#9CA3AF]">
                        <span className="font-semibold text-white">{run.jobsNew}</span> new
                      </span>
                      <span className="text-[#9CA3AF]">
                        <span className="font-semibold text-[#10B981]">{run.strongMatches}</span> strong
                      </span>
                      <span className="text-[#9CA3AF]">
                        {run.jobsFound} found total
                      </span>
                    </div>
                  )}

                  {run.status === "failed" && run.error && (
                    <p className="text-[12px] text-[#EF4444] mt-1">{run.error}</p>
                  )}

                  <div className="flex items-center gap-3 mt-2 text-[11px] text-[#4B5563]">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(run.startedAt).toLocaleString()}
                    </span>
                    <span>{duration(run)}</span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
