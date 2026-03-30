import { useEffect, useMemo, useState } from "react";
import { Brain, Shield, Sparkles, Loader2, CheckCircle2, Wand2 } from "lucide-react";
import { Card } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Button } from "../../components/ui/button";
import { Switch } from "../../components/ui/switch";
import { TagInput } from "../../components/ui/tag-input";
import { settingsService, type GlobalAiSettings } from "../../services/settings.service";

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
    <div className="flex gap-1 bg-[#0B0F14] border border-[#1F2937] rounded-lg p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 py-1.5 px-2 rounded-md text-[12px] font-medium transition-all ${
            value === o.value
              ? "bg-[#4F8CFF] text-white shadow-sm"
              : "text-[#6B7280] hover:text-[#D1D5DB]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SectionCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="bg-[#111827] border-[#1F2937] p-5">
      <div className="flex items-start gap-3 mb-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4F8CFF]/10 shrink-0 mt-0.5">
          {icon}
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-white">{title}</h3>
          <p className="text-[12px] text-[#6B7280] mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5">
      <Label className="text-[12px] font-medium text-[#9CA3AF] uppercase tracking-wide">{children}</Label>
      {hint && <p className="text-[11px] text-[#4B5563] mt-0.5">{hint}</p>}
    </div>
  );
}

const DEFAULTS: Required<Pick<
  GlobalAiSettings,
  | "aiTone"
  | "resumeStyle"
  | "bulletStyle"
  | "atsLevel"
  | "includeCoverLetters"
  | "coverLetterTone"
  | "coverLetterLength"
  | "coverLetterPersonalization"
  | "noFakeExperience"
  | "noChangeTitles"
  | "noExaggerateMetrics"
  | "onlyRephrase"
  | "mirrorJobKeywords"
  | "prioritizeRecentExperience"
  | "keepBulletsConcise"
  | "avoidFirstPerson"
  | "emphasizeLeadership"
  | "useLegacyResumePreferencesForAi"
>> & { aiCustomRoles: string[]; aiDefaultInstructions: string } = {
  aiTone: "impact-driven",
  resumeStyle: "balanced",
  bulletStyle: "metrics-heavy",
  atsLevel: "balanced",
  includeCoverLetters: true,
  coverLetterTone: "confident",
  coverLetterLength: "medium",
  coverLetterPersonalization: "medium",
  noFakeExperience: true,
  noChangeTitles: true,
  noExaggerateMetrics: true,
  onlyRephrase: true,
  mirrorJobKeywords: true,
  prioritizeRecentExperience: true,
  keepBulletsConcise: true,
  avoidFirstPerson: true,
  emphasizeLeadership: false,
  useLegacyResumePreferencesForAi: false,
  aiCustomRoles: [],
  aiDefaultInstructions: "",
};

