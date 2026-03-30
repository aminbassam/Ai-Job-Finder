import { useEffect, useState } from "react";
import { FileText, Loader2, MailOpen, Sparkles } from "lucide-react";
import { Card } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import { Switch } from "../../components/ui/switch";
import { settingsService } from "../../services/settings.service";

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg border border-[#1F2937] bg-[#0B0F14] p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`flex-1 rounded-md px-2 py-1.5 text-[12px] font-medium transition-all ${
            value === option.value
              ? "bg-[#4F8CFF] text-white shadow-sm"
              : "text-[#6B7280] hover:text-[#D1D5DB]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const DEFAULTS = {
  includeCoverLetters: true,
  coverLetterTone: "confident" as const,
  coverLetterLength: "medium" as const,
  coverLetterPersonalization: "medium" as const,
};

export function CoverLetterSettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(DEFAULTS);

  useEffect(() => {
    settingsService
      .getPreferences()
      .then((prefs) => {
        setForm({
          includeCoverLetters: prefs.includeCoverLetters ?? DEFAULTS.includeCoverLetters,
          coverLetterTone: prefs.coverLetterTone ?? DEFAULTS.coverLetterTone,
          coverLetterLength: prefs.coverLetterLength ?? DEFAULTS.coverLetterLength,
          coverLetterPersonalization: prefs.coverLetterPersonalization ?? DEFAULTS.coverLetterPersonalization,
        });
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await settingsService.updatePreferences({
        includeCoverLetters: form.includeCoverLetters,
        coverLetterTone: form.coverLetterTone,
        coverLetterLength: form.coverLetterLength,
        coverLetterPersonalization: form.coverLetterPersonalization,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save cover letter settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-[13px] text-[#9CA3AF]">
        <Loader2 className="h-4 w-4 animate-spin text-[#4F8CFF]" />
        Loading cover letter settings…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-[#1F2937] bg-[#111827] p-6">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4F8CFF]/10">
            <MailOpen className="h-4 w-4 text-[#4F8CFF]" />
          </div>
          <div>
            <h2 className="text-[18px] font-semibold text-white">Cover Letter Settings</h2>
            <p className="mt-1 text-[13px] text-[#9CA3AF]">
              Control how the platform writes cover letters across the Job Board, Job Detail view, and Cover Letters section.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-white">Enable AI cover letter generation</p>
              <p className="mt-1 text-[12px] text-[#6B7280]">
                Uses your connected AI provider, active AI-enabled resume profiles, and the default AI instructions from AI Settings.
              </p>
            </div>
            <Switch
              checked={form.includeCoverLetters}
              onCheckedChange={(value) => update("includeCoverLetters", value)}
            />
          </div>
        </div>
      </Card>

      <Card className="border-[#1F2937] bg-[#111827] p-6">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4F8CFF]/10">
            <Sparkles className="h-4 w-4 text-[#4F8CFF]" />
          </div>
          <div>
            <h2 className="text-[18px] font-semibold text-white">Writing Defaults</h2>
            <p className="mt-1 text-[13px] text-[#9CA3AF]">
              These defaults guide every newly generated cover letter.
            </p>
          </div>
        </div>

        <div className={`space-y-5 ${!form.includeCoverLetters ? "opacity-60" : ""}`}>
          <div>
            <div className="mb-1.5">
              <Label className="text-[12px] font-medium uppercase tracking-wide text-[#9CA3AF]">Tone</Label>
              <p className="mt-0.5 text-[11px] text-[#4B5563]">Choose the overall voice used for generated cover letters.</p>
            </div>
            <SegmentedControl
              value={form.coverLetterTone}
              onChange={(value) => update("coverLetterTone", value as typeof form.coverLetterTone)}
              options={[
                { value: "formal", label: "Formal" },
                { value: "confident", label: "Confident" },
                { value: "friendly", label: "Friendly" },
              ]}
            />
          </div>

          <div>
            <div className="mb-1.5">
              <Label className="text-[12px] font-medium uppercase tracking-wide text-[#9CA3AF]">Length</Label>
              <p className="mt-0.5 text-[11px] text-[#4B5563]">Control how concise or detailed the generated letter should be.</p>
            </div>
            <SegmentedControl
              value={form.coverLetterLength}
              onChange={(value) => update("coverLetterLength", value as typeof form.coverLetterLength)}
              options={[
                { value: "short", label: "Short" },
                { value: "medium", label: "Medium" },
                { value: "detailed", label: "Detailed" },
              ]}
            />
          </div>

          <div>
            <div className="mb-1.5">
              <Label className="text-[12px] font-medium uppercase tracking-wide text-[#9CA3AF]">Personalization</Label>
              <p className="mt-0.5 text-[11px] text-[#4B5563]">Set how deeply the AI tailors the letter to the company and role.</p>
            </div>
            <SegmentedControl
              value={form.coverLetterPersonalization}
              onChange={(value) => update("coverLetterPersonalization", value as typeof form.coverLetterPersonalization)}
              options={[
                { value: "low", label: "Light" },
                { value: "medium", label: "Balanced" },
                { value: "high", label: "Deep" },
              ]}
            />
          </div>
        </div>
      </Card>

      <Card className="border-[#1F2937] bg-[#111827] p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4F8CFF]/10">
            <FileText className="h-4 w-4 text-[#4F8CFF]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[18px] font-semibold text-white">How it works</h2>
            <ul className="mt-3 space-y-2 text-[13px] leading-6 text-[#9CA3AF]">
              <li>Only active resume profiles with AI enabled are used as source material.</li>
              <li>Deactivated resume profiles are ignored automatically.</li>
              <li>Your connected AI provider and default AI instructions are applied every time.</li>
              <li>Editing a cover letter later keeps the latest saved version ready for download.</li>
            </ul>
          </div>
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <Button
          onClick={() => void handleSave()}
          disabled={saving}
          className="bg-[#4F8CFF] text-white hover:bg-[#4F8CFF]/90"
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {saving ? "Saving…" : "Save Cover Letter Settings"}
        </Button>
        {saved && <span className="text-[12px] text-[#22C55E]">Saved successfully.</span>}
        {error && <span className="text-[12px] text-[#EF4444]">{error}</span>}
      </div>
    </div>
  );
}
