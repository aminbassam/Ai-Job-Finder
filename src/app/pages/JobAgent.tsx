import { useState, useEffect } from "react";
import { Zap, Target, Plug, Inbox, Download, History, Play } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { ProfilesTab } from "./agent/ProfilesTab";
import { SourcesTab } from "./agent/SourcesTab";
import { ResultsTab } from "./agent/ResultsTab";
import { ImportTab } from "./agent/ImportTab";
import { RunsTab } from "./agent/RunsTab";
import { getResults } from "../services/agent.service";

/* ─── Tab definition ──────────────────────────────────────────────────── */
const TABS = [
  { id: "profiles", label: "Search Profiles", icon: Target },
  { id: "sources",  label: "Sources",         icon: Plug   },
  { id: "results",  label: "Results",          icon: Inbox  },
  { id: "import",   label: "Manual Import",    icon: Download },
  { id: "runs",     label: "Run History",      icon: History },
] as const;

type TabId = (typeof TABS)[number]["id"];

/* ─── Main page ───────────────────────────────────────────────────────── */
export function JobAgent() {
  const [tab, setTab] = useState<TabId>("profiles");
  const [newCount, setNewCount] = useState(0);

  // Fetch count of new strong+maybe matches for the Results badge
  useEffect(() => {
    getResults({ tier: "strong", status: "new", limit: 1 })
      .then((r) => setNewCount(r.total))
      .catch(() => {});
  }, [tab]);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-xl bg-[#4F8CFF]/10 flex items-center justify-center">
            <Zap className="h-5 w-5 text-[#4F8CFF]" />
          </div>
          <div>
            <h1 className="text-[32px] font-semibold text-white leading-none">Job Agent</h1>
          </div>
        </div>
        <p className="text-[14px] text-[#9CA3AF] ml-[52px]">
          Set your strategy once — the agent searches, scores, and surfaces the best matches automatically
        </p>
      </div>

      {/* How it works banner */}
      <div className="flex items-center gap-6 mb-6 p-4 rounded-xl bg-[#111827] border border-[#1F2937] overflow-x-auto">
        {[
          { n: 1, icon: Target, label: "Define profiles", sub: "Roles, location, salary" },
          { n: 2, icon: Plug, label: "Connect sources", sub: "Greenhouse, Lever, Upwork" },
          { n: 3, icon: Play, label: "Auto-runs on schedule", sub: "Every 6h / daily" },
          { n: 4, icon: Zap, label: "AI scores every job", sub: "Strong / Maybe / Weak" },
          { n: 5, icon: Inbox, label: "Review top matches", sub: "Tailored resume in 1 click" },
        ].map((step, i, arr) => (
          <div key={step.n} className="flex items-center gap-4 shrink-0">
            <div className="text-center">
              <div className="h-9 w-9 rounded-lg bg-[#0B0F14] border border-[#1F2937] flex items-center justify-center mx-auto mb-1.5">
                <step.icon className="h-4 w-4 text-[#4F8CFF]" />
              </div>
              <p className="text-[12px] font-medium text-white">{step.label}</p>
              <p className="text-[11px] text-[#6B7280]">{step.sub}</p>
            </div>
            {i < arr.length - 1 && (
              <div className="h-px w-8 bg-[#1F2937] shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b border-[#1F2937] mb-6">
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
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
              <Icon className="h-4 w-4" />
              {label}
              {id === "results" && newCount > 0 && (
                <Badge className="bg-[#4F8CFF] text-white text-[10px] px-1.5 py-0 min-w-[18px] h-[18px] flex items-center justify-center ml-0.5">
                  {newCount > 99 ? "99+" : newCount}
                </Badge>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {tab === "profiles" && <ProfilesTab />}
      {tab === "sources"  && <SourcesTab />}
      {tab === "results"  && <ResultsTab />}
      {tab === "import"   && <ImportTab />}
      {tab === "runs"     && <RunsTab />}
    </div>
  );
}
