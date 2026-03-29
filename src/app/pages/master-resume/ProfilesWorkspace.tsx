import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookmarkCheck,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Switch } from "../../components/ui/switch";
import { TagInput } from "../../components/ui/tag-input";
import {
  masterResumeService,
  MasterResumeBullet,
  MasterResumeExperience,
  MasterResumeLeadership,
  MasterResumeProfile,
  MasterResumeProfileInput,
  MasterResumeProject,
  ResumeScoreResult,
} from "../../services/masterResume.service";

interface ProfilesWorkspaceProps {
  refreshKey?: number;
  focusProfileId?: string | null;
}

const DEFAULT_PROFILE_NAME = "New Profile";

function emptyBullet(): MasterResumeBullet {
  return { action: "", method: "", result: "", metric: "", tools: [], keywords: [], originalText: "" };
}

function emptyExperience(): MasterResumeExperience {
  return {
    title: "",
    company: "",
    startDate: "",
    endDate: "",
    bullets: [emptyBullet()],
  };
}

function emptyProject(): MasterResumeProject {
  return {
    name: "",
    role: "",
    description: "",
    tools: [],
    teamSize: null,
    outcome: "",
    metrics: "",
  };
}

function emptyLeadership(): MasterResumeLeadership {
  return {
    teamSize: null,
    scope: "",
    stakeholders: [],
    budget: "",
  };
}

function emptyProfileInput(name = DEFAULT_PROFILE_NAME): MasterResumeProfileInput {
  return {
    sourceImportId: null,
    name,
    targetRoles: [],
    summary: "",
    experienceYears: 0,
    isDefault: false,
    experiences: [emptyExperience()],
    skills: {
      core: [],
      tools: [],
      soft: [],
      certifications: [],
    },
    projects: [],
    leadership: emptyLeadership(),
  };
}

function toInput(profile: MasterResumeProfile): MasterResumeProfileInput {
  return {
    sourceImportId: profile.sourceImportId ?? null,
    name: profile.name,
    targetRoles: profile.targetRoles,
    summary: profile.summary ?? "",
    experienceYears: profile.experienceYears,
    isDefault: profile.isDefault,
    experiences: profile.experiences.length > 0 ? profile.experiences : [emptyExperience()],
    skills: profile.skills,
    projects: profile.projects,
    leadership: profile.leadership ?? emptyLeadership(),
  };
}

