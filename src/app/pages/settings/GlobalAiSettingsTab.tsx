import { useEffect, useMemo, useState } from "react";
import { Brain, Shield, Sparkles, Loader2, CheckCircle2, Wand2, Type, Palette } from "lucide-react";
import { Card } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Button } from "../../components/ui/button";
import { Switch } from "../../components/ui/switch";
import { TagInput } from "../../components/ui/tag-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
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
  | "resumeTitleFont"
  | "resumeBodyFont"
  | "resumeAccentColor"
  | "resumeTemplate"
  | "resumeDensity"
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
  aiCustomRoles: [],
  aiDefaultInstructions: "",
  resumeTitleFont: "Playfair Display",
  resumeBodyFont: "Source Sans 3",
  resumeAccentColor: "#2563EB",
  resumeTemplate: "modern",
  resumeDensity: "balanced",
};

const TITLE_FONT_OPTIONS = [
  "Playfair Display",
  "Poppins",
  "Space Grotesk",
  "Merriweather",
  "Libre Baskerville",
] as const;

const BODY_FONT_OPTIONS = [
  "Source Sans 3",
  "Inter",
  "Lora",
  "IBM Plex Sans",
  "Work Sans",
] as const;

const ACCENT_COLORS = [
  "#2563EB",
  "#0F766E",
  "#7C3AED",
  "#B45309",
  "#BE123C",
] as const;