export function GlobalAiSettingsTab() {
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
          aiTone: prefs.aiTone ?? DEFAULTS.aiTone,
          resumeStyle: prefs.resumeStyle ?? DEFAULTS.resumeStyle,
          bulletStyle: prefs.bulletStyle ?? DEFAULTS.bulletStyle,
          atsLevel: prefs.atsLevel ?? DEFAULTS.atsLevel,
          includeCoverLetters: prefs.includeCoverLetters ?? DEFAULTS.includeCoverLetters,
          coverLetterTone: prefs.coverLetterTone ?? DEFAULTS.coverLetterTone,
          coverLetterLength: prefs.coverLetterLength ?? DEFAULTS.coverLetterLength,
          coverLetterPersonalization: prefs.coverLetterPersonalization ?? DEFAULTS.coverLetterPersonalization,
          noFakeExperience: prefs.noFakeExperience ?? DEFAULTS.noFakeExperience,
          noChangeTitles: prefs.noChangeTitles ?? DEFAULTS.noChangeTitles,
          noExaggerateMetrics: prefs.noExaggerateMetrics ?? DEFAULTS.noExaggerateMetrics,
          onlyRephrase: prefs.onlyRephrase ?? DEFAULTS.onlyRephrase,
          mirrorJobKeywords: prefs.mirrorJobKeywords ?? DEFAULTS.mirrorJobKeywords,
          prioritizeRecentExperience: prefs.prioritizeRecentExperience ?? DEFAULTS.prioritizeRecentExperience,
          keepBulletsConcise: prefs.keepBulletsConcise ?? DEFAULTS.keepBulletsConcise,
          avoidFirstPerson: prefs.avoidFirstPerson ?? DEFAULTS.avoidFirstPerson,
          emphasizeLeadership: prefs.emphasizeLeadership ?? DEFAULTS.emphasizeLeadership,
          useLegacyResumePreferencesForAi:
            prefs.useLegacyResumePreferencesForAi ?? DEFAULTS.useLegacyResumePreferencesForAi,
          aiCustomRoles: prefs.aiCustomRoles ?? [],
          aiDefaultInstructions: prefs.aiDefaultInstructions ?? "",
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
        aiTone: form.aiTone,
        resumeStyle: form.resumeStyle,
        bulletStyle: form.bulletStyle,
        atsLevel: form.atsLevel,
        includeCoverLetters: form.includeCoverLetters,
        coverLetterTone: form.coverLetterTone,
        coverLetterLength: form.coverLetterLength,
        coverLetterPersonalization: form.coverLetterPersonalization,
        noFakeExperience: form.noFakeExperience,
        noChangeTitles: form.noChangeTitles,
        noExaggerateMetrics: form.noExaggerateMetrics,
        onlyRephrase: form.onlyRephrase,
        mirrorJobKeywords: form.mirrorJobKeywords,
        prioritizeRecentExperience: form.prioritizeRecentExperience,
        keepBulletsConcise: form.keepBulletsConcise,
        avoidFirstPerson: form.avoidFirstPerson,
        emphasizeLeadership: form.emphasizeLeadership,
        aiCustomRoles: form.aiCustomRoles,
        aiDefaultInstructions: form.aiDefaultInstructions,
        useLegacyResumePreferencesForAi: form.useLegacyResumePreferencesForAi,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save AI settings.");
    } finally {
      setSaving(false);
    }
  }

  const roleSuggestions = useMemo(
    () => [
      "Executive resume strategist",
      "ATS optimization specialist",
      "Technical recruiter",
      "Hiring manager",
      "Career coach",
      "Startup resume writer",
    ],
    []
  );
  const generationInputs = useMemo(
    () => [
      "Only the active resume profiles selected for the job",
      "Deactivated profiles stay excluded automatically",
      "Legacy preferences only when enabled as supplemental context",
      "Job title, description, requirements, and captured metadata",
      "Global AI rules, formatting defaults, and your custom AI role when selected",
    ],
    []
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-[13px] text-[#9CA3AF]">
        <Loader2 className="h-4 w-4 animate-spin text-[#4F8CFF]" />
        Loading global AI settings…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionCard
        icon={<Brain className="h-4 w-4 text-[#4F8CFF]" />}
        title="AI Behaviour Control"
        subtitle="Global writing defaults used across resume generation, cover letters, summaries, and shared AI writing features."
      >
        <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#6B7280]">Applied automatically to</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {["Tailored resumes", "Resume summaries", "Cover letters", "Bullet rewriting", "AI job-fit writing"].map((item) => (
              <span
                key={item}
                className="rounded-full border border-[#1F2937] bg-[#111827] px-3 py-1 text-[12px] text-[#D1D5DB]"
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        <div>
          <FieldLabel hint="How the AI frames your experience.">Writing Tone</FieldLabel>
          <SegmentedControl
            value={form.aiTone}
            onChange={(v) => update("aiTone", v as typeof form.aiTone)}
            options={[
              { value: "concise", label: "Concise" },
              { value: "impact-driven", label: "Impact-driven" },
              { value: "technical", label: "Technical" },
            ]}
          />
        </div>

        <div>
          <FieldLabel hint="Output format for AI-generated resume content.">Resume Style</FieldLabel>
          <SegmentedControl
            value={form.resumeStyle}
            onChange={(v) => update("resumeStyle", v as typeof form.resumeStyle)}
            options={[
              { value: "ats-safe", label: "ATS-safe" },
              { value: "balanced", label: "Balanced" },
              { value: "human-friendly", label: "Human-friendly" },
            ]}
          />
        </div>

        <div>
          <FieldLabel hint="How bullets are shaped by default.">Bullet Style</FieldLabel>
          <SegmentedControl
            value={form.bulletStyle}
            onChange={(v) => update("bulletStyle", v as typeof form.bulletStyle)}
            options={[
              { value: "metrics-heavy", label: "Metrics-heavy" },
              { value: "responsibility-focused", label: "Responsibility-focused" },
            ]}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {(
            [
              [
                "mirrorJobKeywords",
                "Mirror supported job keywords",
                "Match relevant wording from the job post only when your source material supports it.",
              ],
              [
                "prioritizeRecentExperience",
                "Prioritize recent experience",
                "Bias the strongest and most recent work before older examples.",
              ],
              [
                "keepBulletsConcise",
                "Keep bullets concise",
                "Prefer tight, scan-friendly bullets over long narrative lines.",
              ],
              [
                "avoidFirstPerson",
                "Avoid first-person voice",
                "Keep resumes and summaries in third-person / implied voice unless letter style is needed.",
              ],
              [
                "emphasizeLeadership",
                "Elevate leadership signals",
                "Highlight ownership, leadership, and cross-functional influence when your resume supports it.",
              ],
              [
                "useLegacyResumePreferencesForAi",
                "Blend legacy resume preferences",
                "Use older preference fields as extra context when shaping AI output.",
              ],
            ] as const
          ).map(([key, label, desc]) => (
            <div key={key} className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-white">{label}</p>
                  <p className="mt-1 text-[11px] text-[#6B7280]">{desc}</p>
                </div>
                <Switch checked={form[key]} onCheckedChange={(v) => update(key, v)} />
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        icon={<Sparkles className="h-4 w-4 text-[#4F8CFF]" />}
        title="Optimisation Settings"
        subtitle="Shared ATS and writing defaults for AI-generated application materials."
      >
        <div>
          <FieldLabel hint="How aggressively the AI should optimize for ATS keyword matching.">
            ATS Optimisation Level
          </FieldLabel>
          <SegmentedControl
            value={form.atsLevel}
            onChange={(v) => update("atsLevel", v as typeof form.atsLevel)}
            options={[
              { value: "basic", label: "Basic" },
              { value: "balanced", label: "Balanced" },
              { value: "aggressive", label: "Aggressive" },
            ]}
          />
        </div>
      </SectionCard>

      <SectionCard
        icon={<Shield className="h-4 w-4 text-[#4F8CFF]" />}
        title="AI Safety Rules"
        subtitle="Global guardrails that all AI writing should follow."
      >
        {(
          [
            ["noFakeExperience", "Do not add fake experience", "AI will never invent jobs, projects, or skills you have not provided."],
            ["noChangeTitles", "Do not change job titles", "Your original titles stay intact unless you explicitly edit them yourself."],
            ["noExaggerateMetrics", "Do not exaggerate metrics", "Numbers and outcomes must stay grounded in the source material."],
            ["onlyRephrase", "Only rephrase and reorder content", "The AI can clarify and structure, but should not add unsupported facts."],
          ] as const
        ).map(([key, label, desc]) => (
          <div key={key} className="flex items-start justify-between gap-4 py-1">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-white">{label}</p>
              <p className="text-[11px] text-[#6B7280] mt-0.5">{desc}</p>
            </div>
            <Switch
              checked={form[key]}
              onCheckedChange={(v) => update(key, v)}
            />
          </div>
        ))}
      </SectionCard>

      <SectionCard
        icon={<Wand2 className="h-4 w-4 text-[#4F8CFF]" />}
        title="Default AI Instructions"
        subtitle="These instructions are added to every supported AI request before generation starts."
      >
        <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
          <p className="text-[13px] font-medium text-white">Always-on instruction layer</p>
          <p className="mt-1 text-[12px] text-[#9CA3AF]">
            Use this for evergreen guidance like tone, seniority, truthfulness, formatting preferences, or what the AI should emphasize every time.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#4F8CFF]">Goal</p>
            <p className="text-[12px] leading-relaxed text-[#D1D5DB]">
              Generate approval-ready AI output that improves ATS alignment, stays factual, and uses the client&apos;s real resume data without inventing experience, titles, or metrics.
            </p>
          </div>

          <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#4F8CFF]">Included Inputs</p>
            <ul className="space-y-1.5 pl-4 text-[12px] leading-relaxed text-[#D1D5DB] list-disc marker:text-[#6B7280]">
              {generationInputs.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div>
          <FieldLabel hint="Optional roles/personas the AI should consistently adopt.">
            Custom AI Roles
          </FieldLabel>
          <TagInput
            tags={form.aiCustomRoles}
            onChange={(v) => update("aiCustomRoles", v)}
            placeholder="Add a role…"
            suggestions={roleSuggestions}
          />
        </div>

        <div>
          <FieldLabel hint="Applied to resume generation, summaries, cover letters, and other shared AI flows.">
            Global AI Instructions
          </FieldLabel>
          <div className="mb-3 flex flex-wrap gap-2">
            {[
              "Keep claims conservative and factual.",
              "Prefer measurable impact when available.",
              "Write for senior product and operations roles.",
              "Avoid generic buzzwords and filler.",
            ].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() =>
                  update(
                    "aiDefaultInstructions",
                    form.aiDefaultInstructions.includes(suggestion)
                      ? form.aiDefaultInstructions
                      : `${form.aiDefaultInstructions.trim()}${form.aiDefaultInstructions.trim() ? "\n" : ""}${suggestion}`
                  )
                }
                className="rounded-full border border-[#1F2937] bg-[#0B0F14] px-3 py-1 text-[12px] text-[#D1D5DB] transition-colors hover:border-[#4F8CFF]/40 hover:text-white"
              >
                + {suggestion}
              </button>
            ))}
          </div>
          <Textarea
            value={form.aiDefaultInstructions}
            onChange={(e) => update("aiDefaultInstructions", e.target.value)}
            placeholder="Example: Prioritize executive-level impact, keep claims conservative, and prefer measurable achievements when available."
            className="min-h-[140px] bg-[#0B0F14] border-[#1F2937] text-white placeholder:text-[#4B5563]"
          />
          <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-[#6B7280]">
            <p>This instruction block is merged into the AI system prompt before the model sees your job and resume data.</p>
            <span>{form.aiDefaultInstructions.trim().length} / 4000</span>
          </div>
        </div>
      </SectionCard>

      {error && (
        <p className="text-[13px] text-[#EF4444]">{error}</p>
      )}
      {saved && (
        <p className="text-[13px] text-[#22C55E] flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4" />
          Global AI settings saved.
        </p>
      )}

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#4F8CFF] hover:bg-[#4F8CFF]/90 text-white"
        >
          {saving
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
            : "Save AI Settings"}
        </Button>
      </div>
    </div>
  );
}
