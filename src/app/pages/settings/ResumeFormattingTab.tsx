import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Palette, Type } from "lucide-react";
import { Card } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
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
    <Card className="border-[#1F2937] bg-[#111827] p-5">
      <div className="mb-5 flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#4F8CFF]/10">
          {icon}
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-white">{title}</h3>
          <p className="mt-0.5 text-[12px] text-[#6B7280]">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5">
      <Label className="text-[12px] font-medium uppercase tracking-wide text-[#9CA3AF]">{children}</Label>
      {hint && <p className="mt-0.5 text-[11px] text-[#4B5563]">{hint}</p>}
    </div>
  );
}

const DEFAULTS: Required<Pick<
  GlobalAiSettings,
  | "resumeTitleFont"
  | "resumeBodyFont"
  | "resumeAccentColor"
  | "resumeTemplate"
  | "resumeDensity"
>> = {
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
  { value: "modern", label: "Template 1", blurb: "Balanced accent-first layout." },
  { value: "classic", label: "Template 2", blurb: "Traditional serif-forward format." },
  { value: "compact", label: "Template 3", blurb: "Dense layout for maximum content." },
  { value: "product-owner", label: "Template 4", blurb: "Bold product-focused layout." },
  { value: "wordpress-operator", label: "Template 5", blurb: "Technical operations layout." },
] as const;

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

export function ResumeFormattingTab() {
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
        resumeTitleFont: form.resumeTitleFont,
        resumeBodyFont: form.resumeBodyFont,
        resumeAccentColor: form.resumeAccentColor,
        resumeTemplate: form.resumeTemplate,
        resumeDensity: form.resumeDensity,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save resume formatting.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-[13px] text-[#9CA3AF]">
        <Loader2 className="h-4 w-4 animate-spin text-[#4F8CFF]" />
        Loading resume formatting…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionCard
        icon={<Type className="h-4 w-4 text-[#4F8CFF]" />}
        title="Resume Formatting"
        subtitle="Visual defaults used for generated resumes, previews, and exported resume files."
      >
        <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#6B7280]">What this controls</p>
          <div className="mt-3 grid gap-2 text-[13px] text-[#9CA3AF] md:grid-cols-2">
            <p>Title and body fonts for generated resumes</p>
            <p>Template layout and overall visual style</p>
            <p>Accent color for headings and dividers</p>
            <p>Spacing density for compact vs balanced output</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <FieldLabel hint="Used for the name and section headings.">Title Font</FieldLabel>
            <Select value={form.resumeTitleFont} onValueChange={(v) => update("resumeTitleFont", v as typeof form.resumeTitleFont)}>
              <SelectTrigger className="border-[#1F2937] bg-[#0B0F14] text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-[#1F2937] bg-[#111827]">
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
              <SelectTrigger className="border-[#1F2937] bg-[#0B0F14] text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-[#1F2937] bg-[#111827]">
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
          <FieldLabel hint="Accent color used for section headings and decorative elements.">Accent Color</FieldLabel>
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
            <p className="mt-2 text-[11px] text-[#FCA5A5]">Use a full hex color like #1D4ED8.</p>
          )}
        </div>

        <div className="rounded-2xl border border-[#1F2937] bg-[#0B0F14] p-5">
          <div className="mb-4 flex items-center gap-2">
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
            <p className="text-[30px] text-[#0F172A]" style={{ fontFamily: `'${form.resumeTitleFont}', serif` }}>
              Jordan Avery
            </p>
            <p className="mt-2 text-[13px] text-[#475569]" style={{ fontFamily: `'${form.resumeBodyFont}', sans-serif` }}>
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
              <p className="mt-2 text-[14px] text-[#1E293B]" style={{ fontFamily: `'${form.resumeBodyFont}', sans-serif` }}>
                Product-minded operator with a track record of building systems, improving conversion, and leading cross-functional teams through growth-stage change.
              </p>
            </div>
          </div>
        </div>
      </SectionCard>

      {error && <p className="text-[13px] text-[#EF4444]">{error}</p>}
      {saved && (
        <p className="flex items-center gap-1.5 text-[13px] text-[#22C55E]">
          <CheckCircle2 className="h-4 w-4" />
          Resume formatting saved.
        </p>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="bg-[#4F8CFF] text-white hover:bg-[#4F8CFF]/90">
          {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : "Save Formatting"}
        </Button>
      </div>
    </div>
  );
}
