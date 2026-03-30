import { useEffect, useState } from "react";
import { AlertCircle, Clock3, GitBranch, History, Loader2 } from "lucide-react";
import { Card } from "../components/ui/card";
import { updatesService, type UpdateEntry } from "../services/updates.service";

function bulletItems(entry: UpdateEntry) {
  if (entry.details.length > 0) {
    return entry.details;
  }
  return [entry.summary];
}

export function Updates() {
  const [updates, setUpdates] = useState<UpdateEntry[]>([]);
  const [branch, setBranch] = useState<string | null>(null);
  const [automated, setAutomated] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const response = await updatesService.getUpdates();
        if (cancelled) return;
        setUpdates(response.updates ?? []);
        setBranch(response.branch ?? null);
        setAutomated(response.automated ?? false);
        setMessage(response.message ?? null);
      } catch (error) {
        if (cancelled) return;
        setUpdates([]);
        setBranch(null);
        setAutomated(false);
        setMessage(error instanceof Error ? error.message : "Failed to load recent updates.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="mb-2 text-[32px] font-semibold text-white">Updates</h1>
        <p className="max-w-3xl text-[14px] text-[#9CA3AF]">
          A live running log of recent platform releases, improvements, and implementation changes with version, date, and time.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-[#1F2937] bg-[#111827] px-4 py-3 text-[13px] text-[#9CA3AF]">
        <div className="flex items-center gap-2 text-white">
          <History className="h-4 w-4 text-[#93C5FD]" />
          <span className="font-medium">{automated ? "Auto-updating from Git history" : "Update feed unavailable"}</span>
        </div>
        {branch ? (
          <div className="flex items-center gap-1.5 rounded-full border border-[#374151] px-3 py-1 text-[12px] text-[#D1D5DB]">
            <GitBranch className="h-3.5 w-3.5" />
            {branch}
          </div>
        ) : null}
        {message ? <span className="text-[#FCA5A5]">{message}</span> : null}
      </div>

      {loading ? (
        <Card className="border-[#1F2937] bg-[#111827] p-6 text-[#9CA3AF]">
          <div className="flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-[#93C5FD]" />
            Loading recent implementation updates...
          </div>
        </Card>
      ) : updates.length === 0 ? (
        <Card className="border-[#1F2937] bg-[#111827] p-6 text-[#9CA3AF]">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 text-[#F59E0B]" />
            <div>
              <p className="text-[14px] font-medium text-white">No updates available to display yet.</p>
              <p className="mt-1 text-[13px]">
                New commits will appear here automatically with their date and time after they are available in the deployed Git history.
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {updates.map((entry) => (
          <Card key={entry.version} className="border-[#1F2937] bg-[#111827] p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 text-[#93C5FD]">
                    <History className="h-4 w-4" />
                    <span className="text-[15px] font-semibold">{entry.version}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[12px] text-[#9CA3AF]">
                    <Clock3 className="h-3.5 w-3.5" />
                    <span>{entry.timestamp}</span>
                  </div>
                </div>
                <p className="mt-3 text-[14px] font-medium text-white">{entry.summary}</p>
              </div>
            </div>

            <ul className="mt-4 space-y-2 pl-5 text-[13px] leading-6 text-[#9CA3AF] list-disc marker:text-[#6B7280]">
              {bulletItems(entry).map((detail) => (
                <li key={`${entry.fullHash}-${detail}`}>{detail}</li>
              ))}
            </ul>
          </Card>
          ))}
        </div>
      )}
    </div>
  );
}
