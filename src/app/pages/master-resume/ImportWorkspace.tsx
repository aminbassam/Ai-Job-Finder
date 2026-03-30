import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  CheckCircle2,
  FileText,
  Loader2,
  Upload,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Switch } from "../../components/ui/switch";
import { Textarea } from "../../components/ui/textarea";
import {
  masterResumeService,
  ResumeImportRecord,
} from "../../services/masterResume.service";

interface ImportWorkspaceProps {
  onProfileCreated?: (profileId: string) => void;
}

interface ParsedPreview {
  title: string;
  summary: string;
  experienceCount: number;
  skillsCount: number;
  projectsCount: number;
  leadershipNote: string | null;
}

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

function toParsedPreview(parsedJson: Record<string, unknown>): ParsedPreview {
  const skills = parsedJson.skills;
  const skillCount = Array.isArray(skills)
    ? skills.length
    : skills && typeof skills === "object"
      ? Object.values(skills).reduce((count, value) => count + (Array.isArray(value) ? value.length : 0), 0)
      : 0;

  const leadership = parsedJson.leadership;
  let leadershipNote: string | null = null;
  if (leadership && typeof leadership === "object") {
    const leadershipObject = leadership as Record<string, unknown>;
    leadershipNote = [leadershipObject.scope, leadershipObject.budget]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(" • ") || null;
  }

  return {
    title:
      (typeof parsedJson.title === "string" && parsedJson.title.trim()) ||
      (typeof parsedJson.name === "string" && parsedJson.name.trim()) ||
      "Imported resume data",
    summary:
      (typeof parsedJson.summary === "string" && parsedJson.summary.trim()) ||
      "No AI summary extracted yet.",
    experienceCount: Array.isArray(parsedJson.experience) ? parsedJson.experience.length : 0,
    skillsCount: skillCount,
    projectsCount: Array.isArray(parsedJson.projects) ? parsedJson.projects.length : 0,
    leadershipNote,
  };
}

