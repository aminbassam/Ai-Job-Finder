import { useParams, Link } from "react-router";
import { ArrowLeft, MapPin, DollarSign, Calendar, Sparkles, FileText, Send, Bookmark } from "lucide-react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { ScoreBadge } from "../components/shared/ScoreBadge";
import { mockJobs } from "../data/mockData";

export function JobDetail() {
  const { id } = useParams();
  const job = mockJobs.find((j) => j.id === id);

  if (!job) {
    return (
      <div className="p-8">
        <p className="text-white">Job not found</p>
      </div>
    );
  }

  const matchBreakdown = [
    { category: "Skills Match", score: 95 },
    { category: "Experience Level", score: 90 },
    { category: "Location Fit", score: 88 },
    { category: "Salary Match", score: 92 },
    { category: "Company Culture", score: 85 },
  ];

  return (
    <div className="p-8">
      {/* Back Button */}
      <Link to="/jobs" className="inline-flex items-center gap-2 text-[14px] text-[#9CA3AF] hover:text-white mb-6 transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Back to Job Board
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Job Header */}
          <Card className="bg-[#111827] border-[#1F2937] p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h1 className="text-[28px] font-semibold text-white mb-2">{job.title}</h1>
                <p className="text-[18px] text-[#9CA3AF] mb-3">{job.company}</p>
                <div className="flex flex-wrap items-center gap-4 text-[14px] text-[#9CA3AF]">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {job.location}
                  </span>
                  {job.salary && (
                    <span className="flex items-center gap-1.5">
                      <DollarSign className="h-4 w-4" />
                      {job.salary}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    Posted {job.postedDate}
                  </span>
                </div>
              </div>
              <ScoreBadge score={job.score} size="lg" />
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-2">
              {job.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="text-[12px] bg-[#1F2937] text-[#9CA3AF] border-[#374151]"
                >
                  {tag}
                </Badge>
              ))}
              <Badge variant="secondary" className="text-[12px] bg-[#4F8CFF]/10 text-[#4F8CFF] border-[#4F8CFF]/30">
                {job.source}
              </Badge>
            </div>
          </Card>

          {/* Job Description */}
          <Card className="bg-[#111827] border-[#1F2937] p-6">
            <h2 className="text-[20px] font-semibold text-white mb-4">Job Description</h2>
            <p className="text-[14px] text-[#9CA3AF] leading-relaxed mb-6">{job.description}</p>

            <h3 className="text-[16px] font-semibold text-white mb-3">Requirements</h3>
            <ul className="space-y-2">
              {job.requirements.map((req, i) => (
                <li key={i} className="text-[14px] text-[#9CA3AF] pl-5">
                  • {req}
                </li>
              ))}
            </ul>
          </Card>

          {/* AI Analysis */}
          {job.aiAnalysis && (
            <Card className="bg-[#111827] border-[#1F2937] p-6">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-5 w-5 text-[#4F8CFF]" />
                <h2 className="text-[20px] font-semibold text-white">AI Match Analysis</h2>
              </div>

              <div className="space-y-5">
                <div className="p-4 rounded-lg bg-[#22C55E]/5 border border-[#22C55E]/20">
                  <h3 className="text-[14px] font-semibold text-[#22C55E] mb-2">Your Strengths</h3>
                  <ul className="space-y-1.5">
                    {job.aiAnalysis.strengths.map((strength, i) => (
                      <li key={i} className="text-[13px] text-[#9CA3AF] pl-3">
                        • {strength}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 rounded-lg bg-[#F59E0B]/5 border border-[#F59E0B]/20">
                  <h3 className="text-[14px] font-semibold text-[#F59E0B] mb-2">Areas to Address</h3>
                  <ul className="space-y-1.5">
                    {job.aiAnalysis.gaps.map((gap, i) => (
                      <li key={i} className="text-[13px] text-[#9CA3AF] pl-3">
                        • {gap}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 rounded-lg bg-[#4F8CFF]/5 border border-[#4F8CFF]/20">
                  <h3 className="text-[14px] font-semibold text-[#4F8CFF] mb-2">Recommendation</h3>
                  <p className="text-[13px] text-[#9CA3AF] italic">{job.aiAnalysis.recommendation}</p>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Actions */}
          <Card className="bg-[#111827] border-[#1F2937] p-6 sticky top-6">
            <div className="space-y-3">
              <Button className="w-full bg-[#4F8CFF] hover:bg-[#4F8CFF]/90 text-white">
                <FileText className="h-4 w-4 mr-2" />
                Generate Resume
              </Button>
              <Button className="w-full bg-[#22C55E] hover:bg-[#22C55E]/90 text-white">
                <Send className="h-4 w-4 mr-2" />
                Apply Now
              </Button>
              <Button variant="outline" className="w-full bg-[#1F2937] hover:bg-[#374151] text-white border-[#374151]">
                <Bookmark className="h-4 w-4 mr-2" />
                Save Job
              </Button>
            </div>
          </Card>

          {/* Fit Score Breakdown */}
          <Card className="bg-[#111827] border-[#1F2937] p-6">
            <h3 className="text-[16px] font-semibold text-white mb-4">Fit Score Breakdown</h3>
            <div className="space-y-4">
              {matchBreakdown.map((item) => (
                <div key={item.category}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] text-white">{item.category}</span>
                    <span className="text-[13px] font-semibold text-[#22C55E]">{item.score}%</span>
                  </div>
                  <Progress value={item.score} className="h-2" />
                </div>
              ))}
            </div>
          </Card>

          {/* Company Info */}
          <Card className="bg-[#111827] border-[#1F2937] p-6">
            <h3 className="text-[16px] font-semibold text-white mb-4">About {job.company}</h3>
            <div className="space-y-3 text-[13px] text-[#9CA3AF]">
              <div>
                <p className="text-white font-medium mb-1">Industry</p>
                <p>Technology / FinTech</p>
              </div>
              <div>
                <p className="text-white font-medium mb-1">Company Size</p>
                <p>5,000+ employees</p>
              </div>
              <div>
                <p className="text-white font-medium mb-1">Founded</p>
                <p>2010</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
