import { useEffect, useMemo, useState } from "react";
import { Brain, FileText, Loader2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
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
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [includeLegacyPreferences, setIncludeLegacyPreferences] = useState(false);
  const [legacyAiEnabled, setLegacyAiEnabled] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<"openai" | "anthropic" | "">("");
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
        setProviders(nextProviders.filter((item) => item.status === "connected"));

        const legacyPreferred = Boolean(prefs.useLegacyResumePreferencesForAi);
        setLegacyAiEnabled(legacyPreferred);
        setIncludeLegacyPreferences(legacyPreferred && enabledProfiles.length === 0);
        setSelectedProfileIds(enabledProfiles.slice(0, 1).map((profile) => profile.id));

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

  const selectedCount = selectedProfileIds.length + (includeLegacyPreferences ? 1 : 0);

  const sourceOptions = useMemo(
    () => profiles.map((profile) => ({
      value: profile.id,
      label: profile.name,
      description: profile.targetRoles.join(", ") || "No target roles",
    })),
    [profiles]
  );

  function toggleProfile(profileId: string) {
    setSelectedProfileIds((current) => {
      if (current.includes(profileId)) {
        return current.filter((item) => item !== profileId);
      }
      if (current.length >= 2) {
        return [...current.slice(1), profileId];
      }
      return [...current, profileId];
    });
  }

  async function handleGenerate() {
    if (!selectedProvider) {
      setLocalError("Connect and select an AI provider first.");
      return;
    }
    if (selectedCount === 0) {
      setLocalError("Select at least one AI-enabled resume profile or Legacy Preferences.");
      return;
    }

    setLocalError(null);
    await onGenerate({
      profileIds: selectedProfileIds,
      useLegacyPreferences: includeLegacyPreferences,
      provider: selectedProvider,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-[#1F2937] bg-[#111827] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <FileText className="h-5 w-5 text-[#4F8CFF]" />
            Generate Tailored Resume
          </DialogTitle>
          <DialogDescription className="text-[#9CA3AF]">
            Choose up to two resume profiles and the AI provider that should generate the best tailored resume for
            {" "}
            <span className="font-medium text-white">{jobTitle}</span>
            {company ? ` at ${company}` : ""}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-4 text-[12px] text-[#9CA3AF]">
            The selected profiles, job description, requirements, and global AI rules will be combined to generate a stronger ATS-friendly resume.
          </div>

          {(error || localError) && (
            <div className="rounded-lg border border-[#7F1D1D] bg-[#7F1D1D]/10 px-4 py-3 text-[13px] text-[#FCA5A5]">
              {error || localError}
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-[12px] uppercase tracking-wide text-[#9CA3AF]">Resume Profiles</Label>
              <span className="text-[11px] text-[#6B7280]">Choose up to 2 profiles</span>
            </div>
            <div className="space-y-2">
              {sourceOptions.length > 0 ? sourceOptions.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#1F2937] bg-[#0B0F14] p-3"
                >
                  <Checkbox
                    checked={selectedProfileIds.includes(option.value)}
                    onCheckedChange={() => toggleProfile(option.value)}
                    disabled={loading || generating || (!selectedProfileIds.includes(option.value) && selectedCount >= 2)}
                    className="mt-0.5 border-[#374151] data-[state=checked]:border-[#4F8CFF] data-[state=checked]:bg-[#4F8CFF]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-white">{option.label}</p>
                    <p className="text-[11px] text-[#6B7280]">{option.description}</p>
                  </div>
                </label>
              )) : (
                <div className="rounded-lg border border-dashed border-[#1F2937] bg-[#0B0F14] p-3 text-[12px] text-[#9CA3AF]">
                  No structured profiles are currently enabled for AI resume generation.
                </div>
              )}

              <label className={`flex items-start gap-3 rounded-lg border p-3 ${legacyAiEnabled ? "border-[#1F2937] bg-[#0B0F14]" : "border-dashed border-[#1F2937] bg-[#0B0F14]/60 opacity-70"}`}>
                <Checkbox
                  checked={includeLegacyPreferences}
                  onCheckedChange={(checked) => setIncludeLegacyPreferences(Boolean(checked))}
                  disabled={loading || generating || !legacyAiEnabled || (!includeLegacyPreferences && selectedCount >= 2)}
                  className="mt-0.5 border-[#374151] data-[state=checked]:border-[#4F8CFF] data-[state=checked]:bg-[#4F8CFF]"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-white">Legacy Preferences</p>
                  <p className="text-[11px] text-[#6B7280]">
                    {legacyAiEnabled
                      ? "Include the compatibility profile and older resume preferences."
                      : "Enable Legacy Preferences for AI in Master Resume before selecting it here."}
                  </p>
                </div>
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[12px] uppercase tracking-wide text-[#9CA3AF]">AI Provider</Label>
            <Select
              value={selectedProvider}
              onValueChange={(value) => setSelectedProvider(value as "openai" | "anthropic")}
              disabled={loading || generating}
            >
              <SelectTrigger className="border-[#1F2937] bg-[#0B0F14] text-white">
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

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-4">
              <p className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-[#4F8CFF]">
                <Sparkles className="h-4 w-4" />
                Included Inputs
              </p>
              <ul className="space-y-1.5 text-[12px] text-[#D1D5DB]">
                <li>• Up to two selected AI-enabled resume profiles</li>
                <li>• Optional Legacy Preferences profile</li>
                <li>• Job title, description, and requirements</li>
                <li>• Global AI rules and formatting settings</li>
              </ul>
            </div>
            <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-4">
              <p className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-[#4F8CFF]">
                <Brain className="h-4 w-4" />
                Goal
              </p>
              <p className="text-[12px] leading-relaxed text-[#D1D5DB]">
                Generate a high-quality, approval-ready tailored resume that improves ATS alignment without inventing experience or metrics.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
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