export function ImportWorkspace({ onProfileCreated }: ImportWorkspaceProps) {
  const [imports, setImports] = useState<ResumeImportRecord[]>([]);
  const [selectedImportId, setSelectedImportId] = useState<string | null>(null);
  const [loadingImports, setLoadingImports] = useState(true);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProfileName, setUploadProfileName] = useState("");
  const [createUploadProfile, setCreateUploadProfile] = useState(true);
  const [setUploadDefault, setSetUploadDefault] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [creatingFromImportId, setCreatingFromImportId] = useState<string | null>(null);

  async function loadImports(preferredId?: string | null) {
    setLoadingImports(true);
    try {
      const next = await masterResumeService.listImports();
      setImports(next);
      const targetId = preferredId
        ?? next[0]?.id
        ?? null;
      setSelectedImportId(targetId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load resume imports.");
    } finally {
      setLoadingImports(false);
    }
  }

  useEffect(() => {
    void loadImports();
  }, []);

  const selectedImport = useMemo(
    () => imports.find((entry) => entry.id === selectedImportId) ?? null,
    [imports, selectedImportId]
  );

  const preview = useMemo(
    () => (selectedImport ? toParsedPreview(selectedImport.parsedJson) : null),
    [selectedImport]
  );

  async function handleUploadImport() {
    if (!uploadFile) {
      setError("Choose a PDF or DOCX resume to import.");
      return;
    }

    setUploadLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const base64 = await readFileAsBase64(uploadFile);
      const response = await masterResumeService.parseResume({
        fileName: uploadFile.name,
        mimeType: uploadFile.type || "application/octet-stream",
        base64,
        profileName: uploadProfileName.trim() || undefined,
        createProfile: createUploadProfile,
        isDefault: createUploadProfile ? setUploadDefault : undefined,
      });

      await loadImports(response.importId);

      if (response.profile?.id) {
        setSuccess(`Resume imported successfully as "${response.profile.name}".`);
        onProfileCreated?.(response.profile.id);
      } else {
        setSuccess("Resume imported successfully. Review the parsed data and create a profile when ready.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import resume.");
    } finally {
      setUploadLoading(false);
    }
  }

  async function handleCreateProfileFromImport(importRecord: ResumeImportRecord) {
    setCreatingFromImportId(importRecord.id);
    setError(null);
    setSuccess(null);

    try {
      const profile = await masterResumeService.createProfileFromImport({
        importId: importRecord.id,
        name: preview?.title || undefined,
        isDefault: false,
      });
      setSuccess(`Created structured profile "${profile.name}" from the import.`);
      onProfileCreated?.(profile.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create profile from import.");
    } finally {
      setCreatingFromImportId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-[#1F2937] bg-[#111827] p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-[20px] font-semibold text-white">Import Into Master Resume</h2>
            <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-[#9CA3AF]">
              Upload an existing resume, convert it into structured career data, and turn it into reusable Master Resume profiles for resume tailoring, job-fit scoring, and AI guidance across the platform.
            </p>
          </div>
          <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] px-4 py-3 text-[12px] text-[#9CA3AF]">
            AI parsing uses your connected provider from{" "}
            <Link to="/settings" className="text-[#4F8CFF] hover:underline">
              Settings → AI Settings
            </Link>
            .
          </div>
        </div>

        {(error || success) && (
          <div className={`mt-4 rounded-lg border px-4 py-3 text-[13px] ${error ? "border-[#7F1D1D] bg-[#7F1D1D]/10 text-[#FCA5A5]" : "border-[#14532D] bg-[#14532D]/10 text-[#86EFAC]"}`}>
            {error || success}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr,1fr]">
        <div className="space-y-6">
          <Card className="border-[#1F2937] bg-[#111827] p-5">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#22C55E]/10">
                <Upload className="h-5 w-5 text-[#22C55E]" />
              </div>
              <div>
                <h3 className="text-[16px] font-semibold text-white">Resume Upload</h3>
                <p className="text-[12px] text-[#6B7280]">
                  Upload a PDF or DOCX and convert the document into structured resume intelligence.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Resume File</Label>
                <Input
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                  className="border-[#1F2937] bg-[#0B0F14] text-white file:mr-4 file:rounded-md file:border-0 file:bg-[#1F2937] file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-white"
                />
                {uploadFile && (
                  <p className="mt-2 text-[12px] text-[#9CA3AF]">
                    Selected: {uploadFile.name}
                  </p>
                )}
              </div>
              <div>
                <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Profile Name</Label>
                <Input
                  value={uploadProfileName}
                  onChange={(event) => setUploadProfileName(event.target.value)}
                  placeholder="Executive PM, Product Ops Lead, Full-Stack Engineer…"
                  className="border-[#1F2937] bg-[#0B0F14] text-white"
                />
              </div>

              <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[13px] font-medium text-white">Create a structured profile automatically</p>
                    <p className="text-[12px] text-[#6B7280]">Turn the uploaded document into a reusable Master Resume profile right away.</p>
                  </div>
                  <Switch checked={createUploadProfile} onCheckedChange={setCreateUploadProfile} />
                </div>
                {createUploadProfile && (
                  <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-[#1F2937] bg-[#111827] px-4 py-3">
                    <div>
                      <p className="text-[13px] font-medium text-white">Set as default Master Resume profile</p>
                      <p className="text-[12px] text-[#6B7280]">Useful when this upload should power tailoring across the app.</p>
                    </div>
                    <Switch checked={setUploadDefault} onCheckedChange={setSetUploadDefault} />
                  </div>
                )}
              </div>

              <Button
                onClick={handleUploadImport}
                disabled={uploadLoading}
                className="w-full bg-[#22C55E] text-white hover:bg-[#22C55E]/90"
              >
                {uploadLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Upload And Parse Resume
              </Button>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-[#1F2937] bg-[#111827] p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[16px] font-semibold text-white">Parsed Import Preview</h3>
                <p className="text-[12px] text-[#6B7280]">Review the structured output before turning it into a profile.</p>
              </div>
              {selectedImport && !selectedImport.sourceUrl && selectedImport.fileName && (
                <span className="rounded-full border border-[#22C55E]/30 bg-[#22C55E]/10 px-2 py-1 text-[11px] text-[#86EFAC]">
                  Upload
                </span>
              )}
            </div>

            {!selectedImport || !preview ? (
              <div className="rounded-xl border border-dashed border-[#1F2937] bg-[#0B0F14] p-5 text-[13px] text-[#9CA3AF]">
                Upload a resume to preview the parsed structure here.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[16px] font-semibold text-white">{preview.title}</p>
                      <p className="mt-1 text-[12px] text-[#6B7280]">
                        Imported {new Date(selectedImport.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-full border border-[#4F8CFF]/30 bg-[#4F8CFF]/10 px-2 py-1 text-[11px] text-[#93C5FD]">
                      {selectedImport.sourceType === "linkedin" ? "LinkedIn" : "Resume Upload"}
                    </div>
                  </div>
                  <p className="mt-3 text-[13px] leading-relaxed text-[#D1D5DB]">
                    {preview.summary}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Experience", value: preview.experienceCount },
                    { label: "Skills", value: preview.skillsCount },
                    { label: "Projects", value: preview.projectsCount },
                    { label: "Leadership", value: preview.leadershipNote ? 1 : 0 },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-3">
                      <p className="text-[11px] uppercase tracking-wide text-[#6B7280]">{item.label}</p>
                      <p className="mt-1 text-[22px] font-semibold text-white">{item.value}</p>
                    </div>
                  ))}
                </div>

                {preview.leadershipNote && (
                  <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-3 text-[13px] text-[#D1D5DB]">
                    <span className="font-medium text-white">Leadership context:</span> {preview.leadershipNote}
                  </div>
                )}

                <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-[13px] font-semibold text-white">Structured JSON Preview</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleCreateProfileFromImport(selectedImport)}
                      disabled={creatingFromImportId === selectedImport.id}
                      className="border-[#374151] bg-[#111827] text-white hover:bg-[#1F2937]"
                    >
                      {creatingFromImportId === selectedImport.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Create Profile
                    </Button>
                  </div>
                  <Textarea
                    readOnly
                    value={JSON.stringify(selectedImport.parsedJson, null, 2)}
                    rows={16}
                    className="border-[#1F2937] bg-[#111827] font-mono text-[12px] text-[#D1D5DB]"
                  />
                </div>
              </div>
            )}
          </Card>

          <Card className="border-[#1F2937] bg-[#111827] p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[16px] font-semibold text-white">Import History</h3>
                <p className="text-[12px] text-[#6B7280]">Reuse a past import any time without uploading again.</p>
              </div>
              {loadingImports && <Loader2 className="h-4 w-4 animate-spin text-[#4F8CFF]" />}
            </div>

            {imports.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#1F2937] bg-[#0B0F14] p-5 text-[13px] text-[#9CA3AF]">
                No imports yet. Once you upload a file, each parsed record will appear here.
              </div>
            ) : (
              <div className="space-y-3">
                {imports.map((entry) => {
                  const entryPreview = toParsedPreview(entry.parsedJson);
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setSelectedImportId(entry.id)}
                      className={`w-full rounded-xl border p-4 text-left transition-all ${
                        selectedImportId === entry.id
                          ? "border-[#4F8CFF]/40 bg-[#4F8CFF]/10"
                          : "border-[#1F2937] bg-[#0B0F14] hover:border-[#374151]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-white">{entryPreview.title}</p>
                          <p className="mt-1 text-[11px] text-[#6B7280]">
                            {entry.sourceType === "linkedin" ? entry.sourceUrl : entry.fileName}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-[#9CA3AF]">
                          <FileText className="h-3.5 w-3.5" />
                          {new Date(entry.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
