import { useState } from "react";
import { Search, Sparkles, MapPin, DollarSign } from "lucide-react";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { Label } from "../components/ui/label";
import { Slider } from "../components/ui/slider";

export function SearchJobs() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [sources, setSources] = useState({
    linkedin: true,
    indeed: true,
    company: true,
    angellist: false,
  });
  const [salaryRange, setSalaryRange] = useState([80, 200]);

  const suggestions = [
    "Product Manager",
    "Scrum Master",
    "SEO Specialist",
    "WordPress Developer",
  ];

  const handleSearch = () => {
    setIsSearching(true);
    // Simulate AI search
    setTimeout(() => {
      setIsSearching(false);
    }, 2000);
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[32px] font-semibold text-white mb-2">Search Jobs</h1>
        <p className="text-[14px] text-[#9CA3AF]">
          Let AI find and analyze jobs that match your profile
        </p>
      </div>

      <div className="max-w-4xl">
        {/* Search Box */}
        <Card className="bg-[#111827] border-[#1F2937] p-6 mb-6">
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[#9CA3AF]" />
              <Input
                placeholder="Search by job title, keyword, or company..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-[#0B0F14] border-[#1F2937] text-white placeholder:text-[#9CA3AF] h-12 text-[15px]"
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={isSearching}
              className="px-8 bg-[#4F8CFF] hover:bg-[#4F8CFF]/90 text-white h-12"
            >
              {isSearching ? (
                <>
                  <Sparkles className="h-5 w-5 mr-2 animate-pulse" />
                  Searching...
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5 mr-2" />
                  Run AI Search
                </>
              )}
            </Button>
          </div>

          {/* Quick Suggestions */}
          <div>
            <p className="text-[12px] text-[#9CA3AF] mb-2">Quick suggestions:</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <Badge
                  key={suggestion}
                  variant="secondary"
                  className="cursor-pointer bg-[#1F2937] hover:bg-[#374151] text-[#9CA3AF] hover:text-white border-[#374151] transition-colors"
                  onClick={() => setSearchQuery(suggestion)}
                >
                  {suggestion}
                </Badge>
              ))}
            </div>
          </div>
        </Card>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Location & Remote */}
          <Card className="bg-[#111827] border-[#1F2937] p-6">
            <h3 className="text-[16px] font-semibold text-white mb-4 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-[#4F8CFF]" />
              Location
            </h3>
            <div className="space-y-4">
              <div>
                <Label className="text-[13px] text-[#9CA3AF] mb-2 block">Preferred Location</Label>
                <Input
                  placeholder="e.g., San Francisco, Remote"
                  className="bg-[#0B0F14] border-[#1F2937] text-white placeholder:text-[#9CA3AF]"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-[13px] text-white">Remote Only</Label>
                <Switch />
              </div>
            </div>
          </Card>

          {/* Salary Range */}
          <Card className="bg-[#111827] border-[#1F2937] p-6">
            <h3 className="text-[16px] font-semibold text-white mb-4 flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-[#4F8CFF]" />
              Salary Range
            </h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-3">
                  <span className="text-[13px] text-[#9CA3AF]">
                    ${salaryRange[0]}k - ${salaryRange[1]}k
                  </span>
                </div>
                <Slider
                  value={salaryRange}
                  onValueChange={setSalaryRange}
                  min={0}
                  max={300}
                  step={10}
                  className="mb-2"
                />
              </div>
            </div>
          </Card>
        </div>

        {/* Experience Level */}
        <Card className="bg-[#111827] border-[#1F2937] p-6 mb-6">
          <h3 className="text-[16px] font-semibold text-white mb-4">Experience Level</h3>
          <div className="flex flex-wrap gap-3">
            {["Entry", "Mid-level", "Senior", "Lead", "Director"].map((level) => (
              <Button
                key={level}
                variant="outline"
                size="sm"
                className="bg-[#1F2937] hover:bg-[#4F8CFF]/10 hover:text-[#4F8CFF] text-[#9CA3AF] border-[#374151] hover:border-[#4F8CFF]/30"
              >
                {level}
              </Button>
            ))}
          </div>
        </Card>

        {/* Job Sources */}
        <Card className="bg-[#111827] border-[#1F2937] p-6">
          <h3 className="text-[16px] font-semibold text-white mb-4">Job Sources</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-[#0B0F14] border border-[#1F2937]">
              <Label className="text-[13px] text-white flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-[#0077B5]"></div>
                LinkedIn
              </Label>
              <Switch
                checked={sources.linkedin}
                onCheckedChange={(checked) => setSources({ ...sources, linkedin: checked })}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-[#0B0F14] border border-[#1F2937]">
              <Label className="text-[13px] text-white flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-[#2164F3]"></div>
                Indeed
              </Label>
              <Switch
                checked={sources.indeed}
                onCheckedChange={(checked) => setSources({ ...sources, indeed: checked })}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-[#0B0F14] border border-[#1F2937]">
              <Label className="text-[13px] text-white flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-[#4F8CFF]"></div>
                Company Sites
              </Label>
              <Switch
                checked={sources.company}
                onCheckedChange={(checked) => setSources({ ...sources, company: checked })}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-[#0B0F14] border border-[#1F2937]">
              <Label className="text-[13px] text-white flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-[#F26522]"></div>
                AngelList
              </Label>
              <Switch
                checked={sources.angellist}
                onCheckedChange={(checked) => setSources({ ...sources, angellist: checked })}
              />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
