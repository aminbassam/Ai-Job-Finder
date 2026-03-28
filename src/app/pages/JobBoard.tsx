import { useState } from "react";
import { Filter } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Button } from "../components/ui/button";
import { JobCard } from "../components/shared/JobCard";
import { mockJobs } from "../data/mockData";
import { toast } from "sonner";

export function JobBoard() {
  const [activeTab, setActiveTab] = useState("all");

  const filterJobs = (status?: string) => {
    if (!status || status === "all") return mockJobs;
    if (status === "ready") return mockJobs.filter((job) => job.score >= 70);
    return mockJobs.filter((job) => job.status === status);
  };

  const handleGenerateResume = (jobId: string) => {
    const job = mockJobs.find((j) => j.id === jobId);
    toast.success(`Generating tailored resume for ${job?.title}...`, {
      description: "This will take about 30 seconds",
    });
  };

  const handleApply = (jobId: string) => {
    const job = mockJobs.find((j) => j.id === jobId);
    toast.success(`Preparing application for ${job?.company}`, {
      description: "Opening application portal...",
    });
  };

  const handleSave = (jobId: string) => {
    toast.success("Job saved to your board");
  };

  const filteredJobs = filterJobs(activeTab);
  const counts = {
    all: mockJobs.length,
    new: mockJobs.filter((j) => j.status === "new").length,
    ready: mockJobs.filter((j) => j.score >= 70).length,
    applied: mockJobs.filter((j) => j.status === "applied").length,
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[32px] font-semibold text-white mb-2">Job Board</h1>
          <p className="text-[14px] text-[#9CA3AF]">
            AI-matched jobs ranked by fit score
          </p>
        </div>
        <Button variant="outline" className="bg-[#1F2937] hover:bg-[#374151] text-white border-[#374151]">
          <Filter className="h-4 w-4 mr-2" />
          Filters
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList className="bg-[#111827] border border-[#1F2937] p-1">
          <TabsTrigger
            value="all"
            className="data-[state=active]:bg-[#4F8CFF] data-[state=active]:text-white"
          >
            All ({counts.all})
          </TabsTrigger>
          <TabsTrigger
            value="new"
            className="data-[state=active]:bg-[#4F8CFF] data-[state=active]:text-white"
          >
            New ({counts.new})
          </TabsTrigger>
          <TabsTrigger
            value="ready"
            className="data-[state=active]:bg-[#4F8CFF] data-[state=active]:text-white"
          >
            Ready ({counts.ready})
          </TabsTrigger>
          <TabsTrigger
            value="applied"
            className="data-[state=active]:bg-[#4F8CFF] data-[state=active]:text-white"
          >
            Applied ({counts.applied})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {filteredJobs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[14px] text-[#9CA3AF]">No jobs found in this category</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {filteredJobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  onGenerateResume={handleGenerateResume}
                  onApply={handleApply}
                  onSave={handleSave}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
