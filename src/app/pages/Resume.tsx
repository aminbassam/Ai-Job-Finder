import { useState } from "react";
import {
  ArrowLeft,
  Database,
  FileText,
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

type CreateMode = "manual" | "upload";

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

  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadUseForAi, setUploadUseForAi] = useState(true);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadProgressLabel, setUploadProgressLabel] = useState<string | null>(null);

  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);

  function openCreatedProfile(profileId: string, message?: string) {
    setFocusProfileId(profileId);
    setProfileRefreshKey((current) => current + 1);
    setShowCreatePanel(false);
    setCreateSuccess(message ?? null);
    setWorkspaceNotice(null);
    setCreateError(null);
  }

  function returnToProfiles(message?: string) {
    setFocusProfileId(null);
    setProfileRefreshKey((current) => current + 1);
    setShowCreatePanel(false);
    setWorkspaceNotice(message ?? null);
    setCreateSuccess(null);
    setCreateError(null);
  }

  function resetCreationState(mode?: CreateMode) {
    if (mode) setCreateMode(mode);
    setCreateError(null);
    setCreateSuccess(null);
    setWorkspaceNotice(null);
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

  async function handleResumeUpload() {
    if (uploadFiles.length === 0) {
      setCreateError("Choose at least one PDF or DOCX file first.");
      return;
    }

    setUploadLoading(true);
    setUploadProgressLabel(null);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      const importedProfiles: Array<{ profileId: string; profileName: string; fileName: string }> = [];
      const failures: string[] = [];

      for (const [index, file] of uploadFiles.entries()) {
        setUploadProgressLabel(`Importing ${index + 1} of ${uploadFiles.length}: ${file.name}`);
        try {
          const base64 = await readFileAsBase64(file);
          const response = await masterResumeService.parseResume({
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            base64,
            createProfile: true,
            isActive: true,
            useForAi: uploadUseForAi,
            isDefault: false,
          });
          if (!response.profile?.id) {
            throw new Error("A profile was not created.");
          }
          importedProfiles.push({
            profileId: response.profile.id,
            profileName: response.profile.name,
            fileName: file.name,
          });
        } catch (err) {
          failures.push(`${file.name}: ${err instanceof Error ? err.message : "Import failed."}`);
        }
      }

      if (importedProfiles.length === 0) {
        throw new Error(failures.join(" "));
      }

      if (importedProfiles.length === 1 && failures.length === 0) {
        const imported = importedProfiles[0];
        openCreatedProfile(
          imported.profileId,
          `Resume imported successfully as "${imported.profileName}". Review it and tune it for the highest-quality AI resume output.`
        );
        return;
      }

      const suggestedNames = importedProfiles.map((item) => `"${item.profileName}"`).join(", ");
      const failureSummary = failures.length > 0 ? ` ${failures.length} file${failures.length === 1 ? "" : "s"} failed: ${failures.join(" | ")}` : "";
      returnToProfiles(
        `Imported ${importedProfiles.length} resume${importedProfiles.length === 1 ? "" : "s"} successfully. AI suggested profile names: ${suggestedNames}.${failureSummary}`
      );
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to import resume file.");
    } finally {
      setUploadLoading(false);
      setUploadProgressLabel(null);
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
              setShowCreatePanel(true);
              resetCreationState("manual");
            }}
            className="bg-[#4F8CFF] text-white hover:bg-[#4F8CFF]/90"
          >
            <Plus className="h-4 w-4" />
            Add Resume Profile
          </Button>
        </div>
      </div>

      {showCreatePanel && (
        <Card className="border-[#1F2937] bg-[#111827] p-6">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <Button
                variant="outline"
                onClick={() => setShowCreatePanel(false)}
                className="border-[#374151] bg-[#111827] text-white hover:bg-[#1F2937]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back To Profiles
              </Button>
              <div>
                <h2 className="text-[24px] font-semibold text-white">Add Resume Profile</h2>
                <p className="mt-1 max-w-2xl text-[13px] text-[#9CA3AF]">
                  Create a profile manually or upload one or more resumes. Each uploaded document is saved as its own import, and AI suggests a profile name for each saved profile automatically.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Card className="border-[#1F2937] bg-[#0B0F14] px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-[#6B7280]">Best For</p>
                <p className="mt-1 text-[13px] text-white">Bulk importing existing resumes fast</p>
              </Card>
              <Card className="border-[#1F2937] bg-[#0B0F14] px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-[#6B7280]">AI Naming</p>
                <p className="mt-1 text-[13px] text-white">Suggested automatically from each document</p>
              </Card>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[
              { id: "manual", icon: FileText, title: "Add Manually", body: "Start a fresh structured profile and fill it in yourself." },
              { id: "upload", icon: Upload, title: "Import PDF / DOCX", body: "Upload one or many resumes and turn each into its own editable profile." },
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

            {createMode === "upload" && (
              <div className="space-y-4">
                <div>
                  <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Resume Files</Label>
                  <Input
                    type="file"
                    multiple
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(event) => setUploadFiles(Array.from(event.target.files ?? []))}
                    className="border-[#1F2937] bg-[#111827] text-white file:mr-4 file:rounded-md file:border-0 file:bg-[#1F2937] file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-white"
                  />
                  <p className="mt-2 text-[12px] text-[#9CA3AF]">
                    AI will suggest a profile name for each uploaded document based on the parsed resume content.
                  </p>
                  {uploadFiles.length > 0 && (
                    <div className="mt-3 space-y-2 rounded-lg border border-[#1F2937] bg-[#111827] p-3">
                      {uploadFiles.map((file) => (
                        <div key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-3 text-[12px] text-[#D1D5DB]">
                          <span className="truncate">{file.name}</span>
                          <span className="shrink-0 text-[#6B7280]">{Math.max(1, Math.round(file.size / 1024))} KB</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between rounded-lg border border-[#1F2937] bg-[#111827] px-4 py-3">
                  <div>
                    <p className="text-[13px] font-medium text-white">Enable for AI resume generation</p>
                    <p className="text-[12px] text-[#6B7280]">Every imported profile marked here will be available in the job-board resume generator.</p>
                  </div>
                  <Switch checked={uploadUseForAi} onCheckedChange={setUploadUseForAi} />
                </div>
                {uploadProgressLabel && (
                  <div className="rounded-lg border border-[#1F2937] bg-[#111827] px-4 py-3 text-[12px] text-[#93C5FD]">
                    {uploadProgressLabel}
                  </div>
                )}
                <Button
                  onClick={() => void handleResumeUpload()}
                  disabled={uploadLoading}
                  className="bg-[#22C55E] text-white hover:bg-[#22C55E]/90"
                >
                  {uploadLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Import {uploadFiles.length > 1 ? `${uploadFiles.length} Resumes` : "Resume File"}
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      {!showCreatePanel && (
        <>
          {workspaceNotice && (
            <div className="rounded-lg border border-[#14532D] bg-[#14532D]/10 px-4 py-3 text-[13px] text-[#86EFAC]">
              {workspaceNotice}
            </div>
          )}

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

          <ProfilesWorkspace
            refreshKey={profileRefreshKey}
            focusProfileId={focusProfileId}
            focusProfileMessage={createSuccess}
            onAddProfile={() => {
              setShowCreatePanel(true);
              resetCreationState("manual");
            }}
          />
        </>
      )}
    </div>
  );
}