const TEMPLATE_OPTIONS = [
  { value: "modern", label: "Modern", blurb: "Balanced accent-first layout." },
  { value: "classic", label: "Classic", blurb: "Traditional serif-forward format." },
  { value: "compact", label: "Compact", blurb: "Dense layout for maximum content." },
  { value: "product-owner", label: "Product Owner", blurb: "Inspired by the Uneekor product-owner resume." },
  { value: "wordpress-operator", label: "WordPress Operator", blurb: "Inspired by the LowCostPetVax technical operations resume." },
] as const;

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

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
          aiCustomRoles: prefs.aiCustomRoles ?? [],
          aiDefaultInstructions: prefs.aiDefaultInstructions ?? "",
          resumeTitleFont: prefs.resumeTitleFont ?? DEFAULTS.resumeTitleFont,
          resumeBodyFont: prefs.resumeBodyFont ?? DEFAULTS.resumeBodyFont,
          resumeAccentColor: prefs.resumeAccentColor ?? DEFAULTS.resumeAccentColor,
          resumeTemplate: prefs.resumeTemplate ?? DEFAULTS.resumeTemplate,
          resumeDensity: prefs.resumeDensity ?? DEFAULTS.resumeDensity,
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
      if (!isHexColor(form.resumeAccentColor)) {
        throw new Error("Resume accent color must be a full hex value like #1D4ED8.");
      }
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
        aiCustomRoles: form.aiCustomRoles,
        aiDefaultInstructions: form.aiDefaultInstructions,
        resumeTitleFont: form.resumeTitleFont,
        resumeBodyFont: form.resumeBodyFont,
        resumeAccentColor: form.resumeAccentColor,
        resumeTemplate: form.resumeTemplate,
        resumeDensity: form.resumeDensity,
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
        icon={<Type className="h-4 w-4 text-[#4F8CFF]" />}
        title="Resume Formatting"
        subtitle="Typography and layout defaults applied to generated resumes across the Job Board and document previews."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <FieldLabel hint="Used for the name and section headings.">Title Font</FieldLabel>
            <Select value={form.resumeTitleFont} onValueChange={(v) => update("resumeTitleFont", v as typeof form.resumeTitleFont)}>
              <SelectTrigger className="bg-[#0B0F14] border-[#1F2937] text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#111827] border-[#1F2937]">
                {TITLE_FONT_OPTIONS.map((font) => (
                  <SelectItem key={font} value={font} className="text-white focus:bg-[#1F2937]">
                    <span style={{ fontFamily: `'${font}', serif` }}>{font}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <FieldLabel hint="Used for paragraphs, bullets, and contact lines.">Body Font</FieldLabel>
            <Select value={form.resumeBodyFont} onValueChange={(v) => update("resumeBodyFont", v as typeof form.resumeBodyFont)}>
              <SelectTrigger className="bg-[#0B0F14] border-[#1F2937] text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#111827] border-[#1F2937]">
                {BODY_FONT_OPTIONS.map((font) => (
                  <SelectItem key={font} value={font} className="text-white focus:bg-[#1F2937]">
                    <span style={{ fontFamily: `'${font}', sans-serif` }}>{font}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <FieldLabel hint="Controls the overall visual style of generated resumes.">Resume Template</FieldLabel>
            <div className="grid gap-2">
              {TEMPLATE_OPTIONS.map((option) => {
                const selected = form.resumeTemplate === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => update("resumeTemplate", option.value as typeof form.resumeTemplate)}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      selected
                        ? "border-[#4F8CFF]/50 bg-[#4F8CFF]/10"
                        : "border-[#1F2937] bg-[#0B0F14] hover:border-[#374151]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[13px] font-semibold text-white">{option.label}</p>
                      {selected && <CheckCircle2 className="h-4 w-4 text-[#93C5FD]" />}
                    </div>
                    <p className="mt-1 text-[12px] text-[#6B7280]">{option.blurb}</p>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <FieldLabel hint="Controls spacing and content density in the formatted resume.">Layout Density</FieldLabel>
            <SegmentedControl
              value={form.resumeDensity}
              onChange={(v) => update("resumeDensity", v as typeof form.resumeDensity)}
              options={[
                { value: "comfortable", label: "Comfortable" },
                { value: "balanced", label: "Balanced" },
                { value: "compact", label: "Compact" },
              ]}
            />
          </div>
        </div>

        <div>
          <FieldLabel hint="Accent color used for section headings and decorative elements.">
            Accent Color
          </FieldLabel>
          <div className="flex flex-wrap gap-2">
            {ACCENT_COLORS.map((color) => {
              const selected = form.resumeAccentColor === color;
              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => update("resumeAccentColor", color)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] transition-colors ${
                    selected ? "border-white text-white" : "border-[#1F2937] text-[#9CA3AF] hover:text-white"
                  }`}
                >
                  <span className="h-4 w-4 rounded-full border border-white/20" style={{ backgroundColor: color }} />
                  {color}
                </button>
              );
            })}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-[120px,1fr]">
            <input
              type="color"
              value={isHexColor(form.resumeAccentColor) ? form.resumeAccentColor : DEFAULTS.resumeAccentColor}
              onChange={(event) => update("resumeAccentColor", event.target.value)}
              className="h-11 w-full cursor-pointer rounded-lg border border-[#1F2937] bg-[#0B0F14] p-1"
            />
            <input
              type="text"
              value={form.resumeAccentColor}
              onChange={(event) => update("resumeAccentColor", event.target.value)}
              placeholder="#2563EB"
              className={`h-11 rounded-lg border bg-[#0B0F14] px-3 text-[13px] text-white outline-none ${
                isHexColor(form.resumeAccentColor) || !form.resumeAccentColor
                  ? "border-[#1F2937] focus:border-[#4F8CFF]"
                  : "border-[#7F1D1D] focus:border-[#F87171]"
              }`}
            />
          </div>
          {!isHexColor(form.resumeAccentColor) && form.resumeAccentColor.trim().length > 0 && (
            <p className="mt-2 text-[11px] text-[#FCA5A5]">Use a full hex color like `#1D4ED8`.</p>
          )}
        </div>

        <div className="rounded-2xl border border-[#1F2937] bg-[#0B0F14] p-5">
          <div className="flex items-center gap-2 mb-4">
            <Palette className="h-4 w-4 text-[#4F8CFF]" />
            <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-[#6B7280]">Live Preview</p>
          </div>
          <div
            className={`rounded-xl bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.18)] ${
              form.resumeTemplate === "product-owner"
                ? "border-t-[6px]"
                : form.resumeTemplate === "wordpress-operator"
                  ? "border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.98),#ffffff_140px)]"
                  : form.resumeTemplate === "classic"
                    ? "border-t-[3px]"
                    : ""
            }`}
            style={{
              borderTopColor:
                form.resumeTemplate === "product-owner" || form.resumeTemplate === "classic"
                  ? form.resumeAccentColor
                  : undefined,
            }}
          >
            <p
              className="text-[30px] text-[#0F172A]"
              style={{ fontFamily: `'${form.resumeTitleFont}', serif` }}
            >
              Jordan Avery
            </p>
            <p
              className="mt-2 text-[13px] text-[#475569]"
              style={{ fontFamily: `'${form.resumeBodyFont}', sans-serif` }}
            >
              Austin, TX • jordan@jobflow.ai • linkedin.com/in/jordanavery
            </p>
            <div className="mt-5">
              <p
                className={`text-[12px] font-semibold uppercase ${
                  form.resumeTemplate === "wordpress-operator" ? "tracking-[0.14em]" : "tracking-[0.18em]"
                }`}
                style={{ color: form.resumeAccentColor, fontFamily: `'${form.resumeTitleFont}', serif` }}
              >
                Professional Summary
              </p>
              <p
                className="mt-2 text-[14px] text-[#1E293B]"
                style={{ fontFamily: `'${form.resumeBodyFont}', sans-serif` }}
              >
                Product-minded operator with a track record of building systems, improving conversion, and leading cross-functional teams through growth-stage change.
              </p>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        icon={<Brain className="h-4 w-4 text-[#4F8CFF]" />}
        title="AI Behaviour Control"
        subtitle="Global writing defaults used across resume generation, AI resume improvement, and other AI features."
      >
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
      </SectionCard>

      <SectionCard
        icon={<Sparkles className="h-4 w-4 text-[#4F8CFF]" />}
        title="Optimisation Settings"
        subtitle="Shared ATS and cover-letter defaults for AI-generated application materials."
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

        <div className="pt-1 border-t border-[#1F2937]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium text-white">Generate Cover Letters</p>
              <p className="text-[11px] text-[#6B7280] mt-0.5">Applies to all AI-assisted cover-letter flows.</p>
            </div>
            <Switch
              checked={form.includeCoverLetters}
              onCheckedChange={(v) => update("includeCoverLetters", v)}
            />
          </div>
        </div>

        {form.includeCoverLetters && (
          <div className="space-y-3 pt-1">
            <div>
              <FieldLabel>Cover Letter Tone</FieldLabel>
              <SegmentedControl
                value={form.coverLetterTone}
                onChange={(v) => update("coverLetterTone", v as typeof form.coverLetterTone)}
                options={[
                  { value: "formal", label: "Formal" },
                  { value: "confident", label: "Confident" },
                  { value: "friendly", label: "Friendly" },
                ]}
              />
            </div>
            <div>
              <FieldLabel>Cover Letter Length</FieldLabel>
              <SegmentedControl
                value={form.coverLetterLength}
                onChange={(v) => update("coverLetterLength", v as typeof form.coverLetterLength)}
                options={[
                  { value: "short", label: "Short" },
                  { value: "medium", label: "Medium" },
                  { value: "detailed", label: "Detailed" },
                ]}
              />
            </div>
            <div>
              <FieldLabel hint="How deeply the AI should tailor by company and role.">
                Personalisation Level
              </FieldLabel>
              <SegmentedControl
                value={form.coverLetterPersonalization}
                onChange={(v) => update("coverLetterPersonalization", v as typeof form.coverLetterPersonalization)}
                options={[
                  { value: "low", label: "Generic" },
                  { value: "medium", label: "Personalised" },
                  { value: "high", label: "Deep-dived" },
                ]}
              />
            </div>
          </div>
        )}
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
        subtitle="Set shared roles and default instructions that every AI feature should follow."
      >
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
          <FieldLabel hint="A default prompt applied globally to resume generation, AI resume improvement, and other AI flows.">
            Default Prompt Instructions
          </FieldLabel>
          <Textarea
            value={form.aiDefaultInstructions}
            onChange={(e) => update("aiDefaultInstructions", e.target.value)}
            placeholder="Example: Prioritize executive-level impact, keep claims conservative, and prefer measurable achievements when available."
            className="min-h-[140px] bg-[#0B0F14] border-[#1F2937] text-white placeholder:text-[#4B5563]"
          />
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
