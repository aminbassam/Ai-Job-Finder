import { FileText, Download, Eye, Copy, Plus } from "lucide-react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { mockResumes } from "../data/mockData";

export function ResumeVault() {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[32px] font-semibold text-white mb-2">Resume Vault</h1>
          <p className="text-[14px] text-[#9CA3AF]">
            Manage your master resume and tailored versions
          </p>
        </div>
        <Button className="bg-[#4F8CFF] hover:bg-[#4F8CFF]/90 text-white">
          <Plus className="h-4 w-4 mr-2" />
          Create New Resume
        </Button>
      </div>

      {/* Resume Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockResumes.map((resume) => (
          <Card
            key={resume.id}
            className="bg-[#111827] border-[#1F2937] p-6 hover:border-[#4F8CFF]/30 transition-all group"
          >
            {/* Icon */}
            <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-[#4F8CFF]/10 mb-4">
              <FileText className="h-8 w-8 text-[#4F8CFF]" />
            </div>

            {/* Content */}
            <div className="mb-4">
              <h3 className="text-[16px] font-semibold text-white mb-2">{resume.name}</h3>
              <p className="text-[12px] text-[#9CA3AF] mb-3">
                Modified {resume.lastModified}
              </p>

              {/* Tags */}
              <div className="flex flex-wrap gap-2 mb-4">
                {resume.tags.map((tag) => {
                  const tagColors: Record<string, string> = {
                    Master: "bg-[#8B5CF6]/10 text-[#8B5CF6] border-[#8B5CF6]/30",
                    "AI Generated": "bg-[#4F8CFF]/10 text-[#4F8CFF] border-[#4F8CFF]/30",
                    Optimized: "bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30",
                    Updated: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30",
                  };

                  return (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className={`text-[10px] ${tagColors[tag] || "bg-[#1F2937] text-[#9CA3AF] border-[#374151]"}`}
                    >
                      {tag}
                    </Badge>
                  );
                })}
              </div>

              {/* Type Badge */}
              <Badge
                variant="outline"
                className={`text-[11px] ${
                  resume.type === "master"
                    ? "border-[#8B5CF6]/50 text-[#8B5CF6]"
                    : "border-[#4F8CFF]/50 text-[#4F8CFF]"
                }`}
              >
                {resume.type === "master" ? "Master Resume" : "Tailored Resume"}
              </Badge>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-4 border-t border-[#1F2937]">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 bg-[#1F2937] hover:bg-[#374151] text-white"
              >
                <Eye className="h-4 w-4 mr-2" />
                View
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="bg-[#1F2937] hover:bg-[#374151] text-white"
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="bg-[#1F2937] hover:bg-[#374151] text-white"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}

        {/* Create New Card */}
        <Card className="bg-[#111827] border-[#1F2937] border-dashed p-6 hover:border-[#4F8CFF]/50 transition-all group cursor-pointer flex flex-col items-center justify-center min-h-[300px]">
          <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-[#4F8CFF]/10 mb-4 group-hover:bg-[#4F8CFF]/20 transition-colors">
            <Plus className="h-8 w-8 text-[#4F8CFF]" />
          </div>
          <h3 className="text-[16px] font-semibold text-white mb-2">Create New Resume</h3>
          <p className="text-[13px] text-[#9CA3AF] text-center">
            Start from scratch or tailor to a specific job
          </p>
        </Card>
      </div>

      {/* Tips Section */}
      <Card className="bg-[#111827] border-[#1F2937] p-6 mt-8">
        <h2 className="text-[18px] font-semibold text-white mb-4">Resume Tips</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <h3 className="text-[14px] font-semibold text-[#4F8CFF] mb-2">Master Resume</h3>
            <p className="text-[13px] text-[#9CA3AF]">
              Keep one comprehensive resume with all your experience and skills. Use it as a base for tailored versions.
            </p>
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-[#22C55E] mb-2">Tailored Versions</h3>
            <p className="text-[13px] text-[#9CA3AF]">
              Create job-specific resumes that highlight relevant experience. AI can help optimize for ATS systems.
            </p>
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-[#F59E0B] mb-2">Keep Updated</h3>
            <p className="text-[13px] text-[#9CA3AF]">
              Regularly update your master resume with new skills, projects, and achievements as they happen.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