export function ProfilesWorkspace({ refreshKey = 0, focusProfileId = null }: ProfilesWorkspaceProps) {
  const [profiles, setProfiles] = useState<MasterResumeProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MasterResumeProfileInput>(emptyProfileInput());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [scoreInput, setScoreInput] = useState({ jobTitle: "", jobDescription: "" });
  const [scoring, setScoring] = useState(false);
  const [scoreResult, setScoreResult] = useState<ResumeScoreResult | null>(null);
  const [bulletLoadingKey, setBulletLoadingKey] = useState<string | null>(null);

  async function loadProfiles(preferredId?: string | null) {
    setLoading(true);
    setError(null);
    try {
      const next = await masterResumeService.listProfiles();
      setProfiles(next);

      if (next.length === 0) {
        setSelectedId(null);
        setDraft(emptyProfileInput());
      } else {
        const target = next.find((profile) => profile.id === preferredId)
          ?? next.find((profile) => profile.isDefault)
          ?? next[0];
        setSelectedId(target.id);
        setDraft(toInput(target));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load master resume profiles.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProfiles(focusProfileId);
  }, [refreshKey, focusProfileId]);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedId) ?? null,
    [profiles, selectedId]
  );

  function updateDraft<K extends keyof MasterResumeProfileInput>(key: K, value: MasterResumeProfileInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaveMessage(null);
  }

  function updateExperience(index: number, patch: Partial<MasterResumeExperience>) {
    setDraft((current) => ({
      ...current,
      experiences: current.experiences.map((experience, experienceIndex) =>
        experienceIndex === index ? { ...experience, ...patch } : experience
      ),
    }));
  }

  function updateBullet(experienceIndex: number, bulletIndex: number, patch: Partial<MasterResumeBullet>) {
    setDraft((current) => ({
      ...current,
      experiences: current.experiences.map((experience, currentExperienceIndex) =>
        currentExperienceIndex === experienceIndex
          ? {
              ...experience,
              bullets: experience.bullets.map((bullet, currentBulletIndex) =>
                currentBulletIndex === bulletIndex ? { ...bullet, ...patch } : bullet
              ),
            }
          : experience
      ),
    }));
  }

  function updateProject(index: number, patch: Partial<MasterResumeProject>) {
    setDraft((current) => ({
      ...current,
      projects: current.projects.map((project, projectIndex) =>
        projectIndex === index ? { ...project, ...patch } : project
      ),
    }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaveMessage(null);
    try {
      if (!draft.name.trim()) {
        throw new Error("Profile name is required.");
      }

      let saved: MasterResumeProfile;
      if (selectedProfile) {
        saved = await masterResumeService.updateProfile(selectedProfile.id, draft);
      } else {
        saved = await masterResumeService.createProfile(draft);
      }

      setSaveMessage("Master resume profile saved.");
      await loadProfiles(saved.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save master resume profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedProfile) return;
    const confirmed = window.confirm(`Delete "${selectedProfile.name}"?`);
    if (!confirmed) return;

    setDeleting(true);
    setError(null);
    try {
      await masterResumeService.deleteProfile(selectedProfile.id);
      await loadProfiles(null);
      setSaveMessage("Profile deleted.");
      setScoreResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete profile.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleGenerateSummary() {
    if (!selectedProfile) return;
    setSummaryLoading(true);
    setError(null);
    try {
      const result = await masterResumeService.generateSummary(selectedProfile.id);
      updateDraft("summary", result.summary);
      setSaveMessage("AI summary drafted. Save the profile to keep it.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate summary.");
    } finally {
      setSummaryLoading(false);
    }
  }

  async function handleGenerateBullets(experienceIndex: number) {
    const experience = draft.experiences[experienceIndex];
    if (!experience?.title.trim() || !experience.company.trim()) {
      setError("Experience title and company are required before generating bullets.");
      return;
    }

    setBulletLoadingKey(`experience-${experienceIndex}`);
    setError(null);
    try {
      const result = await masterResumeService.generateBullets({
        profileId: selectedProfile?.id,
        title: experience.title,
        company: experience.company,
        roleContext: draft.summary ?? "",
        rawBullets: experience.bullets.map((bullet) => bullet.originalText || bullet.result || "").filter(Boolean),
      });

      updateExperience(experienceIndex, {
        bullets: result.bullets.length > 0
          ? result.bullets.map((bullet) => ({
              action: bullet.action ?? "",
              method: bullet.method ?? "",
              result: bullet.result ?? "",
              metric: bullet.metric ?? "",
              tools: bullet.tools ?? [],
              keywords: bullet.keywords ?? [],
              originalText: bullet.originalText ?? "",
            }))
          : experience.bullets,
      });
      setSaveMessage("AI bullets drafted. Save the profile to keep them.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate bullets.");
    } finally {
      setBulletLoadingKey(null);
    }
  }

  async function handleScoreResume() {
    if (!selectedProfile) {
      setError("Save the profile first before scoring it against a job.");
      return;
    }
    if (!scoreInput.jobDescription.trim()) {
      setError("Paste a job description to score the profile.");
      return;
    }

    setScoring(true);
    setError(null);
    try {
      const result = await masterResumeService.scoreResume({
        profileId: selectedProfile.id,
        jobTitle: scoreInput.jobTitle,
        jobDescription: scoreInput.jobDescription,
      });
      setScoreResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to score resume.");
    } finally {
      setScoring(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[280px,1fr,360px]">
      <Card className="border-[#1F2937] bg-[#111827] p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold text-white">Profiles</h2>
            <p className="text-[12px] text-[#6B7280]">Maintain multiple master resume tracks.</p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setSelectedId(null);
              setDraft(emptyProfileInput(`Profile ${profiles.length + 1}`));
              setScoreResult(null);
              setSaveMessage(null);
            }}
            className="bg-[#4F8CFF] text-white hover:bg-[#4F8CFF]/90"
          >
            <Plus className="h-4 w-4" />
            New
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[#4F8CFF]" />
          </div>
        ) : profiles.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#1F2937] bg-[#0B0F14] p-4 text-[13px] text-[#9CA3AF]">
            No master resume profiles yet. Create one or import from LinkedIn / resume upload.
          </div>
        ) : (
          <div className="space-y-2">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => {
                  setSelectedId(profile.id);
                  setDraft(toInput(profile));
                  setSaveMessage(null);
                }}
                className={`w-full rounded-lg border p-3 text-left transition-all ${
                  selectedId === profile.id
                    ? "border-[#4F8CFF]/40 bg-[#4F8CFF]/10"
                    : "border-[#1F2937] bg-[#0B0F14] hover:border-[#374151]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[13px] font-semibold text-white">{profile.name}</p>
                    <p className="mt-1 text-[11px] text-[#6B7280]">{profile.targetRoles.join(", ") || "No target roles yet"}</p>
                  </div>
                  {profile.isDefault && (
                    <span className="rounded-full border border-[#22C55E]/30 bg-[#22C55E]/10 px-2 py-0.5 text-[10px] font-medium text-[#22C55E]">
                      Default
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      <div className="space-y-6">
        <Card className="border-[#1F2937] bg-[#111827] p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[18px] font-semibold text-white">Structured Master Resume Builder</h2>
              <p className="text-[12px] text-[#6B7280]">
                This is the structured career intelligence layer the platform uses for job scoping and tailoring.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={handleGenerateSummary}
                disabled={!selectedProfile || summaryLoading}
                className="border-[#374151] bg-[#1F2937] text-white hover:bg-[#374151]"
              >
                {summaryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate Summary
              </Button>
              {selectedProfile && (
                <Button
                  variant="outline"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="border-[#7F1D1D] bg-[#7F1D1D]/10 text-[#FCA5A5] hover:bg-[#7F1D1D]/20"
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Delete
                </Button>
              )}
              <Button onClick={handleSave} disabled={saving} className="bg-[#4F8CFF] text-white hover:bg-[#4F8CFF]/90">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookmarkCheck className="h-4 w-4" />}
                Save Profile
              </Button>
            </div>
          </div>

          {(error || saveMessage) && (
            <div className={`mb-4 rounded-lg border px-4 py-3 text-[13px] ${error ? "border-[#7F1D1D] bg-[#7F1D1D]/10 text-[#FCA5A5]" : "border-[#14532D] bg-[#14532D]/10 text-[#86EFAC]"}`}>
              {error || saveMessage}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Profile Name</Label>
              <Input
                value={draft.name}
                onChange={(event) => updateDraft("name", event.target.value)}
                className="border-[#1F2937] bg-[#0B0F14] text-white"
              />
            </div>
            <div>
              <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Experience Years</Label>
              <Input
                type="number"
                value={draft.experienceYears ?? 0}
                onChange={(event) => updateDraft("experienceYears", Number(event.target.value))}
                className="border-[#1F2937] bg-[#0B0F14] text-white"
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-lg border border-[#1F2937] bg-[#0B0F14] px-4 py-3">
            <div>
              <p className="text-[13px] font-medium text-white">Use as default profile</p>
              <p className="text-[11px] text-[#6B7280]">Default profile feeds the rest of the platform when a job needs a master resume context.</p>
            </div>
            <Switch checked={Boolean(draft.isDefault)} onCheckedChange={(value) => updateDraft("isDefault", value)} />
          </div>

          <div className="mt-4">
            <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Target Roles</Label>
            <TagInput tags={draft.targetRoles} onChange={(tags) => updateDraft("targetRoles", tags)} placeholder="Technical PM, SEO Manager…" />
          </div>

          <div className="mt-4">
            <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Summary</Label>
            <Textarea
              value={draft.summary ?? ""}
              onChange={(event) => updateDraft("summary", event.target.value)}
              rows={5}
              className="border-[#1F2937] bg-[#0B0F14] text-white"
              placeholder="Capture the core narrative this profile should represent."
            />
          </div>
        </Card>

        <Card className="border-[#1F2937] bg-[#111827] p-5">
          <h3 className="mb-4 text-[16px] font-semibold text-white">Skills</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Core Skills</Label>
              <TagInput tags={draft.skills.core} onChange={(tags) => updateDraft("skills", { ...draft.skills, core: tags })} />
            </div>
            <div>
              <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Tools</Label>
              <TagInput tags={draft.skills.tools} onChange={(tags) => updateDraft("skills", { ...draft.skills, tools: tags })} />
            </div>
            <div>
              <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Soft Skills</Label>
              <TagInput tags={draft.skills.soft} onChange={(tags) => updateDraft("skills", { ...draft.skills, soft: tags })} />
            </div>
            <div>
              <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Certifications</Label>
              <TagInput tags={draft.skills.certifications} onChange={(tags) => updateDraft("skills", { ...draft.skills, certifications: tags })} />
            </div>
          </div>
        </Card>

        <Card className="border-[#1F2937] bg-[#111827] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[16px] font-semibold text-white">Experience Builder</h3>
            <Button
              variant="outline"
              onClick={() => updateDraft("experiences", [...draft.experiences, emptyExperience()])}
              className="border-[#374151] bg-[#1F2937] text-white hover:bg-[#374151]"
            >
              <Plus className="h-4 w-4" />
              Add Experience
            </Button>
          </div>

          <div className="space-y-4">
            {draft.experiences.map((experience, experienceIndex) => (
              <div key={`experience-${experienceIndex}`} className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h4 className="text-[14px] font-semibold text-white">Experience {experienceIndex + 1}</h4>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleGenerateBullets(experienceIndex)}
                      className="border-[#374151] bg-[#111827] text-white hover:bg-[#1F2937]"
                    >
                      {bulletLoadingKey === `experience-${experienceIndex}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                      Generate Bullets
                    </Button>
                    {draft.experiences.length > 1 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateDraft("experiences", draft.experiences.filter((_, index) => index !== experienceIndex))}
                        className="border-[#7F1D1D] bg-[#7F1D1D]/10 text-[#FCA5A5] hover:bg-[#7F1D1D]/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Title</Label>
                    <Input value={experience.title} onChange={(event) => updateExperience(experienceIndex, { title: event.target.value })} className="border-[#1F2937] bg-[#111827] text-white" />
                  </div>
                  <div>
                    <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Company</Label>
                    <Input value={experience.company} onChange={(event) => updateExperience(experienceIndex, { company: event.target.value })} className="border-[#1F2937] bg-[#111827] text-white" />
                  </div>
                  <div>
                    <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Start Date</Label>
                    <Input type="date" value={experience.startDate ?? ""} onChange={(event) => updateExperience(experienceIndex, { startDate: event.target.value })} className="border-[#1F2937] bg-[#111827] text-white" />
                  </div>
                  <div>
                    <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">End Date</Label>
                    <Input type="date" value={experience.endDate ?? ""} onChange={(event) => updateExperience(experienceIndex, { endDate: event.target.value })} className="border-[#1F2937] bg-[#111827] text-white" />
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {experience.bullets.map((bullet, bulletIndex) => (
                    <div key={`bullet-${experienceIndex}-${bulletIndex}`} className="rounded-lg border border-[#1F2937] bg-[#111827] p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-[12px] font-semibold uppercase tracking-wide text-[#9CA3AF]">Bullet {bulletIndex + 1}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => updateExperience(experienceIndex, { bullets: experience.bullets.filter((_, index) => index !== bulletIndex) })}
                          className="text-[#9CA3AF] hover:text-white"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="md:col-span-2">
                          <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Source Note</Label>
                          <Textarea value={bullet.originalText ?? ""} onChange={(event) => updateBullet(experienceIndex, bulletIndex, { originalText: event.target.value })} rows={2} className="border-[#1F2937] bg-[#0B0F14] text-white" />
                        </div>
                        <div>
                          <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Action</Label>
                          <Input value={bullet.action ?? ""} onChange={(event) => updateBullet(experienceIndex, bulletIndex, { action: event.target.value })} className="border-[#1F2937] bg-[#0B0F14] text-white" />
                        </div>
                        <div>
                          <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Metric</Label>
                          <Input value={bullet.metric ?? ""} onChange={(event) => updateBullet(experienceIndex, bulletIndex, { metric: event.target.value })} className="border-[#1F2937] bg-[#0B0F14] text-white" />
                        </div>
                        <div>
                          <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Method</Label>
                          <Textarea value={bullet.method ?? ""} onChange={(event) => updateBullet(experienceIndex, bulletIndex, { method: event.target.value })} rows={2} className="border-[#1F2937] bg-[#0B0F14] text-white" />
                        </div>
                        <div>
                          <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Result</Label>
                          <Textarea value={bullet.result ?? ""} onChange={(event) => updateBullet(experienceIndex, bulletIndex, { result: event.target.value })} rows={2} className="border-[#1F2937] bg-[#0B0F14] text-white" />
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Tools</Label>
                          <TagInput tags={bullet.tools ?? []} onChange={(tags) => updateBullet(experienceIndex, bulletIndex, { tools: tags })} />
                        </div>
                        <div>
                          <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Keywords</Label>
                          <TagInput tags={bullet.keywords ?? []} onChange={(tags) => updateBullet(experienceIndex, bulletIndex, { keywords: tags })} />
                        </div>
                      </div>
                    </div>
                  ))}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateExperience(experienceIndex, { bullets: [...experience.bullets, emptyBullet()] })}
                    className="border-[#374151] bg-[#111827] text-white hover:bg-[#1F2937]"
                  >
                    <Plus className="h-4 w-4" />
                    Add Bullet
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border-[#1F2937] bg-[#111827] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[16px] font-semibold text-white">Projects & Leadership</h3>
            <Button
              variant="outline"
              onClick={() => updateDraft("projects", [...draft.projects, emptyProject()])}
              className="border-[#374151] bg-[#1F2937] text-white hover:bg-[#374151]"
            >
              <Plus className="h-4 w-4" />
              Add Project
            </Button>
          </div>

          <div className="space-y-4">
            {draft.projects.map((project, index) => (
              <div key={`project-${index}`} className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-[14px] font-semibold text-white">Project {index + 1}</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateDraft("projects", draft.projects.filter((_, projectIndex) => projectIndex !== index))}
                    className="text-[#9CA3AF] hover:text-white"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Input value={project.name} onChange={(event) => updateProject(index, { name: event.target.value })} className="border-[#1F2937] bg-[#111827] text-white" placeholder="Project name" />
                  <Input value={project.role ?? ""} onChange={(event) => updateProject(index, { role: event.target.value })} className="border-[#1F2937] bg-[#111827] text-white" placeholder="Role" />
                  <Textarea value={project.description ?? ""} onChange={(event) => updateProject(index, { description: event.target.value })} rows={3} className="border-[#1F2937] bg-[#111827] text-white md:col-span-2" placeholder="Description" />
                  <Input type="number" value={project.teamSize ?? ""} onChange={(event) => updateProject(index, { teamSize: event.target.value ? Number(event.target.value) : null })} className="border-[#1F2937] bg-[#111827] text-white" placeholder="Team size" />
                  <Input value={project.metrics ?? ""} onChange={(event) => updateProject(index, { metrics: event.target.value })} className="border-[#1F2937] bg-[#111827] text-white" placeholder="Metrics / quantified impact" />
                  <Textarea value={project.outcome ?? ""} onChange={(event) => updateProject(index, { outcome: event.target.value })} rows={2} className="border-[#1F2937] bg-[#111827] text-white md:col-span-2" placeholder="Outcome" />
                  <div className="md:col-span-2">
                    <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Tools</Label>
                    <TagInput tags={project.tools ?? []} onChange={(tags) => updateProject(index, { tools: tags })} />
                  </div>
                </div>
              </div>
            ))}

            <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
              <h4 className="mb-3 text-[14px] font-semibold text-white">Leadership</h4>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Input type="number" value={draft.leadership?.teamSize ?? ""} onChange={(event) => updateDraft("leadership", { ...(draft.leadership ?? emptyLeadership()), teamSize: event.target.value ? Number(event.target.value) : null })} className="border-[#1F2937] bg-[#111827] text-white" placeholder="Team size" />
                <Input value={draft.leadership?.budget ?? ""} onChange={(event) => updateDraft("leadership", { ...(draft.leadership ?? emptyLeadership()), budget: event.target.value })} className="border-[#1F2937] bg-[#111827] text-white" placeholder="Budget ownership" />
                <Textarea value={draft.leadership?.scope ?? ""} onChange={(event) => updateDraft("leadership", { ...(draft.leadership ?? emptyLeadership()), scope: event.target.value })} rows={3} className="border-[#1F2937] bg-[#111827] text-white md:col-span-2" placeholder="Leadership scope" />
                <div className="md:col-span-2">
                  <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Stakeholders</Label>
                  <TagInput tags={draft.leadership?.stakeholders ?? []} onChange={(tags) => updateDraft("leadership", { ...(draft.leadership ?? emptyLeadership()), stakeholders: tags })} />
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="border-[#1F2937] bg-[#111827] p-5">
          <h3 className="mb-2 text-[16px] font-semibold text-white">Resume Score Panel</h3>
          <p className="mb-4 text-[12px] text-[#6B7280]">
            Score the selected master profile against a job description to see ATS fit, impact, completeness, and MQ coverage.
          </p>
          <div className="space-y-3">
            <Input value={scoreInput.jobTitle} onChange={(event) => setScoreInput((current) => ({ ...current, jobTitle: event.target.value }))} className="border-[#1F2937] bg-[#0B0F14] text-white" placeholder="Target job title (optional)" />
            <Textarea value={scoreInput.jobDescription} onChange={(event) => setScoreInput((current) => ({ ...current, jobDescription: event.target.value }))} rows={8} className="border-[#1F2937] bg-[#0B0F14] text-white" placeholder="Paste the job description here to score this profile." />
            <Button onClick={handleScoreResume} disabled={scoring || !selectedProfile} className="w-full bg-[#4F8CFF] text-white hover:bg-[#4F8CFF]/90">
              {scoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Score Resume
            </Button>
          </div>
        </Card>

        {scoreResult && (
          <Card className="border-[#1F2937] bg-[#111827] p-5">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "ATS", value: scoreResult.atsScore, color: "#4F8CFF" },
                { label: "Impact", value: scoreResult.impactScore, color: "#22C55E" },
                { label: "Complete", value: scoreResult.completenessScore, color: "#8B5CF6" },
                { label: "MQ Match", value: scoreResult.mqMatch.matchScore, color: "#F59E0B" },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-3 text-center">
                  <p className="text-[11px] uppercase tracking-wide text-[#6B7280]">{item.label}</p>
                  <p className="mt-1 text-[24px] font-semibold" style={{ color: item.color }}>
                    {item.value}%
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#22C55E]">Matched Skills</p>
                <div className="flex flex-wrap gap-2">
                  {scoreResult.mqMatch.matchedSkills.length > 0 ? scoreResult.mqMatch.matchedSkills.map((skill) => (
                    <span key={skill} className="rounded-full border border-[#22C55E]/30 bg-[#22C55E]/10 px-2 py-1 text-[11px] text-[#86EFAC]">
                      {skill}
                    </span>
                  )) : <span className="text-[12px] text-[#6B7280]">No matched skills yet.</span>}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#F59E0B]">Missing Skills</p>
                <div className="flex flex-wrap gap-2">
                  {scoreResult.mqMatch.missingSkills.length > 0 ? scoreResult.mqMatch.missingSkills.map((skill) => (
                    <span key={skill} className="rounded-full border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-2 py-1 text-[11px] text-[#FCD34D]">
                      {skill}
                    </span>
                  )) : <span className="text-[12px] text-[#6B7280]">No major MQ gaps detected.</span>}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#9CA3AF]">Suggestions</p>
                <div className="space-y-2">
                  {scoreResult.suggestions.map((suggestion) => (
                    <div key={suggestion} className="rounded-lg border border-[#1F2937] bg-[#0B0F14] px-3 py-2 text-[13px] text-[#D1D5DB]">
                      {suggestion}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}

        <Card className="border-[#1F2937] bg-[#111827] p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-[#F59E0B]" />
            <div>
              <h4 className="text-[14px] font-semibold text-white">How this merges with the current system</h4>
              <p className="mt-1 text-[12px] leading-relaxed text-[#9CA3AF]">
                The default master resume profile now acts as the structured context layer for AI scoring and tailored resume generation elsewhere in the platform.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
