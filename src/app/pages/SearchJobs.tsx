import { useState, useRef } from "react";
import {
  Search,
  Sparkles,
  MapPin,
  DollarSign,
  Target,
  SlidersHorizontal,
  Building2,
  Clock,
  Bookmark,
  BookmarkCheck,
  X,
  ChevronDown,
  ChevronUp,
  Zap,
  Eye,
  Bell,
  RotateCcw,
  Plus,
  CheckCircle2,
} from "lucide-react";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { Label } from "../components/ui/label";
import { Slider } from "../components/ui/slider";
import { TagInput } from "../components/ui/tag-input";
import { JobTitleTagInput } from "../components/ui/job-title-tag-input";
import { LocationTagInput } from "../components/ui/location-tag-input";

/* ─────────────────────────────── Types ────────────────────────────────── */

interface SavedSearch {
  id: string;
  name: string;
  createdAt: string;
  autoRun: boolean;
  notify: boolean;
  estimatedResults: number;
}

interface SourceConfig {
  enabled: boolean;
  lastSync: string;
  jobCount: number;
  color: string;
}

/* ─────────────────────────── Segmented Control ────────────────────────── */

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: string; description?: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex bg-[#0B0F14] rounded-lg border border-[#1F2937] p-1 gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          title={opt.description}
          className={`flex-1 px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${
            value === opt.value
              ? "bg-[#4F8CFF] text-white shadow-sm"
              : "text-[#9CA3AF] hover:text-white hover:bg-[#1F2937]"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────── Priority Slider Row ───────────────────────────── */

function PrioritySlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-[13px] text-[#9CA3AF]">{label}</span>
        <span className="text-[12px] font-medium text-[#4F8CFF] w-8 text-right">{value}%</span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={0}
        max={100}
        step={5}
        className="h-1"
      />
    </div>
  );
}

/* ────────────────────────── Section Header ────────────────────────────── */

function SectionHeader({
  icon: Icon,
  title,
  description,
  collapsible = false,
  collapsed = false,
  onToggle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div
      className={`flex items-start justify-between mb-4 ${collapsible ? "cursor-pointer" : ""}`}
      onClick={collapsible ? onToggle : undefined}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 h-8 w-8 flex items-center justify-center rounded-lg bg-[#4F8CFF]/10 shrink-0">
          <Icon className="h-4 w-4 text-[#4F8CFF]" />
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-white">{title}</h3>
          {description && (
            <p className="text-[12px] text-[#6B7280] mt-0.5">{description}</p>
          )}
        </div>
      </div>
      {collapsible && (
        <button type="button" className="text-[#6B7280] hover:text-white transition-colors mt-1">
          {collapsed ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </button>
      )}
    </div>
  );
}

/* ───────────────────────── Main Component ─────────────────────────────── */

export function SearchJobs() {
  /* Search query */
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchPhase, setSearchPhase] = useState("");

  /* AI Assist */
  const [aiAssist, setAiAssist] = useState(true);

  /* Job Titles */
  const [jobTitles, setJobTitles] = useState<string[]>([]);

  /* Experience Level */
  const [expLevels, setExpLevels] = useState<string[]>([]);
  const expOptions = ["Internship", "Entry", "Mid-level", "Senior", "Lead", "Director", "C-Level"];

  /* Location */
  const [locations, setLocations] = useState<string[]>([]);
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [includeNearby, setIncludeNearby] = useState(false);

  /* Salary */
  const [salaryRange, setSalaryRange] = useState([80, 200]);

  /* Keywords */
  const [mustHave, setMustHave] = useState<string[]>([]);
  const [niceToHave, setNiceToHave] = useState<string[]>([]);
  const keywordSuggestions = [
    "React",
    "TypeScript",
    "Python",
    "AWS",
    "GraphQL",
    "Kubernetes",
    "PostgreSQL",
    "Node.js",
    "Machine Learning",
    "Agile",
    "CI/CD",
    "REST API",
    "Docker",
    "Terraform",
    "Redis",
  ];

  /* Search Strategy */
  const [searchMode, setSearchMode] = useState("balanced");
  const [combineLogic, setCombineLogic] = useState("OR");
  const [priority, setPriority] = useState({
    roleMatch: 40,
    salary: 25,
    location: 20,
    companyType: 15,
  });

  /* Company Filters */
  const [includeCompanies, setIncludeCompanies] = useState<string[]>([]);
  const [excludeCompanies, setExcludeCompanies] = useState<string[]>([]);
  const [companySizes, setCompanySizes] = useState<string[]>([]);
  const companySizeOptions = ["Startup (1-50)", "Small (51-200)", "Mid (201-1000)", "Enterprise (1000+)"];
  const [companyCollapsed, setCompanyCollapsed] = useState(true);

  /* Job Freshness */
  const [freshness, setFreshness] = useState("7d");
  const freshnessOptions = [
    { label: "24h", value: "24h" },
    { label: "3 days", value: "3d" },
    { label: "7 days", value: "7d" },
    { label: "30 days", value: "30d" },
  ];

  /* Sources */
  const [sources, setSources] = useState<Record<string, SourceConfig>>({
    linkedin: { enabled: true, lastSync: "2 min ago", jobCount: 12400, color: "#0077B5" },
    indeed: { enabled: true, lastSync: "5 min ago", jobCount: 8900, color: "#2164F3" },
    glassdoor: { enabled: false, lastSync: "1 hr ago", jobCount: 5200, color: "#0CAA41" },
    company: { enabled: true, lastSync: "15 min ago", jobCount: 3100, color: "#4F8CFF" },
    angellist: { enabled: false, lastSync: "3 hr ago", jobCount: 1800, color: "#F26522" },
    remoteok: { enabled: false, lastSync: "30 min ago", jobCount: 2300, color: "#6366F1" },
  });

  /* Saved Searches */
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([
    {
      id: "1",
      name: "Senior PM — Remote",
      createdAt: "2026-03-24",
      autoRun: true,
      notify: true,
      estimatedResults: 340,
    },
    {
      id: "2",
      name: "Engineering Lead NYC",
      createdAt: "2026-03-20",
      autoRun: false,
      notify: false,
      estimatedResults: 128,
    },
  ]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState("");
  const [saveAutoRun, setSaveAutoRun] = useState(false);
  const [saveNotify, setSaveNotify] = useState(false);
  const saveInputRef = useRef<HTMLInputElement>(null);

  /* Computed estimate */
  const activeSources = Object.values(sources).filter((s) => s.enabled);
  const baseCount = activeSources.reduce((sum, s) => sum + s.jobCount, 0);
  const filteredCount = Math.round(
    baseCount *
      (jobTitles.length > 0 ? 0.12 : 0.25) *
      (locations.length > 0 || remoteOnly ? 0.6 : 1) *
      (searchMode === "strict" ? 0.5 : searchMode === "broad" ? 1.4 : 1) *
      (freshness === "24h" ? 0.08 : freshness === "3d" ? 0.2 : freshness === "7d" ? 0.45 : 1)
  );
  const estimatedResults = Math.max(10, filteredCount);

  /* Handlers */
  function toggleExpLevel(level: string) {
    setExpLevels((prev) =>
      prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level]
    );
  }

  function toggleCompanySize(size: string) {
    setCompanySizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
    );
  }

  function toggleSource(key: string) {
    setSources((prev) => ({
      ...prev,
      [key]: { ...prev[key], enabled: !prev[key].enabled },
    }));
  }

  const searchPhases = [
    "Analyzing 5 sources…",
    "Matching your profile…",
    "Scoring relevance…",
    "Applying filters…",
    "Ready!",
  ];
  const phaseIdx = useRef(0);

  function handleSearch() {
    setIsSearching(true);
    phaseIdx.current = 0;
    setSearchPhase(searchPhases[0]);
    const interval = setInterval(() => {
      phaseIdx.current += 1;
      if (phaseIdx.current >= searchPhases.length) {
        clearInterval(interval);
        setIsSearching(false);
        setSearchPhase("");
      } else {
        setSearchPhase(searchPhases[phaseIdx.current]);
      }
    }, 700);
  }

  function handleSaveSearch() {
    if (!saveSearchName.trim()) return;
    const newSearch: SavedSearch = {
      id: Date.now().toString(),
      name: saveSearchName.trim(),
      createdAt: new Date().toISOString().split("T")[0],
      autoRun: saveAutoRun,
      notify: saveNotify,
      estimatedResults,
    };
    setSavedSearches((prev) => [newSearch, ...prev]);
    setSaveDialogOpen(false);
    setSaveSearchName("");
    setSaveAutoRun(false);
    setSaveNotify(false);
  }

  function deleteSavedSearch(id: string) {
    setSavedSearches((prev) => prev.filter((s) => s.id !== id));
  }

  /* AI Preview items */
  const previewItems = [
    ...(jobTitles.length > 0
      ? [{ label: "Job Titles", value: jobTitles.join(", "), active: true }]
      : [{ label: "Job Titles", value: "Not set — add targets", active: false }]),
    ...(expLevels.length > 0
      ? [{ label: "Experience", value: expLevels.join(", "), active: true }]
      : []),
    ...(locations.length > 0
      ? [{ label: "Locations", value: locations.join(", "), active: true }]
      : remoteOnly
      ? [{ label: "Location", value: "Remote only", active: true }]
      : [{ label: "Locations", value: "Anywhere", active: false }]),
    {
      label: "Salary",
      value: `$${salaryRange[0]}k – $${salaryRange[1]}k`,
      active: !(salaryRange[0] === 80 && salaryRange[1] === 200),
    },
    ...(mustHave.length > 0
      ? [{ label: "Must-have", value: mustHave.join(", "), active: true }]
      : []),
    ...(niceToHave.length > 0
      ? [{ label: "Nice-to-have", value: niceToHave.join(", "), active: true }]
      : []),
    {
      label: "Mode",
      value: searchMode.charAt(0).toUpperCase() + searchMode.slice(1),
      active: searchMode !== "balanced",
    },
    { label: "Freshness", value: `Last ${freshness}`, active: true },
    {
      label: "Sources",
      value: Object.entries(sources)
        .filter(([, s]) => s.enabled)
        .map(([k]) => k.charAt(0).toUpperCase() + k.slice(1))
        .join(", "),
      active: true,
    },
  ];

  const sourceLabels: Record<string, string> = {
    linkedin: "LinkedIn",
    indeed: "Indeed",
    glassdoor: "Glassdoor",
    company: "Company Sites",
    angellist: "AngelList",
    remoteok: "Remote OK",
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-[32px] font-semibold text-white mb-1">AI Job Strategy Builder</h1>
          <p className="text-[14px] text-[#9CA3AF]">
            Build your perfect search strategy — let AI find the best matches across all sources
          </p>
        </div>
        <div className="flex items-center gap-2.5 mt-1">
          <Label className="text-[13px] text-[#9CA3AF]">AI Assist</Label>
          <Switch
            checked={aiAssist}
            onCheckedChange={setAiAssist}
          />
          {aiAssist && (
            <Badge className="bg-[#4F8CFF]/10 text-[#4F8CFF] border-[#4F8CFF]/20 text-[11px]">
              <Sparkles className="h-3 w-3 mr-1" />
              Active
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">
        {/* ─── Left Column: Filters ─── */}
        <div className="space-y-5">

          {/* ── Smart Search Bar ── */}
          <Card className="bg-[#111827] border-[#1F2937] p-5">
            <div className="flex gap-3 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-[#9CA3AF]" />
                <Input
                  placeholder="Add a keyword, company, or any extra context…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-[#0B0F14] border-[#1F2937] text-white placeholder:text-[#4B5563] h-11 text-[14px]"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {["React Engineer", "Product Lead", "Remote SWE", "NYC Fintech PM", "ML Researcher"].map(
                (s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSearchQuery(s)}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-[#1F2937] text-[#9CA3AF] hover:bg-[#374151] hover:text-white transition-colors border border-[#374151]"
                  >
                    {s}
                  </button>
                )
              )}
            </div>
          </Card>

          {/* ── Targeting ── */}
          <Card className="bg-[#111827] border-[#1F2937] p-5">
            <SectionHeader
              icon={Target}
              title="Job Targeting"
              description="Define which roles you're looking for"
            />

            <div className="space-y-4">
              <div>
                <Label className="text-[12px] text-[#9CA3AF] mb-1.5 block">
                  Target Job Titles{" "}
                  <span className="text-[#4B5563]">— order = priority (first = highest)</span>
                </Label>
                <JobTitleTagInput
                  tags={jobTitles}
                  onChange={setJobTitles}
                  placeholder="Search from a full job title catalog…"
                />
                {jobTitles.length === 0 && (
                  <p className="text-[11px] text-[#EF4444]/70 mt-1.5">
                    Add at least one job title for best results
                  </p>
                )}
              </div>

              <div>
                <Label className="text-[12px] text-[#9CA3AF] mb-2 block">
                  Experience Level <span className="text-[#4B5563]">— select all that apply</span>
                </Label>
                <div className="flex flex-wrap gap-2">
                  {expOptions.map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => toggleExpLevel(level)}
                      className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all ${
                        expLevels.includes(level)
                          ? "bg-[#4F8CFF]/15 text-[#4F8CFF] border-[#4F8CFF]/30"
                          : "bg-[#0B0F14] text-[#6B7280] border-[#1F2937] hover:border-[#374151] hover:text-[#9CA3AF]"
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* ── Location & Salary ── */}
          <Card className="bg-[#111827] border-[#1F2937] p-5">
            <SectionHeader
              icon={MapPin}
              title="Location & Salary"
              description="Where and how much"
            />
            <div className="space-y-4">
              <div>
                <Label className="text-[12px] text-[#9CA3AF] mb-1.5 block">Locations</Label>
                <LocationTagInput
                  tags={locations}
                  onChange={setLocations}
                  placeholder="Search US cities, states, or Remote…"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-[#0B0F14] border border-[#1F2937]">
                  <Label className="text-[13px] text-white">Remote Only</Label>
                  <Switch
                    checked={remoteOnly}
                    onCheckedChange={setRemoteOnly}
                  />
                </div>
                <div className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                  remoteOnly ? "bg-[#1F2937]/30 border-[#1F2937]/50 opacity-50" : "bg-[#0B0F14] border-[#1F2937]"
                }`}>
                  <Label className="text-[13px] text-white">Nearby Cities</Label>
                  <Switch
                    checked={includeNearby}
                    onCheckedChange={setIncludeNearby}
                    disabled={remoteOnly}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <Label className="text-[12px] text-[#9CA3AF]">Salary Range</Label>
                  <span className="text-[12px] font-semibold text-white">
                    ${salaryRange[0]}k — ${salaryRange[1]}k
                  </span>
                </div>
                <Slider
                  value={salaryRange}
                  onValueChange={setSalaryRange}
                  min={0}
                  max={400}
                  step={10}
                />
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-[#4B5563]">$0k</span>
                  <span className="text-[10px] text-[#4B5563]">$400k+</span>
                </div>
              </div>
            </div>
          </Card>

          {/* ── Keywords & Skills ── */}
          <Card className="bg-[#111827] border-[#1F2937] p-5">
            <SectionHeader
              icon={Search}
              title="Keywords & Skills"
              description="Boost relevance with required and preferred keywords"
            />
            <div className="space-y-4">
              <div>
                <Label className="text-[12px] text-[#9CA3AF] mb-1.5 block">
                  Must-Have Keywords
                  <span className="ml-1.5 text-[11px] text-[#EF4444]/70">
                    — jobs without these will be excluded
                  </span>
                </Label>
                <TagInput
                  tags={mustHave}
                  onChange={setMustHave}
                  placeholder="e.g. TypeScript, AWS…"
                  suggestions={keywordSuggestions}
                />
              </div>
              <div>
                <Label className="text-[12px] text-[#9CA3AF] mb-1.5 block">
                  Nice-to-Have Keywords
                  <span className="ml-1.5 text-[11px] text-[#6B7280]">
                    — boosts relevance score
                  </span>
                </Label>
                <TagInput
                  tags={niceToHave}
                  onChange={setNiceToHave}
                  placeholder="e.g. Kubernetes, GraphQL…"
                  suggestions={keywordSuggestions.filter((k) => !mustHave.includes(k))}
                />
              </div>
            </div>
          </Card>

          {/* ── Search Strategy ── */}
          <Card className="bg-[#111827] border-[#1F2937] p-5">
            <SectionHeader
              icon={SlidersHorizontal}
              title="Search Strategy"
              description="Control how AI matches and ranks jobs"
            />
            <div className="space-y-5">
              <div>
                <Label className="text-[12px] text-[#9CA3AF] mb-2 block">Search Mode</Label>
                <SegmentedControl
                  options={[
                    { label: "Strict", value: "strict", description: "Only exact title + all must-haves" },
                    { label: "Balanced", value: "balanced", description: "Smart matching with some flexibility" },
                    { label: "Broad", value: "broad", description: "Maximum reach — related roles included" },
                  ]}
                  value={searchMode}
                  onChange={setSearchMode}
                />
                <p className="text-[11px] text-[#4B5563] mt-1.5">
                  {searchMode === "strict"
                    ? "Only returns jobs that match all your criteria exactly."
                    : searchMode === "balanced"
                    ? "Smart matching — balances precision and coverage."
                    : "Casts a wide net — includes related roles and partial matches."}
                </p>
              </div>

              <div>
                <Label className="text-[12px] text-[#9CA3AF] mb-2 block">Combine Job Titles</Label>
                <SegmentedControl
                  options={[
                    { label: "AND", value: "AND", description: "Job must match all titles" },
                    { label: "OR", value: "OR", description: "Job matches any of the titles" },
                  ]}
                  value={combineLogic}
                  onChange={setCombineLogic}
                />
              </div>

              <div>
                <Label className="text-[12px] text-[#9CA3AF] mb-3 block">Priority Weights</Label>
                <div className="space-y-3">
                  <PrioritySlider
                    label="Role Match"
                    value={priority.roleMatch}
                    onChange={(v) => setPriority((p) => ({ ...p, roleMatch: v }))}
                  />
                  <PrioritySlider
                    label="Salary"
                    value={priority.salary}
                    onChange={(v) => setPriority((p) => ({ ...p, salary: v }))}
                  />
                  <PrioritySlider
                    label="Location"
                    value={priority.location}
                    onChange={(v) => setPriority((p) => ({ ...p, location: v }))}
                  />
                  <PrioritySlider
                    label="Company Type"
                    value={priority.companyType}
                    onChange={(v) => setPriority((p) => ({ ...p, companyType: v }))}
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* ── Company Filters (collapsible) ── */}
          <Card className="bg-[#111827] border-[#1F2937] p-5">
            <SectionHeader
              icon={Building2}
              title="Company Filters"
              description="Target or exclude specific companies and sizes"
              collapsible
              collapsed={companyCollapsed}
              onToggle={() => setCompanyCollapsed((v) => !v)}
            />
            {!companyCollapsed && (
              <div className="space-y-4">
                <div>
                  <Label className="text-[12px] text-[#9CA3AF] mb-1.5 block">Include Companies</Label>
                  <TagInput
                    tags={includeCompanies}
                    onChange={setIncludeCompanies}
                    placeholder="e.g. Stripe, Notion…"
                  />
                </div>
                <div>
                  <Label className="text-[12px] text-[#9CA3AF] mb-1.5 block">Exclude Companies</Label>
                  <TagInput
                    tags={excludeCompanies}
                    onChange={setExcludeCompanies}
                    placeholder="e.g. Uber, Meta…"
                  />
                </div>
                <div>
                  <Label className="text-[12px] text-[#9CA3AF] mb-2 block">Company Size</Label>
                  <div className="flex flex-wrap gap-2">
                    {companySizeOptions.map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => toggleCompanySize(size)}
                        className={`px-3 py-1.5 rounded-lg text-[12px] border transition-all ${
                          companySizes.includes(size)
                            ? "bg-[#4F8CFF]/15 text-[#4F8CFF] border-[#4F8CFF]/30"
                            : "bg-[#0B0F14] text-[#6B7280] border-[#1F2937] hover:text-[#9CA3AF] hover:border-[#374151]"
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* ── Job Freshness ── */}
          <Card className="bg-[#111827] border-[#1F2937] p-5">
            <SectionHeader
              icon={Clock}
              title="Job Freshness"
              description="Only show jobs posted within this window"
            />
            <SegmentedControl
              options={freshnessOptions}
              value={freshness}
              onChange={setFreshness}
            />
          </Card>

          {/* ── Sources ── */}
          <Card className="bg-[#111827] border-[#1F2937] p-5">
            <SectionHeader
              icon={Search}
              title="Job Sources"
              description="Choose which platforms to search"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(sources).map(([key, src]) => (
                <div
                  key={key}
                  onClick={() => toggleSource(key)}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    src.enabled
                      ? "bg-[#0B0F14] border-[#4F8CFF]/30"
                      : "bg-[#0B0F14] border-[#1F2937] opacity-60"
                  }`}
                >
                  <div
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: src.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-white">
                      {sourceLabels[key]}
                    </p>
                    <p className="text-[11px] text-[#6B7280]">
                      {src.jobCount.toLocaleString()} jobs · {src.lastSync}
                    </p>
                  </div>
                  <Switch
                    checked={src.enabled}
                    onCheckedChange={() => toggleSource(key)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ─── Right Column: Preview + Saved ─── */}
        <div className="space-y-5 xl:sticky xl:top-6">

          {/* Estimated Results */}
          <Card className="bg-[#111827] border-[#1F2937] p-5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[13px] text-[#9CA3AF]">Estimated Results</span>
              <Zap className="h-4 w-4 text-[#4F8CFF]" />
            </div>
            <div className="flex items-end gap-2">
              <span className="text-[40px] font-bold text-white leading-none">
                {estimatedResults > 9999
                  ? `${Math.round(estimatedResults / 1000)}k`
                  : estimatedResults.toLocaleString()}
              </span>
              <span className="text-[13px] text-[#6B7280] mb-1">jobs found</span>
            </div>
            <p className="text-[11px] text-[#4B5563] mt-1">
              Across {activeSources.length} active source{activeSources.length !== 1 ? "s" : ""}
            </p>
          </Card>

          {/* AI Search Preview */}
          <Card className="bg-[#111827] border-[#1F2937] p-5">
            <div className="flex items-center gap-2 mb-4">
              <Eye className="h-4 w-4 text-[#4F8CFF]" />
              <h3 className="text-[14px] font-semibold text-white">AI Search Preview</h3>
            </div>
            <div className="space-y-2.5">
              {previewItems.map((item) => (
                <div
                  key={item.label}
                  className={`flex gap-2.5 ${item.active ? "" : "opacity-40"}`}
                >
                  <CheckCircle2
                    className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${
                      item.active ? "text-[#4F8CFF]" : "text-[#374151]"
                    }`}
                  />
                  <div className="min-w-0">
                    <span className="text-[11px] font-medium text-[#9CA3AF]">
                      {item.label}:{" "}
                    </span>
                    <span
                      className={`text-[11px] ${
                        item.active ? "text-white" : "text-[#4B5563]"
                      }`}
                    >
                      {item.value}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* CTA */}
          <Button
            onClick={handleSearch}
            disabled={isSearching}
            className="w-full h-12 bg-[#4F8CFF] hover:bg-[#4F8CFF]/90 text-white text-[15px] font-semibold shadow-lg shadow-[#4F8CFF]/20"
          >
            {isSearching ? (
              <>
                <Sparkles className="h-4.5 w-4.5 mr-2 animate-pulse" />
                {searchPhase || "Searching…"}
              </>
            ) : (
              <>
                <Sparkles className="h-4.5 w-4.5 mr-2" />
                {jobTitles.length > 0 ? "Find Best Matches" : "Start Smart Search"}
              </>
            )}
          </Button>

          {/* Save Search */}
          {!saveDialogOpen ? (
            <button
              type="button"
              onClick={() => {
                setSaveDialogOpen(true);
                setTimeout(() => saveInputRef.current?.focus(), 50);
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-[#374151] text-[13px] text-[#6B7280] hover:border-[#4F8CFF]/40 hover:text-[#4F8CFF] transition-colors"
            >
              <Bookmark className="h-4 w-4" />
              Save this search
            </button>
          ) : (
            <Card className="bg-[#0B0F14] border-[#1F2937] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-white">Save Search</span>
                <button
                  type="button"
                  onClick={() => setSaveDialogOpen(false)}
                  className="text-[#6B7280] hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <Input
                ref={saveInputRef}
                placeholder="Search name…"
                value={saveSearchName}
                onChange={(e) => setSaveSearchName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveSearch()}
                className="bg-[#111827] border-[#1F2937] text-white placeholder:text-[#4B5563] h-9 text-[13px]"
              />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-[12px] text-[#9CA3AF]">Auto-run daily</Label>
                  <Switch
                    checked={saveAutoRun}
                    onCheckedChange={setSaveAutoRun}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-[12px] text-[#9CA3AF]">Notify new results</Label>
                  <Switch
                    checked={saveNotify}
                    onCheckedChange={setSaveNotify}
                  />
                </div>
              </div>
              <Button
                onClick={handleSaveSearch}
                disabled={!saveSearchName.trim()}
                className="w-full h-9 bg-[#4F8CFF] hover:bg-[#4F8CFF]/90 text-[13px]"
              >
                <BookmarkCheck className="h-4 w-4 mr-1.5" />
                Save Search
              </Button>
            </Card>
          )}

          {/* Saved Searches List */}
          {savedSearches.length > 0 && (
            <div>
              <h4 className="text-[12px] font-medium text-[#6B7280] mb-2.5 uppercase tracking-wider">
                Saved Searches
              </h4>
              <div className="space-y-2">
                {savedSearches.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-start gap-3 p-3 rounded-lg bg-[#0B0F14] border border-[#1F2937] hover:border-[#374151] transition-colors group"
                  >
                    <BookmarkCheck className="h-4 w-4 text-[#4F8CFF] shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-white truncate">{s.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[11px] text-[#6B7280]">
                          ~{s.estimatedResults} results
                        </span>
                        {s.autoRun && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-[#4F8CFF]">
                            <RotateCcw className="h-2.5 w-2.5" />
                            Daily
                          </span>
                        )}
                        {s.notify && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-[#10B981]">
                            <Bell className="h-2.5 w-2.5" />
                            Alerts on
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => {}}
                        title="Run search"
                        className="p-1 text-[#6B7280] hover:text-[#4F8CFF] transition-colors"
                      >
                        <Search className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteSavedSearch(s.id)}
                        title="Delete"
                        className="p-1 text-[#6B7280] hover:text-[#EF4444] transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add another saved search */}
          {savedSearches.length > 0 && !saveDialogOpen && (
            <button
              type="button"
              onClick={() => {
                setSaveDialogOpen(true);
                setTimeout(() => saveInputRef.current?.focus(), 50);
              }}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-[12px] text-[#6B7280] hover:text-[#4F8CFF] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add search
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
