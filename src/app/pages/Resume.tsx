import { useState } from "react";
import {
  Database,
  FileText,
  Linkedin,
  Loader2,
  Plus,
  Sparkles,
  Upload,
} from "lucide-react";
import { Link } from "react-router";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { JobTitleTagInput } from "../components/ui/job-title-tag-input";
import { ProfilesWorkspace } from "./master-resume/ProfilesWorkspace";
import { masterResumeService } from "../services/masterResume.service";

type CreateMode = "manual" | "linkedin" | "upload";

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      if (!base64) {
        reject(new Error("Failed to extract file data."));
        return;
      }
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });
}

export function Resume() {
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const [focusProfileId, setFocusProfileId] = useState<string | null>(null);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [createMode, setCreateMode] = useState<CreateMode>("manual");

  const [manualName, setManualName] = useState("");
  const [manualTargetRoles, setManualTargetRoles] = useState<string[]>([]);
  const [manualUseForAi, setManualUseForAi] = useState(true);
  const [manualLoading, setManualLoading] = useState(false);

  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [linkedinProfileName, setLinkedinProfileName] = useState("");
  const [linkedinUseForAi, setLinkedinUseForAi] = useState(true);
  const [linkedinLoading, setLinkedinLoading] = useState(false);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProfileName, setUploadProfileName] = useState("");
  const [uploadUseForAi, setUploadUseForAi] = useState(true);
  const [uploadLoading, setUploadLoading] = useState(false);

  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  function openCreatedProfile(profileId: string, message?: string) {
    setFocusProfileId(profileId);
    setProfileRefreshKey((current) => current + 1);
    setShowCreatePanel(false);
    setCreateSuccess(message ?? null);
    setCreateError(null);
  }

  function resetCreationState(mode?: CreateMode) {
    if (mode) setCreateMode(mode);
    setCreateError(null);
    setCreateSuccess(null);
  }

  async function handleCreateManualProfile() {
    if (!manualName.trim()) {
      setCreateError("Profile name is required.");
      return;
    }

    setManualLoading(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      const profile = await masterResumeService.createProfile({
        sourceImportId: null,
        name: manualName.trim(),
        targetRoles: manualTargetRoles,
        summary: "",
        experienceYears: 0,
        isActive: true,
        useForAi: manualUseForAi,
        isDefault: false,
        experiences: [],
        skills: {
          core: [],
          tools: [],
          soft: [],
          certifications: [],
        },
        education: [],
        projects: [],
        leadership: {
          teamSize: null,
          scope: "",
          stakeholders: [],
          budget: "",
        },
      });
      openCreatedProfile(profile.id, `Created "${profile.name}". You can now complete and refine it below.`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create manual profile.");
    } finally {
      setManualLoading(false);
    }
  }

  async function handleLinkedInImport() {
    if (!linkedinUrl.trim()) {
      setCreateError("LinkedIn URL is required.");
      return;
    }

    setLinkedinLoading(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      const response = await masterResumeService.parseLinkedIn({
        url: linkedinUrl.trim(),
        profileName: linkedinProfileName.trim() || undefined,
        createProfile: true,
        isActive: true,
        useForAi: linkedinUseForAi,
        isDefault: false,
      });
      if (!response.profile?.id) {
        throw new Error("LinkedIn import finished, but a profile was not created.");
      }
      openCreatedProfile(
        response.profile.id,
        `LinkedIn import created "${response.profile.name}". The AI can now use it when generating tailored resumes.`
      );
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to import LinkedIn profile.");
    } finally {
      setLinkedinLoading(false);
    }
  }

  async function handleResumeUpload() {
    if (!uploadFile) {
      setCreateError("Choose a PDF or DOCX file first.");
      return;
    }

    setUploadLoading(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      const base64 = await readFileAsBase64(uploadFile);
      const response = await masterResumeService.parseResume({
        fileName: uploadFile.name,
        mimeType: uploadFile.type || "application/octet-stream",
        base64,
        profileName: uploadProfileName.trim() || undefined,
        createProfile: true,
        isActive: true,
        useForAi: uploadUseForAi,
        isDefault: false,
      });
      if (!response.profile?.id) {
        throw new Error("Resume import finished, but a profile was not created.");
      }
      openCreatedProfile(
        response.profile.id,
        `Resume import created "${response.profile.name}". Review it and tune it for the highest-quality AI resume output.`
      );
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to import resume file.");
    } finally {
      setUploadLoading(false);
    }
  }

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="mb-2 text-[32px] font-semibold text-white">Master Resume</h1>
          <p className="max-w-4xl text-[14px] text-[#9CA3AF]">
            Keep multiple resume profiles, enable the ones AI can use, and feed resume generation with richer structured career data for much stronger tailored output.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Card className="border-[#1F2937] bg-[#111827] px-4 py-3">
            <p className="text-[12px] text-[#9CA3AF]">
              Shared AI behavior and prompt instructions live in{" "}
              <Link to="/settings" className="text-[#4F8CFF] hover:underline">
                Settings → AI Settings
              </Link>
              .
            </p>
          </Card>
          <Button
            onClick={() => {
              setShowCreatePanel((current) => !current);
              resetCreationState("manual");
            }}
            className="bg-[#4F8CFF] text-white hover:bg-[#4F8CFF]/90"
          >
            <Plus className="h-4 w-4" />
            Add Resume Profile
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {[
          {
            icon: Database,
            title: "Multiple Resume Profiles",
            body: "Maintain different Master Resume tracks for different domains, roles, or client positioning needs.",
          },
          {
            icon: Sparkles,
            title: "AI-Enabled Profiles",
            body: "Enable the strongest profiles for AI so tailored resumes can combine the best matching context for each job.",
          },
          {
            icon: FileText,
            title: "Structured Editing",
            body: "Review, enrich, and improve imported experience, impact bullets, skills, projects, and leadership in one place.",
          },
        ].map((item) => (
          <Card key={item.title} className="border-[#1F2937] bg-[#111827] p-5">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#4F8CFF]/10">
              <item.icon className="h-5 w-5 text-[#4F8CFF]" />
            </div>
            <h2 className="text-[16px] font-semibold text-white">{item.title}</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-[#9CA3AF]">{item.body}</p>
          </Card>
        ))}
      </div>

      {showCreatePanel && (
        <Card className="border-[#1F2937] bg-[#111827] p-5">
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-[20px] font-semibold text-white">Add Resume Profile</h2>
              <p className="mt-1 text-[13px] text-[#9CA3AF]">
                Choose how you want to add a new Master Resume profile. Every path creates a profile the AI can use when generating and tailoring resumes across the platform.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowCreatePanel(false)}
              className="border-[#374151] bg-[#111827] text-white hover:bg-[#1F2937]"
            >
              Close
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              { id: "manual", icon: FileText, title: "Add Manually", body: "Start a fresh structured profile and fill it in yourself." },
              { id: "linkedin", icon: Linkedin, title: "Import from LinkedIn", body: "Use a LinkedIn profile URL and convert it into structured resume data." },
              { id: "upload", icon: Upload, title: "Import PDF / DOCX", body: "Upload an existing resume and convert it into an editable profile." },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => resetCreationState(option.id as CreateMode)}
                className={`rounded-xl border p-4 text-left transition-all ${
                  createMode === option.id
                    ? "border-[#4F8CFF]/40 bg-[#4F8CFF]/10"
                    : "border-[#1F2937] bg-[#0B0F14] hover:border-[#374151]"
                }`}
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#4F8CFF]/10">
                  <option.icon className="h-5 w-5 text-[#4F8CFF]" />
                </div>
                <p className="text-[14px] font-semibold text-white">{option.title}</p>
                <p className="mt-2 text-[12px] leading-relaxed text-[#9CA3AF]">{option.body}</p>
              </button>
            ))}
          </div>

          {(createError || createSuccess) && (
            <div className={`mt-5 rounded-lg border px-4 py-3 text-[13px] ${createError ? "border-[#7F1D1D] bg-[#7F1D1D]/10 text-[#FCA5A5]" : "border-[#14532D] bg-[#14532D]/10 text-[#86EFAC]"}`}>
              {createError || createSuccess}
            </div>
          )}

          <div className="mt-5 rounded-xl border border-[#1F2937] bg-[#0B0F14] p-5">
            {createMode === "manual" && (
              <div className="space-y-4">
                <div>
                  <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Profile Name</Label>
                  <Input
                    value={manualName}
                    onChange={(event) => setManualName(event.target.value)}
                    placeholder="Technical PM, SEO Manager, WordPress Developer…"
                    className="border-[#1F2937] bg-[#111827] text-white"
                  />
                </div>
                <div>
                  <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Target Roles</Label>
                  <JobTitleTagInput
                    tags={manualTargetRoles}
                    onChange={setManualTargetRoles}
                    placeholder="Search from a full job title catalog…"
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-[#1F2937] bg-[#111827] px-4 py-3">
                  <div>
                    <p className="text-[13px] font-medium text-white">Enable for AI resume generation</p>
                    <p className="text-[12px] text-[#6B7280]">This profile will be available when generating tailored resumes from jobs.</p>
                  </div>
                  <Switch checked={manualUseForAi} onCheckedChange={setManualUseForAi} />
                </div>
                <Button
                  onClick={() => void handleCreateManualProfile()}
                  disabled={manualLoading}
                  className="bg-[#4F8CFF] text-white hover:bg-[#4F8CFF]/90"
                >
                  {manualLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Create Manual Profile
                </Button>
              </div>
            )}

            {createMode === "linkedin" && (
              <div className="space-y-4">
                <div>
                  <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">LinkedIn URL</Label>
                  <Input
                    value={linkedinUrl}
                    onChange={(event) => setLinkedinUrl(event.target.value)}
                    placeholder="https://www.linkedin.com/in/your-profile"
                    className="border-[#1F2937] bg-[#111827] text-white"
                  />
                </div>
                <div>
                  <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Profile Name</Label>
                  <Input
                    value={linkedinProfileName}
                    onChange={(event) => setLinkedinProfileName(event.target.value)}
                    placeholder="Optional override, e.g. Product Marketing Lead"
                    className="border-[#1F2937] bg-[#111827] text-white"
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-[#1F2937] bg-[#111827] px-4 py-3">
                  <div>
                    <p className="text-[13px] font-medium text-white">Enable for AI resume generation</p>
                    <p className="text-[12px] text-[#6B7280]">Recommended if this imported LinkedIn profile should be selectable when generating tailored resumes.</p>
                  </div>
                  <Switch checked={linkedinUseForAi} onCheckedChange={setLinkedinUseForAi} />
                </div>
                <Button
                  onClick={() => void handleLinkedInImport()}
                  disabled={linkedinLoading}
                  className="bg-[#4F8CFF] text-white hover:bg-[#4F8CFF]/90"
                >
                  {linkedinLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Linkedin className="h-4 w-4" />}
                  Import LinkedIn Profile
                </Button>
              </div>
            )}

            {createMode === "upload" && (
              <div className="space-y-4">
                <div>
                  <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Resume File</Label>
                  <Input
                    type="file"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                    className="border-[#1F2937] bg-[#111827] text-white file:mr-4 file:rounded-md file:border-0 file:bg-[#1F2937] file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-white"
                  />
                  {uploadFile && (
                    <p className="mt-2 text-[12px] text-[#9CA3AF]">Selected: {uploadFile.name}</p>
                  )}
                </div>
                <div>
                  <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Profile Name</Label>
                  <Input
                    value={uploadProfileName}
                    onChange={(event) => setUploadProfileName(event.target.value)}
                    placeholder="Optional override, e.g. Executive Product Profile"
                    className="border-[#1F2937] bg-[#111827] text-white"
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-[#1F2937] bg-[#111827] px-4 py-3">
                  <div>
                    <p className="text-[13px] font-medium text-white">Enable for AI resume generation</p>
                    <p className="text-[12px] text-[#6B7280]">Imported profiles marked on here will be available in the job-board resume generator.</p>
                  </div>
                  <Switch checked={uploadUseForAi} onCheckedChange={setUploadUseForAi} />
                </div>
                <Button
                  onClick={() => void handleResumeUpload()}
                  disabled={uploadLoading}
                  className="bg-[#22C55E] text-white hover:bg-[#22C55E]/90"
                >
                  {uploadLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Import Resume File
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      <ProfilesWorkspace
        refreshKey={profileRefreshKey}
        focusProfileId={focusProfileId}
        onAddProfile={() => {
          setShowCreatePanel(true);
          resetCreationState("manual");
        }}
      />
    </div>
  );
}
