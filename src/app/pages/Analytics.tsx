import { TrendingUp, Target, Briefcase, Send } from "lucide-react";
import { Card } from "../components/ui/card";
import { StatCard } from "../components/shared/StatCard";
import { mockAnalyticsData } from "../data/mockData";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export function Analytics() {
  const COLORS = ["#4F8CFF", "#22C55E", "#F59E0B", "#EF4444", "#8B5CF6"];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[32px] font-semibold text-white mb-2">Analytics</h1>
        <p className="text-[14px] text-[#9CA3AF]">
          Track your job search performance and insights
        </p>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Jobs Found"
          value={73}
          icon={Briefcase}
          change="+18% this month"
          changeType="positive"
        />
        <StatCard
          title="Avg Match Score"
          value="82%"
          icon={Target}
          change="+5% from last month"
          changeType="positive"
        />
        <StatCard
          title="Applications Sent"
          value={8}
          icon={Send}
          change="2 this week"
          changeType="neutral"
        />
        <StatCard
          title="Interview Rate"
          value="38%"
          icon={TrendingUp}
          change="Above average"
          changeType="positive"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Jobs Per Week */}
        <Card className="bg-[#111827] border-[#1F2937] p-6">
          <h2 className="text-[18px] font-semibold text-white mb-6">Jobs Found Per Week</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={mockAnalyticsData.jobsPerWeek}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
              <XAxis dataKey="week" stroke="#9CA3AF" style={{ fontSize: 12 }} />
              <YAxis stroke="#9CA3AF" style={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#111827",
                  border: "1px solid #1F2937",
                  borderRadius: "8px",
                  color: "#F5F5F7",
                }}
              />
              <Line
                type="monotone"
                dataKey="jobs"
                stroke="#4F8CFF"
                strokeWidth={2}
                dot={{ fill: "#4F8CFF", r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Score Distribution */}
        <Card className="bg-[#111827] border-[#1F2937] p-6">
          <h2 className="text-[18px] font-semibold text-white mb-6">Match Score Distribution</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={mockAnalyticsData.scoreDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
              <XAxis dataKey="range" stroke="#9CA3AF" style={{ fontSize: 12 }} />
              <YAxis stroke="#9CA3AF" style={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#111827",
                  border: "1px solid #1F2937",
                  borderRadius: "8px",
                  color: "#F5F5F7",
                }}
              />
              <Bar dataKey="count" fill="#4F8CFF" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Source Performance */}
        <Card className="bg-[#111827] border-[#1F2937] p-6">
          <h2 className="text-[18px] font-semibold text-white mb-6">Source Performance</h2>
          <div className="space-y-5">
            {mockAnalyticsData.sourcePerformance.map((source, index) => (
              <div key={source.source} className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <div className="flex-1">
                    <p className="text-[13px] text-white font-medium">{source.source}</p>
                    <p className="text-[12px] text-[#9CA3AF]">{source.jobs} jobs found</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[14px] font-semibold text-white">{source.avgScore}%</p>
                  <p className="text-[11px] text-[#9CA3AF]">avg score</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Application Funnel */}
        <Card className="bg-[#111827] border-[#1F2937] p-6">
          <h2 className="text-[18px] font-semibold text-white mb-6">Application Funnel</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={mockAnalyticsData.applicationFunnel} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
              <XAxis type="number" stroke="#9CA3AF" style={{ fontSize: 12 }} />
              <YAxis dataKey="stage" type="category" stroke="#9CA3AF" style={{ fontSize: 12 }} width={100} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#111827",
                  border: "1px solid #1F2937",
                  borderRadius: "8px",
                  color: "#F5F5F7",
                }}
              />
              <Bar dataKey="count" fill="#22C55E" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Insights */}
      <Card className="bg-[#111827] border-[#1F2937] p-6 mt-6">
        <h2 className="text-[18px] font-semibold text-white mb-4">Key Insights</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-4 rounded-lg bg-[#4F8CFF]/5 border border-[#4F8CFF]/20">
            <h3 className="text-[14px] font-semibold text-[#4F8CFF] mb-2">Best Source</h3>
            <p className="text-[13px] text-[#9CA3AF]">
              Company sites have the highest average match score (86%). Consider prioritizing direct applications.
            </p>
          </div>
          <div className="p-4 rounded-lg bg-[#22C55E]/5 border border-[#22C55E]/20">
            <h3 className="text-[14px] font-semibold text-[#22C55E] mb-2">Strong Week</h3>
            <p className="text-[13px] text-[#9CA3AF]">
              Week 4 had 24 new jobs - your best week yet! Keep up the momentum with regular searches.
            </p>
          </div>
          <div className="p-4 rounded-lg bg-[#F59E0B]/5 border border-[#F59E0B]/20">
            <h3 className="text-[14px] font-semibold text-[#F59E0B] mb-2">Opportunity</h3>
            <p className="text-[13px] text-[#9CA3AF]">
              You have 12 high-match jobs (70+) ready to apply. Focus on these for better success rates.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
