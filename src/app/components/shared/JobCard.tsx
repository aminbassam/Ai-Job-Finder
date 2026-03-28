import { useState } from "react";
import { Link } from "react-router";
import { MapPin, DollarSign, Sparkles, FileText, Send, Bookmark, ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Job } from "../../data/mockData";
import { ScoreBadge } from "./ScoreBadge";

interface JobCardProps {
  job: Job;
  onGenerateResume?: (jobId: string) => void;
  onApply?: (jobId: string) => void;
  onSave?: (jobId: string) => void;
}

export function JobCard({ job, onGenerateResume, onApply, onSave }: JobCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card className="bg-[#111827] border-[#1F2937] p-5 hover:border-[#4F8CFF]/30 transition-all">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <Link to={`/jobs/${job.id}`} className="group">
            <h3 className="text-[16px] font-semibold text-white mb-1 group-hover:text-[#4F8CFF] transition-colors">
              {job.title}
            </h3>
          </Link>
          <p className="text-[14px] text-[#9CA3AF] mb-2">{job.company}</p>
          <div className="flex flex-wrap items-center gap-3 text-[13px] text-[#9CA3AF]">
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {job.location}
            </span>
            {job.salary && (
              <span className="flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5" />
                {job.salary}
              </span>
            )}
            <span className="text-[12px] text-[#9CA3AF]">{job.source}</span>
          </div>
        </div>
        <ScoreBadge score={job.score} />
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-2 mb-4">
        {job.tags.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="text-[11px] bg-[#1F2937] text-[#9CA3AF] border-[#374151]"
          >
            {tag}
          </Badge>
        ))}
      </div>

      {/* Expanded Content */}
      {isExpanded && job.aiAnalysis && (
        <div className="mb-4 space-y-3 p-4 rounded-lg bg-[#0B0F14] border border-[#1F2937]">
          <div>
            <h4 className="text-[13px] font-semibold text-white mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#4F8CFF]" />
              AI Match Analysis
            </h4>
          </div>

          <div>
            <p className="text-[12px] font-medium text-[#22C55E] mb-1">Strengths</p>
            <ul className="space-y-1">
              {job.aiAnalysis.strengths.map((strength, i) => (
                <li key={i} className="text-[12px] text-[#9CA3AF] pl-3">
                  • {strength}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[12px] font-medium text-[#F59E0B] mb-1">Areas to Address</p>
            <ul className="space-y-1">
              {job.aiAnalysis.gaps.map((gap, i) => (
                <li key={i} className="text-[12px] text-[#9CA3AF] pl-3">
                  • {gap}
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-2 border-t border-[#1F2937]">
            <p className="text-[12px] text-[#9CA3AF] italic">{job.aiAnalysis.recommendation}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 bg-[#4F8CFF] hover:bg-[#4F8CFF]/90 text-white border-0"
          onClick={() => onGenerateResume?.(job.id)}
        >
          <FileText className="h-4 w-4 mr-2" />
          Generate Resume
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="bg-[#1F2937] hover:bg-[#374151] text-white border-[#374151]"
          onClick={() => onApply?.(job.id)}
        >
          <Send className="h-4 w-4 mr-2" />
          Apply
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-[#9CA3AF] hover:text-white hover:bg-[#1F2937]"
          onClick={() => onSave?.(job.id)}
        >
          <Bookmark className="h-4 w-4" />
        </Button>
      </div>

      {/* Expand/Collapse */}
      {job.aiAnalysis && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-2 text-[#9CA3AF] hover:text-white hover:bg-[#1F2937]"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="h-4 w-4 mr-1" />
              Hide Details
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4 mr-1" />
              View AI Analysis
            </>
          )}
        </Button>
      )}
    </Card>
  );
}
