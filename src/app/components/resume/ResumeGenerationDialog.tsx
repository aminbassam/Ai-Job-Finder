import { useEffect, useMemo, useState } from "react";
import { Brain, ChevronDown, FileText, Loader2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { masterResumeService, type MasterResumeProfile } from "../../services/masterResume.service";
import { settingsService, type AiProviderInfo } from "../../services/settings.service";

interface ResumeGenerationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobTitle: string;
  company?: string;
  generating?: boolean;
  error?: string | null;
  onGenerate: (selection: {
    profileIds?: string[];
    useLegacyPreferences?: boolean;
    provider: "openai" | "anthropic";
    customRole?: string;
  }) => Promise<void>;
}

function providerLabel(provider: "openai" | "anthropic") {
  return provider === "openai" ? "OpenAI" : "Anthropic";
}

export function ResumeGenerationDialog({
  open,
  onOpenChange,
  jobTitle,
  company,
  generating = false,
  error = null,
  onGenerate,
}: ResumeGenerationDialogProps) {
  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState<MasterResumeProfile[]>([]);
  const [providers, setProviders] = useState<AiProviderInfo[]>([]);
  const [customRoles, setCustomRoles] = useState<string[]>([]);
  const [legacyAiEnabled, setLegacyAiEnabled] = useState(false);
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<"openai" | "anthropic" | "">("");
  const [selectedCustomRole, setSelectedCustomRole] = useState<string>("__default");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setLocalError(null);

    Promise.all([
      masterResumeService.listProfiles().catch(() => []),
      settingsService.getAiProviders().catch(() => []),
      settingsService.getPreferences().catch(() => ({})),
    ])
      .then(([nextProfiles, nextProviders, prefs]) => {
        if (cancelled) return;
        const enabledProfiles = nextProfiles.filter((profile) => profile.isActive && profile.useForAi);
        setProfiles(enabledProfiles);
        setSelectedProfileIds(enabledProfiles.map((profile) => profile.id));
        setProviders(nextProviders.filter((item) => item.status === "connected"));
        const availableCustomRoles = Array.isArray(prefs.aiCustomRoles)
          ? prefs.aiCustomRoles.filter((role): role is string => typeof role === "string" && role.trim().length > 0)
          : [];
        setCustomRoles(availableCustomRoles);
        setSelectedCustomRole("__default");

        const legacyPreferred = Boolean(prefs.useLegacyResumePreferencesForAi);
        setLegacyAiEnabled(legacyPreferred);

        const preferredProvider = prefs.defaultAiProvider;
        const providerCandidate = nextProviders.find((item) => item.status === "connected" && item.provider === preferredProvider)
          ?? nextProviders.find((item) => item.status === "connected" && item.isDefault)
          ?? nextProviders.find((item) => item.status === "connected");
        setSelectedProvider((providerCandidate?.provider as "openai" | "anthropic" | undefined) ?? "");
      })
      .catch((err) => {
        if (!cancelled) {
          setLocalError(err instanceof Error ? err.message : "Failed to load resume generation options.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const sourceOptions = useMemo(
    () => profiles.map((profile) => ({
      value: profile.id,
      label: profile.name,
      description: profile.targetRoles.join(", ") || "No target roles",
    })),
    [profiles]
  );

  const allSelected = sourceOptions.length > 0 && selectedProfileIds.length === sourceOptions.length;
  const selectedProfileSummary =
    selectedProfileIds.length === 0
      ? "Select resume profiles"
      : selectedProfileIds.length === 1
        ? sourceOptions.find((option) => option.value === selectedProfileIds[0])?.label ?? "1 profile selected"
        : `${selectedProfileIds.length} profiles selected`;
  const selectedProfileDetails = sourceOptions
    .filter((option) => selectedProfileIds.includes(option.value))
    .map((option) => option.label)
    .join(", ");

  function toggleProfile(profileId: string, checked: boolean) {
    setSelectedProfileIds((prev) =>
      checked ? Array.from(new Set([...prev, profileId])) : prev.filter((id) => id !== profileId)
    );
    setLocalError(null);
  }

  async function handleGenerate() {
    if (!selectedProvider) {
      setLocalError("Connect and select an AI provider first.");
      return;
    }
    if (sourceOptions.length === 0) {
      setLocalError("Activate at least one resume profile with AI enabled before generating a tailored resume.");
      return;
    }
    if (selectedProfileIds.length === 0) {
      setLocalError("Select at least one resume profile to use for this tailored resume.");
      return;
    }

    setLocalError(null);
    await onGenerate({
      profileIds: selectedProfileIds,
      provider: selectedProvider,
      customRole: selectedCustomRole !== "__default" ? selectedCustomRole : undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[min(960px,calc(100vw-1.5rem))] flex-col overflow-hidden border-[#1F2937] bg-[#111827] p-0 text-white">
        <DialogHeader className="border-b border-[#1F2937] px-5 py-4 sm:px-6">
          <DialogTitle className="flex items-center gap-2 text-white">
            <FileText className="h-5 w-5 text-[#4F8CFF]" />
            Generate Tailored Resume
          </DialogTitle>
          <DialogDescription className="text-[#9CA3AF]">
            Choose which resume profile data should be used with the selected AI provider to generate the best tailored resume for
            {" "}
            <span className="font-medium text-white">{jobTitle}</span>
            {company ? ` at ${company}` : ""}.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          <div className="space-y-4">
            <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[#4F8CFF]/30 bg-[#4F8CFF]/10 px-2.5 py-1 text-[11px] font-medium text-[#BFDBFE]">
                  {selectedProfileIds.length} profile{selectedProfileIds.length === 1 ? "" : "s"} selected
                </span>
                <span className="rounded-full border border-[#1F2937] bg-[#111827] px-2.5 py-1 text-[11px] text-[#9CA3AF]">
                  {company || "Target company"}
                </span>
                <span className="rounded-full border border-[#1F2937] bg-[#111827] px-2.5 py-1 text-[11px] text-[#9CA3AF]">
                  {jobTitle}
                </span>
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-[#9CA3AF]">
                Select the strongest resume profiles for this job. JobFlow will combine only the selected profiles, the job description, and your AI rules. Deactivated profiles stay excluded automatically.
              </p>
            </div>

            {(error || localError) && (
              <div className="rounded-lg border border-[#7F1D1D] bg-[#7F1D1D]/10 px-4 py-3 text-[13px] text-[#FCA5A5]">
                {error || localError}
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <div className="space-y-4">
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(220px,0.8fr)]">
                  <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
                    <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Resume Profiles</Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          disabled={loading || generating || sourceOptions.length === 0}
                          className="flex w-full items-center justify-between rounded-lg border border-[#1F2937] bg-[#111827] px-3 py-2.5 text-left text-white transition-colors hover:border-[#374151] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium">{selectedProfileSummary}</p>
                            <p className="mt-0.5 truncate text-[11px] text-[#6B7280]">
                              {selectedProfileDetails || "Choose one or more active AI-enabled resume profiles"}
                            </p>
                          </div>
                          <ChevronDown className="ml-3 h-4 w-4 shrink-0 text-[#9CA3AF]" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-[min(420px,calc(100vw-3rem))] border-[#1F2937] bg-[#111827] text-white">
                        <DropdownMenuLabel className="text-[12px] uppercase tracking-wide text-[#9CA3AF]">
                          Select Resume Profiles
                        </DropdownMenuLabel>
                        {sourceOptions.length > 0 && (
                          <>
                            <DropdownMenuSeparator className="bg-[#1F2937]" />
                            <div className="flex items-center justify-between px-2 py-1.5 text-[11px] text-[#6B7280]">
                              <span>{sourceOptions.length} available</span>
                              <button
                                type="button"
                                onClick={() => setSelectedProfileIds(allSelected ? [] : sourceOptions.map((option) => option.value))}
                                className="font-medium text-[#93C5FD] hover:text-white"
                              >
                                {allSelected ? "Clear all" : "Select all"}
                              </button>
                            </div>
                            <DropdownMenuSeparator className="bg-[#1F2937]" />
                          </>
                        )}
                        {sourceOptions.length > 0 ? sourceOptions.map((option) => (
                          <DropdownMenuCheckboxItem
                            key={option.value}
                            checked={selectedProfileIds.includes(option.value)}
                            onCheckedChange={(checked) => toggleProfile(option.value, Boolean(checked))}
                            className="focus:bg-[#1F2937] focus:text-white"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-medium text-white">{option.label}</p>
                              <p className="truncate text-[11px] text-[#6B7280]">{option.description}</p>
                            </div>
                          </DropdownMenuCheckboxItem>
                        )) : (
                          <div className="px-2 py-2 text-[12px] text-[#9CA3AF]">
                            No structured profiles are currently enabled for AI resume generation.
                          </div>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
                    <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">AI Provider</Label>
                    <Select
                      value={selectedProvider}
                      onValueChange={(value) => setSelectedProvider(value as "openai" | "anthropic")}
                      disabled={loading || generating}
                    >
                      <SelectTrigger className="border-[#1F2937] bg-[#111827] text-white">
                        <SelectValue placeholder="Choose the AI provider to use" />
                      </SelectTrigger>
                      <SelectContent className="border-[#1F2937] bg-[#111827] text-white">
                        {providers.length > 0 ? providers.map((provider) => (
                          <SelectItem key={provider.provider} value={provider.provider}>
                            <div className="flex flex-col">
                              <span>{providerLabel(provider.provider)}</span>
                              <span className="text-[11px] text-[#6B7280]">
                                {provider.selectedModel || "Connected"}
                              </span>
                            </div>
                          </SelectItem>
                        )) : (
                          <SelectItem value="__no_provider" disabled>
                            No connected AI providers
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
                    <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">AI Custom Profile</Label>
                    <Select
                      value={selectedCustomRole}
                      onValueChange={setSelectedCustomRole}
                      disabled={loading || generating || customRoles.length === 0}
                    >
                      <SelectTrigger className="border-[#1F2937] bg-[#111827] text-white">
                        <SelectValue placeholder="Use default AI behavior" />
                      </SelectTrigger>
                      <SelectContent className="border-[#1F2937] bg-[#111827] text-white">
                        <SelectItem value="__default">Use default AI behavior</SelectItem>
                        {customRoles.map((role) => (
                          <SelectItem key={role} value={role}>
                            {role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-2 text-[11px] leading-relaxed text-[#6B7280]">
                      {customRoles.length > 0
                        ? "Choose one custom AI role if you want the generator to emphasize a specific writing lens."
                        : "No custom AI roles are saved in AI Settings yet."}
                    </p>
                  </div>

                  <div className={`rounded-xl border p-4 ${legacyAiEnabled ? "border-[#1F2937] bg-[#0B0F14]" : "border-dashed border-[#1F2937] bg-[#0B0F14]/60 opacity-70"}`}>
                    <p className="text-[13px] font-medium text-white">Legacy Preferences</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-[#6B7280]">
                      {legacyAiEnabled
                        ? "Enabled in AI settings as supplemental compatibility context."
                        : "Disabled in AI settings. Only active structured resume profiles will be used."}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
                  <p className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-[#4F8CFF]">
                    <Sparkles className="h-4 w-4" />
                    Default AI Instructions
                  </p>
                  <p className="text-[12px] leading-relaxed text-[#D1D5DB]">
                    The generation goal and included inputs now follow the{" "}
                    <span className="font-medium text-white">Default AI Instructions</span>{" "}
                    section in Settings, together with your selected profiles, provider, and any optional custom AI role.
                  </p>
                  <ul className="mt-3 space-y-1.5 pl-4 text-[12px] text-[#9CA3AF] list-disc marker:text-[#6B7280]">
                    <li>Selected resume profiles only</li>
                    <li>Legacy preferences only when enabled</li>
                    <li>Job details and requirements</li>
                    {selectedCustomRole !== "__default" ? <li>Custom AI role: {selectedCustomRole}</li> : null}
                  </ul>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
                  <p className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-[#4F8CFF]">
                    <Brain className="h-4 w-4" />
                    Goal
                  </p>
                  <p className="text-[12px] leading-relaxed text-[#D1D5DB]">
                    Use the Default AI Instructions in Settings to define the standing generation goal for tailored resumes and summaries.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-[#1F2937] bg-[#111827] px-5 py-4 sm:px-6">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-[#374151] bg-[#111827] text-white hover:bg-[#1F2937]"
            disabled={generating}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleGenerate()}
            className="bg-[#4F8CFF] text-white hover:bg-[#4F8CFF]/90"
            disabled={loading || generating || !selectedProvider}
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {generating ? "Generating…" : "Generate Resume"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
