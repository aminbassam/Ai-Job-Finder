import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  BookmarkCheck,
  Edit3,
  Eye,
  LayoutList,
  Loader2,
  Plus,
  Power,
  Sparkles,
  TableProperties,
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
import { JobTitleTagInput } from "../../components/ui/job-title-tag-input";
import { RichTextEditor } from "../../components/ui/rich-text-editor";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import {
  masterResumeService,
  MasterResumeBullet,
  MasterResumeCustomSection,
  MasterResumeEducation,
  MasterResumeExperience,
  MasterResumeProfile,
  MasterResumeProfileInput,
  ResumeScoreResult,
} from "../../services/masterResume.service";
import { ResumePreferencesTab } from "../settings/ResumePreferencesTab";
import { settingsService } from "../../services/settings.service";

interface ProfilesWorkspaceProps {
  refreshKey?: number;
  focusProfileId?: string | null;
  onAddProfile?: () => void;
}

const DEFAULT_PROFILE_NAME = "New Profile";

function emptyBullet(): MasterResumeBullet {
  return { description: "", tools: [], keywords: [] };
}

function emptyCustomSection(): MasterResumeCustomSection {
  return { name: "", description: "", tools: [], keywords: [] };
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

// kept for backward-compat with toInput() which still preserves legacy project/leadership data
function emptyLeadershipLegacy() {
  return { teamSize: null, scope: "", stakeholders: [], budget: "" };
}

function emptyEducation(): MasterResumeEducation {
  return {
    school: "",
    degree: "",
    fieldOfStudy: "",
    startDate: "",
    endDate: "",
    notes: "",
  };
}

function emptyProfileInput(name = DEFAULT_PROFILE_NAME): MasterResumeProfileInput {
  return {
    sourceImportId: null,
    name,
    targetRoles: [],
    summary: "",
    experienceYears: 0,
    isActive: true,
    useForAi: true,
    isDefault: false,
    experiences: [emptyExperience()],
    skills: {
      core: [],
      tools: [],
      soft: [],
      certifications: [],
    },
    education: [],
    projects: [],
    leadership: emptyLeadershipLegacy(),
    customSections: [],
  };
}

function toInput(profile: MasterResumeProfile): MasterResumeProfileInput {
  return {
    sourceImportId: profile.sourceImportId ?? null,
    name: profile.name,
    targetRoles: profile.targetRoles,
    summary: profile.summary ?? "",
    experienceYears: profile.experienceYears,
    isActive: profile.isActive,
    useForAi: profile.useForAi,
    isDefault: profile.isDefault,
    experiences: profile.experiences.length > 0 ? profile.experiences : [emptyExperience()],
    skills: profile.skills,
    education: profile.education ?? [],
    projects: profile.projects,
    leadership: profile.leadership ?? emptyLeadershipLegacy(),
    customSections: profile.customSections ?? [],
  };
}

function metricLike(text: string): boolean {
  return /(\d+[%xkmb]?|\$[\d,.]+|percent|revenue|growth|reduced|increased|saved|improved|launched|users|customers)/i.test(text);
}

function formatDateTime(value?: string | null): string {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function computeProfileHealth(profile: MasterResumeProfile) {
  const bullets = profile.experiences.flatMap((experience) => experience.bullets ?? []);
  const certificateCount = profile.skills.certifications?.length ?? 0;
  const educationCount = profile.education?.length ?? 0;
  const impactBullets = bullets.filter((bullet) =>
    metricLike([
      bullet.description,
      ...(bullet.tools ?? []),
      ...(bullet.keywords ?? []),
    ]
      .filter(Boolean)
      .join(" "))
  );

  const completenessChecks = [
    Boolean(profile.summary && profile.summary.trim().length >= 60),
    profile.targetRoles.length > 0,
    profile.experienceYears > 0,
    profile.experiences.length > 0,
    bullets.length >= 3,
    ((profile.skills.core?.length ?? 0) + (profile.skills.tools?.length ?? 0)) >= 5,
    educationCount > 0,
    certificateCount > 0,
    (profile.customSections?.length ?? 0) > 0,
  ];

  const completeness = Math.round((completenessChecks.filter(Boolean).length / completenessChecks.length) * 100);
  const impact = bullets.length > 0 ? Math.round((impactBullets.length / bullets.length) * 100) : 0;
  const readiness = Math.round((completeness * 0.65) + (impact * 0.35));
  const strengths: string[] = [];
  const gaps: string[] = [];

  if (profile.summary && profile.summary.trim().length >= 60) strengths.push("Strong summary context");
  else gaps.push("Add a richer summary so AI has better positioning context.");

  if (profile.targetRoles.length > 0) strengths.push("Target roles are clearly defined");
  else gaps.push("Add target roles so AI can tailor resumes more precisely.");

  if (((profile.skills.core?.length ?? 0) + (profile.skills.tools?.length ?? 0)) >= 5) strengths.push("Skill coverage is broad enough for tailoring");
  else gaps.push("Add more core skills and tools to improve keyword coverage.");

  if (educationCount > 0) strengths.push("Education credentials are captured");
  else gaps.push("Add education so resumes include academic credibility.");

  if (certificateCount > 0) strengths.push("Certificates strengthen qualification signals");
  else gaps.push("Add certificates or training credentials if they support your target roles.");

  if (impactBullets.length >= 2) strengths.push("Impact bullets already include measurable outcomes");
  else gaps.push("Add quantified results to more experience bullets.");

  if ((profile.customSections?.length ?? 0) > 0) strengths.push("Extra sections provide additional context");
  else gaps.push("Add custom sections (Awards, Publications, etc.) to strengthen your profile.");

  return {
    readiness,
    completeness,
    impact,
    bulletCount: bullets.length,
    strengths,
    gaps,
  };
}

export function ProfilesWorkspace({ refreshKey = 0, focusProfileId = null, onAddProfile }: ProfilesWorkspaceProps) {
  const [profiles, setProfiles] = useState<MasterResumeProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<"none" | "profile" | "legacy">("none");
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
  const [statusLoadingId, setStatusLoadingId] = useState<string | null>(null);
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);
  const [legacyAiLoading, setLegacyAiLoading] = useState(false);
  const [legacyAiSource, setLegacyAiSource] = useState(false);
  const [editorMode, setEditorMode] = useState<"view" | "edit">("edit");
  const [profileScoreView, setProfileScoreView] = useState<"table" | "list">("table");

  async function loadProfiles(preferredId?: string | null) {
    setLoading(true);
    setError(null);
    try {
      const [next, prefs] = await Promise.all([
        masterResumeService.listProfiles(),
        settingsService.getPreferences().catch(() => ({})),
      ]);
      setProfiles(next);
      setLegacyAiSource(Boolean(prefs.useLegacyResumePreferencesForAi));

      if (next.length === 0) {
        setSelectedId(null);
        setSelectedSection("none");
        setDraft(emptyProfileInput());
      } else {
        const requestedId = preferredId ?? (selectedSection === "profile" ? selectedId : null);
        const target = requestedId ? next.find((profile) => profile.id === requestedId) ?? null : null;

        if (target) {
          setSelectedId(target.id);
          setSelectedSection("profile");
          setDraft(toInput(target));
        } else if (selectedSection === "legacy") {
          setSelectedId(null);
          setSelectedSection("legacy");
          setDraft(emptyProfileInput());
        } else {
          setSelectedId(null);
          setSelectedSection("none");
          setDraft(emptyProfileInput());
        }
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
  const profileScores = useMemo(
    () => profiles.map((profile) => ({ profile, score: computeProfileHealth(profile) })),
    [profiles]
  );
  const hasStructuredProfiles = profiles.length > 0;
  const selectedProfileHealth = useMemo(
    () => (selectedProfile ? computeProfileHealth(selectedProfile) : null),
    [selectedProfile]
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

  function updateCustomSection(index: number, patch: Partial<MasterResumeCustomSection>) {
    setDraft((current) => ({
      ...current,
      customSections: (current.customSections ?? []).map((section, sectionIndex) =>
        sectionIndex === index ? { ...section, ...patch } : section
      ),
    }));
  }

  function updateEducation(index: number, patch: Partial<MasterResumeEducation>) {
    setDraft((current) => ({
      ...current,
      education: current.education.map((entry, educationIndex) =>
        educationIndex === index ? { ...entry, ...patch } : entry
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
      setEditorMode("edit");
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

  async function handleDeleteProfile(profile: MasterResumeProfile) {
    const confirmed = window.confirm(`Delete "${profile.name}"?`);
    if (!confirmed) return;

    setDeleting(true);
    setError(null);
    try {
      await masterResumeService.deleteProfile(profile.id);
      if (selectedId === profile.id) {
        backToList();
      }
      await loadProfiles(selectedId === profile.id ? null : selectedId);
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
        rawBullets: experience.bullets.map((bullet) => bullet.description || "").filter(Boolean),
      });

      updateExperience(experienceIndex, {
        bullets: result.bullets.length > 0
          ? result.bullets.map((bullet) => ({
              description: (bullet as MasterResumeBullet).description ?? "",
              tools: bullet.tools ?? [],
              keywords: bullet.keywords ?? [],
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

  async function handleToggleUseForAi(profile: MasterResumeProfile) {
    setAiLoadingId(profile.id);
    setError(null);
    setSaveMessage(null);
    try {
      const nextUseForAi = !profile.useForAi;
      await masterResumeService.updateProfile(profile.id, {
        ...toInput(profile),
        useForAi: nextUseForAi,
      });
      setSaveMessage(
        nextUseForAi
          ? `"${profile.name}" is now available for AI resume generation.`
          : `"${profile.name}" is no longer available for AI resume generation.`
      );
      await loadProfiles(profile.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update AI resume availability.");
    } finally {
      setAiLoadingId(null);
    }
  }

  async function handleToggleActive(profile: MasterResumeProfile) {
    setStatusLoadingId(profile.id);
    setError(null);
    setSaveMessage(null);
    try {
      const nextIsActive = !profile.isActive;
      await masterResumeService.updateProfile(profile.id, {
        ...toInput(profile),
        isActive: nextIsActive,
        isDefault: nextIsActive ? profile.isDefault : false,
      });
      setSaveMessage(
        nextIsActive
          ? `"${profile.name}" is now active and available for AI resume generation.`
          : `"${profile.name}" is now inactive and will not be used by AI flows.`
      );
      await loadProfiles(profile.id === selectedId ? profile.id : selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile status.");
    } finally {
      setStatusLoadingId(null);
    }
  }

  async function handleToggleLegacyAiSource() {
    setLegacyAiLoading(true);
    setError(null);
    setSaveMessage(null);
    try {
      await settingsService.updatePreferences({
        useLegacyResumePreferencesForAi: !legacyAiSource,
      });
      const next = !legacyAiSource;
      setLegacyAiSource(next);
      setSaveMessage(
        next
          ? "Legacy Preferences is now available for AI resume generation."
          : "Legacy Preferences has been removed from AI resume generation."
      );
      await loadProfiles(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update Legacy Preferences AI availability.");
    } finally {
      setLegacyAiLoading(false);
    }
  }

  function openProfile(profile: MasterResumeProfile, mode: "view" | "edit") {
    setSelectedSection("profile");
    setSelectedId(profile.id);
    setDraft(toInput(profile));
    setSaveMessage(null);
    setEditorMode(mode);
    setScoreResult(null);
  }

  function openLegacyPreferences() {
    setSelectedSection("legacy");
    setSelectedId(null);
    setSaveMessage(null);
    setError(null);
    setScoreResult(null);
    setEditorMode("view");
  }

  function backToList() {
    setSelectedSection("none");
    setSelectedId(null);
    setScoreResult(null);
    setSaveMessage(null);
    setError(null);
    setEditorMode("edit");
  }

  return (
    <div className="space-y-6">
      {selectedSection === "none" ? (
      <Card className="border-[#1F2937] bg-[#111827] p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold text-white">Resume Profiles</h2>
            <p className="text-[12px] text-[#6B7280]">View all profiles, manage status, and control which ones AI can use during resume generation.</p>
          </div>
          {onAddProfile && (
            <Button
              size="sm"
              onClick={onAddProfile}
              className="bg-[#4F8CFF] text-white hover:bg-[#4F8CFF]/90"
            >
              Add Resume Profile
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[#4F8CFF]" />
          </div>
        ) : (
          <div className="space-y-4">
            {!hasStructuredProfiles && (
              <div className="rounded-lg border border-dashed border-[#1F2937] bg-[#0B0F14] p-4">
                <p className="text-[13px] text-[#9CA3AF]">
                  No saved structured resume profiles yet. Add one manually or import one from LinkedIn or PDF.
                </p>
                {onAddProfile && (
                  <Button
                    size="sm"
                    onClick={onAddProfile}
                    className="mt-3 bg-[#4F8CFF] text-white hover:bg-[#4F8CFF]/90"
                  >
                    Add Resume Profile
                  </Button>
                )}
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow className="border-[#1F2937] hover:bg-transparent">
                  <TableHead className="h-12 text-[#9CA3AF]">Profile</TableHead>
                  <TableHead className="h-12 text-[#9CA3AF]">Readiness</TableHead>
                  <TableHead className="h-12 text-[#9CA3AF]">Status</TableHead>
                  <TableHead className="h-12 text-[#9CA3AF]">AI Resume</TableHead>
                  <TableHead className="h-12 text-[#9CA3AF]">Added</TableHead>
                  <TableHead className="h-12 text-[#9CA3AF]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className={`border-[#1F2937] ${selectedSection === "legacy" ? "bg-[#0B1730]" : "hover:bg-[#0B0F14]"}`}>
                  <TableCell className="whitespace-normal align-top">
                    <p className="font-semibold text-white">Legacy Preferences</p>
                    <p className="mt-1 text-[12px] text-[#6B7280]">
                      Compatibility profile for the older resume workflow and fallback preference controls.
                    </p>
                  </TableCell>
                  <TableCell className="align-top">
                    <span className="rounded-full border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-2 py-1 text-[11px] text-[#FCD34D]">
                      Legacy
                    </span>
                  </TableCell>
                  <TableCell className="align-top">
                    <span className="rounded-full border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-2 py-1 text-[11px] text-[#FCD34D]">
                      System
                    </span>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex items-center gap-3">
                      <Switch checked={legacyAiSource} onCheckedChange={() => void handleToggleLegacyAiSource()} disabled={legacyAiLoading} />
                      <span className="text-[12px] text-[#D1D5DB]">{legacyAiSource ? "Enabled" : "Disabled"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="align-top text-[13px] text-[#D1D5DB]">Legacy</TableCell>
                  <TableCell className="min-w-[220px] whitespace-normal align-top">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={openLegacyPreferences}
                        className="border-[#374151] bg-[#111827] text-white hover:bg-[#1F2937]"
                      >
                        <Eye className="h-4 w-4" />
                        View
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={openLegacyPreferences}
                        className="border-[#374151] bg-[#111827] text-white hover:bg-[#1F2937]"
                      >
                        <Edit3 className="h-4 w-4" />
                        Edit
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>

                {profileScores.map(({ profile, score }) => (
                  <TableRow key={profile.id} className={`border-[#1F2937] ${selectedSection === "profile" && selectedId === profile.id ? "bg-[#0B1730]" : "hover:bg-[#0B0F14]"}`}>
                    <TableCell className="whitespace-normal align-top">
                      <p className="font-semibold text-white">{profile.name}</p>
                      <p className="mt-1 text-[12px] text-[#6B7280]">
                        {profile.targetRoles.join(", ") || "No target roles yet"}
                      </p>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="min-w-[110px]">
                        <p className="text-[18px] font-semibold text-white">{score.readiness}%</p>
                        <p className="text-[11px] text-[#6B7280]">
                          {score.completeness}% complete · {score.impact}% impact
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <span className={`rounded-full border px-2 py-1 text-[11px] ${
                        profile.isActive
                          ? "border-[#22C55E]/30 bg-[#22C55E]/10 text-[#86EFAC]"
                          : "border-[#6B7280]/30 bg-[#111827] text-[#9CA3AF]"
                      }`}>
                        {profile.isActive ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={profile.useForAi}
                          onCheckedChange={() => void handleToggleUseForAi(profile)}
                          disabled={!profile.isActive || aiLoadingId === profile.id}
                        />
                        <span className="text-[12px] text-[#D1D5DB]">
                          {profile.useForAi ? "Enabled" : "Disabled"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="align-top whitespace-normal">
                      <div className="space-y-1 text-[11px] text-[#9CA3AF]">
                        <p className="font-medium text-white">{formatDateTime(profile.createdAt)}</p>
                        <p>Updated {formatDateTime(profile.updatedAt)}</p>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[280px] whitespace-normal align-top">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openProfile(profile, "view")}
                          className="border-[#374151] bg-[#111827] text-white hover:bg-[#1F2937]"
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openProfile(profile, "edit")}
                          className="border-[#374151] bg-[#111827] text-white hover:bg-[#1F2937]"
                        >
                          <Edit3 className="h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleToggleActive(profile)}
                          disabled={statusLoadingId === profile.id}
                          className="border-[#374151] bg-[#111827] text-white hover:bg-[#1F2937]"
                        >
                          {statusLoadingId === profile.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                          {profile.isActive ? "Deactivate" : "Activate"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleDeleteProfile(profile)}
                          disabled={deleting}
                          className="border-[#7F1D1D] bg-[#7F1D1D]/10 text-[#FCA5A5] hover:bg-[#7F1D1D]/20"
                        >
                          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
      ) : (
      <Card className="border-[#1F2937] bg-[#111827] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold text-white">
              {selectedSection === "legacy" ? "Legacy Preferences Profile" : selectedProfile?.name ?? "Resume Profile"}
            </h2>
            <p className="text-[12px] text-[#6B7280]">
              {selectedSection === "legacy"
                ? "Compatibility preferences for the older resume workflow."
                : editorMode === "view"
                  ? "Read-only profile detail view."
                  : "Edit the selected profile and save changes from this detail view."}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={backToList}
            className="border-[#374151] bg-[#111827] text-white hover:bg-[#1F2937]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to List
          </Button>
        </div>
      </Card>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr,360px]">
      <div className="space-y-6">
        {selectedSection === "legacy" ? (
          <div className="space-y-4">
            <Card className="border-[#1F2937] bg-[#111827] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-[18px] font-semibold text-white">Legacy Preferences Profile</h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-[#9CA3AF]">
                    These compatibility preferences remain available inside the Master Resume workspace. Structured resume profiles above are preferred for top-quality AI resume generation, but these settings can still be made available as an AI resume source for older flows.
                  </p>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-[#1F2937] bg-[#0B0F14] px-4 py-3">
                  <div>
                    <p className="text-[13px] font-medium text-white">Use in AI resume generation</p>
                    <p className="text-[11px] text-[#6B7280]">Legacy Preferences can be selected alongside structured profiles.</p>
                  </div>
                  <Switch checked={legacyAiSource} onCheckedChange={() => void handleToggleLegacyAiSource()} disabled={legacyAiLoading} />
                </div>
              </div>
            </Card>
            <ResumePreferencesTab />
          </div>
        ) : selectedSection === "none" ? null : (
        <Card className="border-[#1F2937] bg-[#111827] p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[18px] font-semibold text-white">
                {editorMode === "view" ? "Resume Profile Details" : "Edit Resume Profile"}
              </h2>
              <p className="text-[12px] text-[#6B7280]">
                {selectedProfile
                  ? `You are ${editorMode === "view" ? "viewing" : "editing"} "${selectedProfile.name}".`
                  : "Select a profile from the table above to view or edit it."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={handleGenerateSummary}
                disabled={!selectedProfile || summaryLoading || editorMode === "view"}
                className="border-[#374151] bg-[#1F2937] text-white hover:bg-[#374151]"
              >
                {summaryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate Summary
              </Button>
              {selectedProfile && (
                <Button
                  variant="outline"
                  onClick={handleDelete}
                  disabled={deleting || editorMode === "view"}
                  className="border-[#7F1D1D] bg-[#7F1D1D]/10 text-[#FCA5A5] hover:bg-[#7F1D1D]/20"
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Delete
                </Button>
              )}
              <Button onClick={handleSave} disabled={saving || editorMode === "view"} className="bg-[#4F8CFF] text-white hover:bg-[#4F8CFF]/90">
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

          <fieldset disabled={editorMode === "view"} className="space-y-0 disabled:opacity-90">
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

          <div className="mt-4">
            <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Target Roles</Label>
            <JobTitleTagInput
              tags={draft.targetRoles}
              onChange={(tags) => updateDraft("targetRoles", tags)}
              placeholder="Search from a full job title catalog…"
            />
          </div>

          <div className="mt-4">
            <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Professional Summary</Label>
            <Textarea
              value={draft.summary ?? ""}
              onChange={(event) => updateDraft("summary", event.target.value)}
              rows={5}
              className="border-[#1F2937] bg-[#0B0F14] text-white"
              placeholder="Capture the senior-level positioning, domain strengths, and value proposition this profile should represent."
            />
          </div>
          </fieldset>
        </Card>
        )}

        {selectedSection === "profile" && (
        <fieldset disabled={editorMode === "view"} className="space-y-6 disabled:opacity-90">
        <Card className="border-[#1F2937] bg-[#111827] p-5">
          <h3 className="mb-4 text-[16px] font-semibold text-white">Core Skills</h3>
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
          </div>
        </Card>

        <Card className="border-[#1F2937] bg-[#111827] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-[16px] font-semibold text-white">Education & Certificates</h3>
              <p className="mt-1 text-[12px] text-[#6B7280]">
                Capture education history and training so AI can reflect the same structure as your preferred resumes.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => updateDraft("education", [...draft.education, emptyEducation()])}
              className="border-[#374151] bg-[#1F2937] text-white hover:bg-[#374151]"
            >
              <Plus className="h-4 w-4" />
              Add Education
            </Button>
          </div>

          <div className="space-y-4">
            <div>
              <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Certificates</Label>
              <TagInput tags={draft.skills.certifications} onChange={(tags) => updateDraft("skills", { ...draft.skills, certifications: tags })} />
            </div>

            {draft.education.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#1F2937] bg-[#0B0F14] p-4 text-[13px] text-[#6B7280]">
                Add education entries to match the summary, education, and certification flow from your preferred resume format.
              </div>
            ) : (
              draft.education.map((education, index) => (
                <div key={`education-${index}`} className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-[14px] font-semibold text-white">Education {index + 1}</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => updateDraft("education", draft.education.filter((_, educationIndex) => educationIndex !== index))}
                      className="text-[#9CA3AF] hover:text-white"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Input
                      value={education.school}
                      onChange={(event) => updateEducation(index, { school: event.target.value })}
                      className="border-[#1F2937] bg-[#111827] text-white"
                      placeholder="School or university"
                    />
                    <Input
                      value={education.degree ?? ""}
                      onChange={(event) => updateEducation(index, { degree: event.target.value })}
                      className="border-[#1F2937] bg-[#111827] text-white"
                      placeholder="Degree or certification"
                    />
                    <Input
                      value={education.fieldOfStudy ?? ""}
                      onChange={(event) => updateEducation(index, { fieldOfStudy: event.target.value })}
                      className="border-[#1F2937] bg-[#111827] text-white"
                      placeholder="Field of study"
                    />
                    <Input
                      value={education.notes ?? ""}
                      onChange={(event) => updateEducation(index, { notes: event.target.value })}
                      className="border-[#1F2937] bg-[#111827] text-white"
                      placeholder="Notes, honors, or training details"
                    />
                    <div>
                      <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Start Date</Label>
                      <Input
                        type="date"
                        value={education.startDate ?? ""}
                        onChange={(event) => updateEducation(index, { startDate: event.target.value })}
                        className="border-[#1F2937] bg-[#111827] text-white"
                      />
                    </div>
                    <div>
                      <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">End Date</Label>
                      <Input
                        type="date"
                        value={education.endDate ?? ""}
                        onChange={(event) => updateEducation(index, { endDate: event.target.value })}
                        className="border-[#1F2937] bg-[#111827] text-white"
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="border-[#1F2937] bg-[#111827] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[16px] font-semibold text-white">Professional Experience</h3>
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
                  <h4 className="text-[14px] font-semibold text-white">{experience.title.trim() || `Experience ${experienceIndex + 1}`}</h4>
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
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-[12px] font-semibold uppercase tracking-wide text-[#9CA3AF]">Entry {bulletIndex + 1}</p>
                        {experience.bullets.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateExperience(experienceIndex, { bullets: experience.bullets.filter((_, index) => index !== bulletIndex) })}
                            className="text-[#9CA3AF] hover:text-white"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <div>
                        <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Description</Label>
                        <RichTextEditor
                          value={bullet.description}
                          onChange={(html) => updateBullet(experienceIndex, bulletIndex, { description: html })}
                          placeholder="Describe what you accomplished, how you did it, and the impact…"
                          minRows={3}
                        />
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
                    Add More Experience
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border-[#1F2937] bg-[#111827] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-[16px] font-semibold text-white">Additional Sections</h3>
              <p className="mt-0.5 text-[12px] text-[#6B7280]">Awards, Publications, Languages, Volunteer Work, or any custom section.</p>
            </div>
            <Button
              variant="outline"
              onClick={() => updateDraft("customSections", [...(draft.customSections ?? []), emptyCustomSection()])}
              className="border-[#374151] bg-[#1F2937] text-white hover:bg-[#374151]"
            >
              <Plus className="h-4 w-4" />
              Add New Section
            </Button>
          </div>

          {(draft.customSections ?? []).length === 0 && (
            <p className="rounded-lg border border-dashed border-[#1F2937] p-4 text-center text-[13px] text-[#6B7280]">
              No additional sections yet. Click "Add New Section" to create one.
            </p>
          )}

          <div className="space-y-4">
            {(draft.customSections ?? []).map((section, sectionIndex) => (
              <div key={`section-${sectionIndex}`} className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-[14px] font-semibold text-white">{section.name.trim() || `Section ${sectionIndex + 1}`}</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateDraft("customSections", (draft.customSections ?? []).filter((_, index) => index !== sectionIndex))}
                    className="text-[#9CA3AF] hover:text-white"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-3">
                  <div>
                    <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Section Name</Label>
                    <Input
                      value={section.name}
                      onChange={(event) => updateCustomSection(sectionIndex, { name: event.target.value })}
                      placeholder="e.g. Publications, Awards, Volunteer Work, Languages…"
                      className="border-[#1F2937] bg-[#111827] text-white"
                    />
                  </div>
                  <div>
                    <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Description</Label>
                    <RichTextEditor
                      value={section.description}
                      onChange={(html) => updateCustomSection(sectionIndex, { description: html })}
                      placeholder="Add details for this section…"
                      minRows={4}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Tools</Label>
                      <TagInput tags={section.tools ?? []} onChange={(tags) => updateCustomSection(sectionIndex, { tools: tags })} />
                    </div>
                    <div>
                      <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Keywords</Label>
                      <TagInput tags={section.keywords ?? []} onChange={(tags) => updateCustomSection(sectionIndex, { keywords: tags })} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
        </fieldset>
        )}
      </div>

      <div className="space-y-6">
        {selectedSection === "none" ? (
        <Card className="border-[#1F2937] bg-[#111827] p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="mb-2 text-[16px] font-semibold text-white">Profile Scores</h3>
              <p className="text-[12px] text-[#6B7280]">
                Each profile gets a readiness score after it is added, based on completeness and measurable impact.
              </p>
            </div>
            <div className="flex items-center rounded-lg border border-[#1F2937] bg-[#0B0F14] p-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setProfileScoreView("table")}
                className={`h-8 px-3 text-[12px] ${
                  profileScoreView === "table"
                    ? "bg-[#4F8CFF] text-white hover:bg-[#4F8CFF]/90"
                    : "text-[#9CA3AF] hover:bg-[#111827] hover:text-white"
                }`}
              >
                <TableProperties className="h-4 w-4" />
                Table
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setProfileScoreView("list")}
                className={`h-8 px-3 text-[12px] ${
                  profileScoreView === "list"
                    ? "bg-[#4F8CFF] text-white hover:bg-[#4F8CFF]/90"
                    : "text-[#9CA3AF] hover:bg-[#111827] hover:text-white"
                }`}
              >
                <LayoutList className="h-4 w-4" />
                List
              </Button>
            </div>
          </div>
          {profileScores.length > 0 ? (
            profileScoreView === "table" ? (
              <div className="overflow-x-auto rounded-xl border border-[#1F2937] bg-[#0B0F14]">
                <Table>
                  <TableHeader>
                    <TableRow className="border-[#1F2937] hover:bg-transparent">
                      <TableHead className="h-11 min-w-[180px] text-[#9CA3AF]">Profile</TableHead>
                      <TableHead className="h-11 text-[#9CA3AF]">Readiness</TableHead>
                      <TableHead className="h-11 text-[#9CA3AF]">Complete</TableHead>
                      <TableHead className="h-11 text-[#9CA3AF]">Impact</TableHead>
                      <TableHead className="h-11 text-[#9CA3AF]">Bullets</TableHead>
                      <TableHead className="h-11 text-[#9CA3AF]">Status</TableHead>
                      <TableHead className="h-11 text-[#9CA3AF]">AI</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profileScores.map(({ profile, score }) => (
                      <TableRow key={profile.id} className="border-[#1F2937] hover:bg-[#111827]">
                        <TableCell className="align-top">
                          <div className="space-y-1">
                            <p className="text-[13px] font-semibold text-white">{profile.name}</p>
                            <p className="text-[11px] text-[#6B7280]">
                              {profile.targetRoles.join(", ") || "No target roles yet"}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <span className="rounded-full border border-[#4F8CFF]/30 bg-[#4F8CFF]/10 px-2.5 py-1 text-[11px] font-semibold text-[#93C5FD]">
                            {score.readiness}%
                          </span>
                        </TableCell>
                        <TableCell className="align-top text-[12px] font-medium text-white">{score.completeness}%</TableCell>
                        <TableCell className="align-top text-[12px] font-medium text-white">{score.impact}%</TableCell>
                        <TableCell className="align-top text-[12px] font-medium text-white">{score.bulletCount}</TableCell>
                        <TableCell className="align-top">
                          <span className={`rounded-full border px-2 py-1 text-[11px] ${
                            profile.isActive
                              ? "border-[#22C55E]/30 bg-[#22C55E]/10 text-[#86EFAC]"
                              : "border-[#6B7280]/30 bg-[#111827] text-[#9CA3AF]"
                          }`}>
                            {profile.isActive ? "Active" : "Inactive"}
                          </span>
                        </TableCell>
                        <TableCell className="align-top">
                          <span className={`rounded-full border px-2 py-1 text-[11px] ${
                            profile.useForAi
                              ? "border-[#4F8CFF]/30 bg-[#4F8CFF]/10 text-[#93C5FD]"
                              : "border-[#6B7280]/30 bg-[#111827] text-[#9CA3AF]"
                          }`}>
                            {profile.useForAi ? "Enabled" : "Disabled"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="space-y-3">
                {profileScores.map(({ profile, score }) => (
                  <div
                    key={profile.id}
                    className="rounded-lg border border-[#1F2937] bg-[#0B0F14] px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">{profile.name}</p>
                        <p className="mt-1 text-[12px] text-[#6B7280]">
                          {profile.targetRoles.join(", ") || "No target roles yet"}
                        </p>
                      </div>
                      <div className="rounded-full border border-[#4F8CFF]/30 bg-[#4F8CFF]/10 px-2.5 py-1 text-[12px] font-semibold text-[#93C5FD]">
                        {score.readiness}%
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-[#9CA3AF]">
                      <div className="rounded-md border border-[#1F2937] bg-[#111827] px-2 py-2">
                        <p>Complete</p>
                        <p className="mt-1 text-[13px] font-semibold text-white">{score.completeness}%</p>
                      </div>
                      <div className="rounded-md border border-[#1F2937] bg-[#111827] px-2 py-2">
                        <p>Impact</p>
                        <p className="mt-1 text-[13px] font-semibold text-white">{score.impact}%</p>
                      </div>
                      <div className="rounded-md border border-[#1F2937] bg-[#111827] px-2 py-2">
                        <p>Bullets</p>
                        <p className="mt-1 text-[13px] font-semibold text-white">{score.bulletCount}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className={`rounded-full border px-2 py-1 text-[11px] ${
                        profile.isActive
                          ? "border-[#22C55E]/30 bg-[#22C55E]/10 text-[#86EFAC]"
                          : "border-[#6B7280]/30 bg-[#111827] text-[#9CA3AF]"
                      }`}>
                        {profile.isActive ? "Active" : "Inactive"}
                      </span>
                      <span className={`rounded-full border px-2 py-1 text-[11px] ${
                        profile.useForAi
                          ? "border-[#4F8CFF]/30 bg-[#4F8CFF]/10 text-[#93C5FD]"
                          : "border-[#6B7280]/30 bg-[#111827] text-[#9CA3AF]"
                      }`}>
                        AI {profile.useForAi ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {score.strengths.slice(0, 1).map((item) => (
                        <div key={`${profile.id}-strength-${item}`} className="rounded-md border border-[#14532D]/30 bg-[#14532D]/10 px-2 py-2 text-[11px] text-[#86EFAC]">
                          <span className="font-medium text-[#BBF7D0]">Strong:</span> {item}
                        </div>
                      ))}
                      {score.gaps.slice(0, 1).map((item) => (
                        <div key={`${profile.id}-gap-${item}`} className="rounded-md border border-[#7C2D12]/30 bg-[#7C2D12]/10 px-2 py-2 text-[11px] text-[#FDBA74]">
                          <span className="font-medium text-[#FED7AA]">Improve:</span> {item}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="rounded-lg border border-dashed border-[#1F2937] bg-[#0B0F14] px-3 py-4 text-[12px] text-[#6B7280]">
              Add a resume profile to start seeing profile readiness scores here.
            </div>
          )}
        </Card>
        ) : selectedSection === "profile" && selectedProfile && selectedProfileHealth ? (
        <Card className="border-[#1F2937] bg-[#111827] p-5">
          <h3 className="mb-2 text-[16px] font-semibold text-white">Profile Score</h3>
          <p className="mb-4 text-[12px] text-[#6B7280]">
            Current readiness snapshot for this profile.
          </p>
          <div className="rounded-lg border border-[#4F8CFF]/30 bg-[#4F8CFF]/10 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-white">{selectedProfile.name}</p>
                <p className="mt-1 text-[12px] text-[#BFDBFE]">
                  {selectedProfile.targetRoles.join(", ") || "No target roles yet"}
                </p>
              </div>
              <div className="rounded-full border border-[#4F8CFF]/30 bg-[#0B1730] px-3 py-1.5 text-[14px] font-semibold text-[#93C5FD]">
                {selectedProfileHealth.readiness}%
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-[#9CA3AF]">
              <div className="rounded-md border border-[#1F2937] bg-[#111827] px-2 py-2">
                <p>Complete</p>
                <p className="mt-1 text-[13px] font-semibold text-white">{selectedProfileHealth.completeness}%</p>
              </div>
              <div className="rounded-md border border-[#1F2937] bg-[#111827] px-2 py-2">
                <p>Impact</p>
                <p className="mt-1 text-[13px] font-semibold text-white">{selectedProfileHealth.impact}%</p>
              </div>
              <div className="rounded-md border border-[#1F2937] bg-[#111827] px-2 py-2">
                <p>Bullets</p>
                <p className="mt-1 text-[13px] font-semibold text-white">{selectedProfileHealth.bulletCount}</p>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {selectedProfileHealth.strengths.slice(0, 2).map((item) => (
                <div key={`selected-strength-${item}`} className="rounded-md border border-[#14532D]/30 bg-[#14532D]/10 px-3 py-2 text-[12px] text-[#86EFAC]">
                  <span className="font-medium text-[#BBF7D0]">Strong:</span> {item}
                </div>
              ))}
              {selectedProfileHealth.gaps.slice(0, 2).map((item) => (
                <div key={`selected-gap-${item}`} className="rounded-md border border-[#7C2D12]/30 bg-[#7C2D12]/10 px-3 py-2 text-[12px] text-[#FDBA74]">
                  <span className="font-medium text-[#FED7AA]">Improve:</span> {item}
                </div>
              ))}
            </div>
          </div>
        </Card>
        ) : null}

        {selectedSection === "profile" ? (
        <>
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
        </>
        ) : (
        <Card className="border-[#1F2937] bg-[#111827] p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-[#F59E0B]" />
            <div>
              <h4 className="text-[14px] font-semibold text-white">Legacy compatibility mode</h4>
              <p className="mt-1 text-[12px] leading-relaxed text-[#9CA3AF]">
                Legacy Preferences are kept here for compatibility, but the active structured profile table above is the recommended source for AI resume generation, scoring, and tailored resume quality.
              </p>
            </div>
          </div>
        </Card>
        )}
      </div>
      </div>
    </div>
  );
}
