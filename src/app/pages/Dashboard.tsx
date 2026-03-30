import { Briefcase, Target, FileText, Send, TrendingUp, Sparkles, Clock, AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { StatCard } from "../components/shared/StatCard";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { mockActivityEvents, mockResumes } from "../data/mockData";
import { Button } from "../components/ui/button";
import { settingsService, type AiProviderInfo } from "../services/settings.service";
import { useAuth } from "../contexts/AuthContext";

export function Dashboard() {
  const { user } = useAuth();
  const [providers, setProviders] = useState<AiProviderInfo[]>([]);

  useEffect(() => {
    settingsService
      .getAiProviders()
      .then((rows) => setProviders(rows))
      .catch(() => setProviders([]));
  }, []);

  const hasConnectedProvider = providers.some((provider) => provider.status === "connected");

  const sources = [
    { name: "LinkedIn", count: 35, progress: 70 },
    { name: "Indeed", count: 18, progress: 36 },
    { name: "Company Sites", count: 12, progress: 24 },
    { name: "AngelList", count: 8, progress: 16 },
  ];

  const aiInsights = [
    {
      title: "Top matching roles",
      items: ["Senior PM at Stripe (92%)", "Growth PM at Figma (89%)", "Technical PM at Vercel (88%)"],
      color: "text-[#22C55E]",
    },
    {
      title: "Skills gap detected",
      items: ["Consider highlighting enterprise sales experience", "Add metrics from recent projects"],
      color: "text-[#F59E0B]",
    },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[32px] font-semibold text-white mb-2">Dashboard</h1>
        <p className="text-[14px] text-[#9CA3AF]">
          Welcome back! Here's what's happening with your job search.
        </p>
        {!hasConnectedProvider && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#4F8CFF]/20 bg-[#4F8CFF]/10 px-4 py-3 text-[13px] text-[#DBEAFE]">
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
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#F59E0B]/20 bg-[#F59E0B]/10 px-4 py-3 text-[13px] text-[#FCD34D]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              You are using the shared demo account. Demo data and anything added here are automatically cleared every 24 hours.
            </p>
          </div>
        )}
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#F59E0B]/20 bg-[#F59E0B]/10 px-4 py-3 text-[13px] text-[#FCD34D]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Dashboard data is currently mock data for layout preview. Live account metrics and activity will be completed soon.
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Jobs Found Today"
          value={24}
          icon={Briefcase}
          change="+12% from yesterday"
          changeType="positive"
        />
        <StatCard
          title="High Match Jobs (70+)"
          value={12}
          icon={Target}
          change="3 new this week"
          changeType="positive"
        />
        <StatCard
          title="Resumes Generated"
          value={8}
          icon={FileText}
          change="4 this week"
          changeType="neutral"
        />
        <StatCard
          title="Applications Sent"
          value={6}
          icon={Send}
          change="2 pending"
          changeType="neutral"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Activity Feed */}
        <Card className="lg:col-span-2 bg-[#111827] border-[#1F2937] p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-[18px] font-semibold text-white">Activity Feed</h2>
            <Button variant="ghost" size="sm" className="text-[#9CA3AF] hover:text-white">
              View All
            </Button>
          </div>
          <div className="space-y-4">
            {mockActivityEvents.map((event) => (
              <div key={event.id} className="flex items-start gap-4 pb-4 border-b border-[#1F2937] last:border-0 last:pb-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#4F8CFF]/10 shrink-0">
                  <TrendingUp className="h-5 w-5 text-[#4F8CFF]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-white mb-0.5">{event.title}</p>
                  <p className="text-[13px] text-[#9CA3AF]">{event.description}</p>
                  <p className="text-[12px] text-[#9CA3AF] mt-1 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {event.timestamp}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* AI Insights */}
        <Card className="bg-[#111827] border-[#1F2937] p-6">
          <div className="flex items-center gap-2 mb-6">
            <Sparkles className="h-5 w-5 text-[#4F8CFF]" />
            <h2 className="text-[18px] font-semibold text-white">AI Insights</h2>
          </div>
          <div className="space-y-5">
            {aiInsights.map((insight, idx) => (
              <div key={idx} className="p-4 rounded-lg bg-[#0B0F14] border border-[#1F2937]">
                <h3 className={`text-[13px] font-semibold mb-2 ${insight.color}`}>
                  {insight.title}
                </h3>
                <ul className="space-y-2">
                  {insight.items.map((item, i) => (
                    <li key={i} className="text-[12px] text-[#9CA3AF] pl-3">
                      • {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Source Breakdown */}
        <Card className="bg-[#111827] border-[#1F2937] p-6">
          <h2 className="text-[18px] font-semibold text-white mb-6">Source Breakdown</h2>
          <div className="space-y-5">
            {sources.map((source) => (
              <div key={source.name}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13px] text-white">{source.name}</span>
                  <span className="text-[13px] font-semibold text-[#9CA3AF]">{source.count} jobs</span>
                </div>
                <Progress value={source.progress} className="h-2" />
              </div>
            ))}
          </div>
        </Card>

        {/* Resume Preview */}
        <Card className="bg-[#111827] border-[#1F2937] p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-[18px] font-semibold text-white">Recent Resumes</h2>
            <Button asChild variant="ghost" size="sm" className="text-[#9CA3AF] hover:text-white">
              <Link to="/jobs">Open Job Board</Link>
            </Button>
          </div>
          <div className="space-y-3">
            {mockResumes.slice(0, 3).map((resume) => (
              <div
                key={resume.id}
                className="p-4 rounded-lg bg-[#0B0F14] border border-[#1F2937] hover:border-[#4F8CFF]/30 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between mb-2">
                  <p className="text-[14px] font-medium text-white">{resume.name}</p>
                  <FileText className="h-4 w-4 text-[#9CA3AF]" />
                </div>
                <div className="flex flex-wrap gap-2 mb-2">
                  {resume.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="text-[10px] bg-[#1F2937] text-[#9CA3AF] border-[#374151]"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
                <p className="text-[11px] text-[#9CA3AF]">Modified {resume.lastModified}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
