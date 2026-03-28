import { useState, useEffect, useRef, useCallback } from "react";
import {
  Target, Brain, Zap, Shield, BarChart2, Sparkles,
  CheckCircle2, AlertCircle, ChevronRight, FileText, Info,
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Button } from "../../components/ui/button";
import { Switch } from "../../components/ui/switch";
import { Slider } from "../../components/ui/slider";
import { TagInput } from "../../components/ui/tag-input";
import { profileService } from "../../services/profile.service";

// ── Inline helpers ────────────────────────────────────────────────────────────

interface SegOpt { value: string; label: string }
function SegmentedControl({ options, value, onChange }: {
  options: SegOpt[]; value: string; onChange: (v: string) => void;
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

function SectionCard({ icon, title, subtitle, children }: {
  icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode;
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

// ── Score calculation ─────────────────────────────────────────────────────────

interface FormState {
  summary: string;
  yearsExperience: number;
  coreSkills: string[];
  keyAchievements: string;
  certifications: string;
  toolsTech: string[];
  softSkills: string[];
  targetRoles: string[];
  seniorityLevel: string;
  industryFocus: string[];
  mustHaveKeywords: string[];
  aiTone: string;
  resumeStyle: string;
  bulletStyle: string;
  atsLevel: string;
  includeCoverLetters: boolean;
  coverLetterTone: string;
  coverLetterLength: string;
  coverLetterPersonalization: string;
  noFakeExperience: boolean;
  noChangeTitles: boolean;
  noExaggerateMetrics: boolean;
  onlyRephrase: boolean;
}

function calcScore(f: FormState): { score: number; missing: string[] } {
  const checks: [boolean, number, string][] = [
    [f.summary.length > 80,         15, "Professional summary (80+ chars)"],
    [f.coreSkills.length >= 3,       15, "Core skills (at least 3)"],
    [f.yearsExperience > 0,          10, "Years of experience"],
    [f.keyAchievements.length > 80,  15, "Key achievements (80+ chars)"],
    [f.targetRoles.length >= 1,      15, "Target roles (at least 1)"],
    [f.mustHaveKeywords.length >= 2, 10, "ATS keywords (at least 2)"],
    [f.toolsTech.length >= 1,        10, "Tools & technologies"],
    [f.industryFocus.length >= 1,     5, "Industry focus"],
    [!!f.seniorityLevel,              5, "Seniority level"],
  ];
  let score = 0;
  const missing: string[] = [];
  for (const [pass, pts, label] of checks) {
    if (pass) score += pts;
    else missing.push(label);
  }
  return { score, missing };
}

// ── Suggestions ───────────────────────────────────────────────────────────────

const ROLE_SUGGESTIONS = [
  "Software Engineer", "Senior Software Engineer", "Full Stack Developer",
  "Frontend Engineer", "Backend Engineer", "Product Manager",
  "Senior Product Manager", "Data Scientist", "ML Engineer",
  "DevOps Engineer", "Engineering Manager", "UX Designer",
  "Solutions Architect", "QA Engineer", "Data Analyst",
];

const INDUSTRY_SUGGESTIONS = [
  "Fintech", "SaaS", "E-commerce", "Healthcare", "EdTech",
  "PropTech", "Cybersecurity", "AI / ML", "Gaming", "Media",
  "Logistics", "Climate Tech", "B2B Enterprise", "Consumer Tech",
];

const TOOLS_SUGGESTIONS = [
  "React", "TypeScript", "Node.js", "Python", "PostgreSQL",
  "AWS", "Docker", "Kubernetes", "GraphQL", "Redis",
  "Terraform", "GitHub Actions", "Figma", "Jira", "Notion",
  "Datadog", "Stripe", "Salesforce", "Snowflake", "dbt",
];

const SKILLS_SUGGESTIONS = [
  "Product Management", "Agile / Scrum", "System Design",
  "API Design", "Data Analysis", "A/B Testing", "SQL",
  "Machine Learning", "CI/CD", "Technical Writing",
];

const SOFT_SKILLS_SUGGESTIONS = [
  "Leadership", "Cross-functional collaboration", "Communication",
  "Stakeholder management", "Mentoring", "Problem solving",
  "Strategic thinking", "Adaptability",
];

const KEYWORD_SUGGESTIONS = [
  "revenue growth", "cost reduction", "scalability",
  "user acquisition", "retention", "0 to 1", "platform migration",
  "distributed systems", "real-time", "high availability",
];

// ── Default state ─────────────────────────────────────────────────────────────

const DEFAULT_STATE: FormState = {
  summary: "",
  yearsExperience: 0,
  coreSkills: [],
  keyAchievements: "",
  certifications: "",
  toolsTech: [],
  softSkills: [],
  targetRoles: [],
  seniorityLevel: "mid",
  industryFocus: [],
  mustHaveKeywords: [],
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
};

// ── Main component ────────────────────────────────────────────────────────────

export function ResumePreferencesTab() {
  const [form, setForm] = useState<FormState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const secondsTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [secAgo, setSecAgo] = useState(0);

  // Load both profile and resume-prefs on mount
  useEffect(() => {
    Promise.all([
      profileService.getProfile().catch(() => null),
      profileService.getResumePreferences().catch(() => null),
    ]).then(([profile, prefs]) => {
      setForm({
        summary:               profile?.summary              ?? "",
        yearsExperience:       profile?.yearsExperience      ?? 0,
        coreSkills:            profile?.skills               ?? [],
        keyAchievements:       prefs?.keyAchievements        ?? "",
        certifications:        prefs?.certifications         ?? "",
        toolsTech:             prefs?.toolsTechnologies      ?? [],
        softSkills:            prefs?.softSkills             ?? [],
        targetRoles:           prefs?.targetRoles            ?? [],
        seniorityLevel:        prefs?.seniorityLevel         ?? "mid",
        industryFocus:         prefs?.industryFocus          ?? [],
        mustHaveKeywords:      prefs?.mustHaveKeywords       ?? [],
        aiTone:                prefs?.aiTone                 ?? "impact-driven",
        resumeStyle:           prefs?.resumeStyle            ?? "balanced",
        bulletStyle:           prefs?.bulletStyle            ?? "metrics-heavy",
        atsLevel:              prefs?.atsLevel               ?? "balanced",
        includeCoverLetters:   prefs?.includeCoverLetters    ?? true,
        coverLetterTone:       prefs?.coverLetterTone        ?? "confident",
        coverLetterLength:     prefs?.coverLetterLength      ?? "medium",
        coverLetterPersonalization: prefs?.coverLetterPersonalization ?? "medium",
        noFakeExperience:      prefs?.noFakeExperience       ?? true,
        noChangeTitles:        prefs?.noChangeTitles         ?? true,
        noExaggerateMetrics:   prefs?.noExaggerateMetrics    ?? true,
        onlyRephrase:          prefs?.onlyRephrase           ?? true,
      });
    }).finally(() => setLoading(false));

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (secondsTimer.current) clearInterval(secondsTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track seconds since last save
  useEffect(() => {
    if (saveStatus === "saved") {
      setSecAgo(0);
      if (secondsTimer.current) clearInterval(secondsTimer.current);
      secondsTimer.current = setInterval(() => setSecAgo((s) => s + 1), 1000);
    }
    return () => { if (secondsTimer.current) clearInterval(secondsTimer.current); };
  }, [saveStatus]);

  const save = useCallback(async (snapshot: FormState) => {
    setSaveStatus("saving");
    setError(null);
    try {
      await Promise.all([
        profileService.updateProfile({
          summary: snapshot.summary,
          yearsExperience: snapshot.yearsExperience,
          skills: snapshot.coreSkills,
        }),
        profileService.updateResumePreferences({
          keyAchievements:            snapshot.keyAchievements,
          certifications:             snapshot.certifications,
          toolsTechnologies:          snapshot.toolsTech,
          softSkills:                 snapshot.softSkills,
          targetRoles:                snapshot.targetRoles,
          seniorityLevel:             snapshot.seniorityLevel,
          industryFocus:              snapshot.industryFocus,
          mustHaveKeywords:           snapshot.mustHaveKeywords,
          aiTone:                     snapshot.aiTone,
          resumeStyle:                snapshot.resumeStyle,
          bulletStyle:                snapshot.bulletStyle,
          atsLevel:                   snapshot.atsLevel,
          includeCoverLetters:        snapshot.includeCoverLetters,
          coverLetterTone:            snapshot.coverLetterTone,
          coverLetterLength:          snapshot.coverLetterLength,
          coverLetterPersonalization: snapshot.coverLetterPersonalization,
          noFakeExperience:           snapshot.noFakeExperience,
          noChangeTitles:             snapshot.noChangeTitles,
          noExaggerateMetrics:        snapshot.noExaggerateMetrics,
          onlyRephrase:               snapshot.onlyRephrase,
        }),
      ]);
      setLastSaved(new Date());
      setSaveStatus("saved");
      setIsDirty(false);
    } catch (err) {
      setSaveStatus("idle");
      setError(err instanceof Error ? err.message : "Failed to save.");
    }
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      setIsDirty(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => save(next), 2000);
      return next;
    });
  }

  const { score, missing } = calcScore(form);
  const scoreColor = score >= 75 ? "#22C55E" : score >= 50 ? "#F59E0B" : "#EF4444";
  const r = 32;
  const circ = 2 * Math.PI * r;
  const dash = circ - (score / 100) * circ;

  const savedLabel =
    saveStatus === "saving"
      ? "Saving…"
      : saveStatus === "saved"
      ? secAgo < 5
        ? "Saved just now"
        : `Saved ${secAgo}s ago`
      : null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 justify-center text-[13px] text-[#9CA3AF]">
        <span className="animate-spin inline-block w-4 h-4 border-2 border-[#4F8CFF] border-t-transparent rounded-full" />
        Loading preferences…
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Sticky Resume Strength Score ──────────────────────────────────── */}
      <div className="sticky top-0 z-20 -mx-8 px-8 bg-[#0B0F14]/98 backdrop-blur-sm border-b border-[#1F2937] pb-3 pt-1">
        <Card className="bg-gradient-to-r from-[#111827] to-[#0D1117] border-[#1F2937] p-4">
          <div className="flex items-center gap-5">
            {/* SVG ring */}
            <div className="shrink-0">
              <svg width="76" height="76" viewBox="0 0 84 84">
                <circle cx="42" cy="42" r={r} fill="none" stroke="#1F2937" strokeWidth="6" />
                <circle
                  cx="42" cy="42" r={r}
                  fill="none" stroke={scoreColor} strokeWidth="6"
                  strokeDasharray={circ}
                  strokeDashoffset={dash}
                  strokeLinecap="round"
                  transform="rotate(-90 42 42)"
                  style={{ transition: "stroke-dashoffset 0.6s ease" }}
                />
                <text x="42" y="46" textAnchor="middle" fill="white" fontSize="17" fontWeight="700">{score}</text>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-[15px] font-semibold text-white">Resume Readiness Score</h3>
                <span
                  className="text-[11px] font-medium px-2 py-0.5 rounded-full border"
                  style={{ color: scoreColor, borderColor: `${scoreColor}40`, background: `${scoreColor}15` }}
                >
                  {score >= 75 ? "Strong" : score >= 50 ? "Moderate" : "Needs work"}
                </span>
                {/* Auto-save status inline */}
                <span className="ml-auto text-[11px] text-[#6B7280] flex items-center gap-1 shrink-0">
                  {saveStatus === "saving" && (
                    <>
                      <span className="animate-spin inline-block w-3 h-3 border border-[#4F8CFF] border-t-transparent rounded-full" />
                      Saving…
                    </>
                  )}
                  {saveStatus === "saved" && savedLabel && (
                    <span className="flex items-center gap-1 text-[#22C55E]">
                      <CheckCircle2 className="h-3 w-3" />
                      {savedLabel}
                    </span>
                  )}
                </span>
              </div>
              {missing.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {missing.map((m) => (
                    <span key={m} className="flex items-center gap-1 text-[11px] text-[#F59E0B] bg-[#F59E0B]/10 border border-[#F59E0B]/20 px-2 py-0.5 rounded-full">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      {m}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-[#22C55E] flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Profile is complete — AI is fully configured.
                </p>
              )}
            </div>
            <div className="shrink-0">
              <Button className="bg-[#4F8CFF] hover:bg-[#4F8CFF]/90 text-white text-[12px] gap-1.5 h-8">
                <Sparkles className="h-3.5 w-3.5" />
                Improve with AI
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Auto-save notice ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-[#4F8CFF]/5 border border-[#4F8CFF]/15">
        <Info className="h-4 w-4 text-[#4F8CFF] shrink-0" />
        <p className="text-[12px] text-[#6B7280]">
          All changes are <span className="text-[#4F8CFF] font-medium">automatically saved</span> as you type — no Save button needed.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[#EF4444]/5 border border-[#EF4444]/20 text-[12px] text-[#EF4444]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Section 1: Profile Core ───────────────────────────────────────── */}
      <SectionCard
        icon={<FileText className="h-4 w-4 text-[#4F8CFF]" />}
        title="Profile Core"
        subtitle="Foundational data that feeds into every resume generation"
      >
        <div>
          <FieldLabel hint="Tell the AI who you are — this becomes the resume intro.">
            Professional Summary
          </FieldLabel>
          <Textarea
            rows={4}
            value={form.summary}
            onChange={(e) => update("summary", e.target.value)}
            placeholder="Experienced software engineer with 6+ years building scalable B2B SaaS products…"
            className="bg-[#0B0F14] border-[#1F2937] text-white placeholder:text-[#4B5563] text-[13px]"
          />
          <p className="text-[11px] text-[#4B5563] mt-1">{form.summary.length} chars — 80+ recommended</p>
        </div>

        <div>
          <FieldLabel hint="Used to calibrate tone and role suggestions.">
            Years of Experience — <span className="text-white font-semibold">{form.yearsExperience} yr{form.yearsExperience !== 1 ? "s" : ""}</span>
          </FieldLabel>
          <div className="px-1 pt-2">
            <Slider
              min={0} max={25} step={1}
              value={[form.yearsExperience]}
              onValueChange={([v]) => update("yearsExperience", v)}
              className="[&_[data-slot=slider-range]]:bg-[#4F8CFF] [&_[data-slot=slider-track]]:bg-[#1F2937] [&_[data-slot=slider-thumb]]:border-[#4F8CFF] [&_[data-slot=slider-thumb]]:bg-[#0B0F14]"
            />
            <div className="flex justify-between text-[10px] text-[#4B5563] mt-1">
              <span>0</span><span>5</span><span>10</span><span>15</span><span>20</span><span>25</span>
            </div>
          </div>
        </div>

        <div>
          <FieldLabel hint="Bullet points of your best work. AI will use these for impact statements.">
            Key Achievements
          </FieldLabel>
          <Textarea
            rows={3}
            value={form.keyAchievements}
            onChange={(e) => update("keyAchievements", e.target.value)}
            placeholder="• Reduced API latency by 40% serving 2M+ req/day&#10;• Led migration from monolith to microservices (0 downtime)&#10;• Grew team from 3 to 12 engineers over 18 months"
            className="bg-[#0B0F14] border-[#1F2937] text-white placeholder:text-[#4B5563] text-[13px]"
          />
        </div>

        <div>
          <FieldLabel>Certifications (optional)</FieldLabel>
          <Textarea
            rows={2}
            value={form.certifications}
            onChange={(e) => update("certifications", e.target.value)}
            placeholder="AWS Solutions Architect, PMP, Google Analytics, etc."
            className="bg-[#0B0F14] border-[#1F2937] text-white placeholder:text-[#4B5563] text-[13px]"
          />
        </div>
      </SectionCard>

      {/* ── Section 2: Skills & Tools ─────────────────────────────────────── */}
      <SectionCard
        icon={<Zap className="h-4 w-4 text-[#4F8CFF]" />}
        title="Skills & Tools"
        subtitle="Categorized for smarter keyword matching — type and press Enter"
      >
        <div>
          <FieldLabel hint="Domain / professional skills (e.g. Product Management, System Design).">
            Core Skills
          </FieldLabel>
          <TagInput
            tags={form.coreSkills}
            onChange={(v) => update("coreSkills", v)}
            placeholder="Add a skill…"
            suggestions={SKILLS_SUGGESTIONS}
          />
        </div>

        <div>
          <FieldLabel hint="Software, frameworks, platforms (e.g. React, AWS, PostgreSQL).">
            Tools & Technologies
          </FieldLabel>
          <TagInput
            tags={form.toolsTech}
            onChange={(v) => update("toolsTech", v)}
            placeholder="Add a tool or technology…"
            suggestions={TOOLS_SUGGESTIONS}
          />
        </div>

        <div>
          <FieldLabel hint="Human skills that signal culture fit and leadership.">
            Soft Skills
          </FieldLabel>
          <TagInput
            tags={form.softSkills}
            onChange={(v) => update("softSkills", v)}
            placeholder="Add a soft skill…"
            suggestions={SOFT_SKILLS_SUGGESTIONS}
          />
        </div>
      </SectionCard>

      {/* ── Section 3: Target Strategy ────────────────────────────────────── */}
      <SectionCard
        icon={<Target className="h-4 w-4 text-[#4F8CFF]" />}
        title="Target Roles & Strategy"
        subtitle="Defines which jobs to match and how to score resume relevance"
      >
        <div>
          <FieldLabel hint="Roles you're actively applying for — AI uses these for job matching.">
            Desired Roles
          </FieldLabel>
          <TagInput
            tags={form.targetRoles}
            onChange={(v) => update("targetRoles", v)}
            placeholder="Add a role…"
            suggestions={ROLE_SUGGESTIONS}
          />
        </div>

        <div>
          <FieldLabel>Seniority Level</FieldLabel>
          <SegmentedControl
            value={form.seniorityLevel}
            onChange={(v) => update("seniorityLevel", v)}
            options={[
              { value: "junior",    label: "Junior"    },
              { value: "mid",       label: "Mid"       },
              { value: "senior",    label: "Senior"    },
              { value: "lead",      label: "Lead"      },
              { value: "executive", label: "Exec"      },
            ]}
          />
        </div>

        <div>
          <FieldLabel hint="Helps AI filter and prioritize job listings by vertical.">
            Industry Focus
          </FieldLabel>
          <TagInput
            tags={form.industryFocus}
            onChange={(v) => update("industryFocus", v)}
            placeholder="Add an industry…"
            suggestions={INDUSTRY_SUGGESTIONS}
          />
        </div>

        <div>
          <FieldLabel hint="Keywords that must appear in the generated resume to pass ATS filters.">
            Must-Have ATS Keywords
          </FieldLabel>
          <TagInput
            tags={form.mustHaveKeywords}
            onChange={(v) => update("mustHaveKeywords", v)}
            placeholder="Add a keyword…"
            suggestions={KEYWORD_SUGGESTIONS}
          />
        </div>
      </SectionCard>

      {/* ── Section 4: AI Behaviour Control ──────────────────────────────── */}
      <SectionCard
        icon={<Brain className="h-4 w-4 text-[#4F8CFF]" />}
        title="AI Behaviour Control"
        subtitle="Tell the AI how to write — tone, format, and focus"
      >
        <div>
          <FieldLabel hint="How the AI frames your experience.">Writing Tone</FieldLabel>
          <SegmentedControl
            value={form.aiTone}
            onChange={(v) => update("aiTone", v)}
            options={[
              { value: "concise",       label: "Concise"       },
              { value: "impact-driven", label: "Impact-driven" },
              { value: "technical",     label: "Technical"     },
            ]}
          />
          <p className="text-[11px] text-[#4B5563] mt-1.5">
            {form.aiTone === "concise"       && "Short, punchy bullets. No filler."}
            {form.aiTone === "impact-driven" && "Metric-led statements. Emphasises outcomes."}
            {form.aiTone === "technical"     && "Depth-first. Great for engineering roles."}
          </p>
        </div>

        <div>
          <FieldLabel hint="Output format — balances readability vs. machine parsing.">Resume Style</FieldLabel>
          <SegmentedControl
            value={form.resumeStyle}
            onChange={(v) => update("resumeStyle", v)}
            options={[
              { value: "ats-safe",      label: "ATS-safe"       },
              { value: "balanced",      label: "Balanced"        },
              { value: "human-friendly", label: "Human-friendly" },
            ]}
          />
          <p className="text-[11px] text-[#4B5563] mt-1.5">
            {form.resumeStyle === "ats-safe"       && "Plain structure, no tables. Optimised for parsers."}
            {form.resumeStyle === "balanced"       && "Clean layout that reads well for both humans and bots."}
            {form.resumeStyle === "human-friendly" && "Narrative flow, more personality. Best for startups."}
          </p>
        </div>

        <div>
          <FieldLabel hint="How each bullet is structured.">Bullet Style</FieldLabel>
          <SegmentedControl
            value={form.bulletStyle}
            onChange={(v) => update("bulletStyle", v)}
            options={[
              { value: "metrics-heavy",         label: "Metrics-heavy"         },
              { value: "responsibility-focused", label: "Responsibility-focused" },
            ]}
          />
          <p className="text-[11px] text-[#4B5563] mt-1.5">
            {form.bulletStyle === "metrics-heavy"         && "Led by numbers: \"Reduced churn by 18%…\""}
            {form.bulletStyle === "responsibility-focused" && "Led by action: \"Owned roadmap for…\""}
          </p>
        </div>
      </SectionCard>

      {/* ── Section 5: ATS Optimisation + Cover Letter ────────────────────── */}
      <SectionCard
        icon={<BarChart2 className="h-4 w-4 text-[#4F8CFF]" />}
        title="Optimisation Settings"
        subtitle="Fine-tune ATS keyword density and cover letter generation"
      >
        <div>
          <FieldLabel hint="How aggressively the AI stuffs keywords to beat ATS parsers.">
            ATS Optimisation Level
          </FieldLabel>
          <SegmentedControl
            value={form.atsLevel}
            onChange={(v) => update("atsLevel", v)}
            options={[
              { value: "basic",      label: "Basic"      },
              { value: "balanced",   label: "Balanced"   },
              { value: "aggressive", label: "Aggressive" },
            ]}
          />
          <div className="flex items-center gap-2 mt-2 p-2.5 rounded-lg bg-[#0B0F14] border border-[#1F2937]">
            <div className="flex gap-1 flex-1">
              {["basic","balanced","aggressive"].map((l) => (
                <div
                  key={l}
                  className="h-1 flex-1 rounded-full transition-all"
                  style={{ background: form.atsLevel === l || (form.atsLevel === "balanced" && l === "basic") || (form.atsLevel === "aggressive") ? "#4F8CFF" : "#1F2937" }}
                />
              ))}
            </div>
            <span className="text-[11px] text-[#6B7280]">
              {form.atsLevel === "basic"      && "Minimal keyword injection"}
              {form.atsLevel === "balanced"   && "Moderate density — recommended"}
              {form.atsLevel === "aggressive" && "Max keyword match — risk of over-stuffing"}
            </span>
          </div>
        </div>

        <div className="pt-1 border-t border-[#1F2937]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium text-white">Generate Cover Letters</p>
              <p className="text-[11px] text-[#6B7280] mt-0.5">Personalised cover letter per application</p>
            </div>
            <Switch
              checked={form.includeCoverLetters}
              onCheckedChange={(v) => update("includeCoverLetters", v)}
            />
          </div>
        </div>

        {form.includeCoverLetters && (
          <div className="space-y-3 pl-0 pt-1">
            <div>
              <FieldLabel>Cover Letter Tone</FieldLabel>
              <SegmentedControl
                value={form.coverLetterTone}
                onChange={(v) => update("coverLetterTone", v)}
                options={[
                  { value: "formal",     label: "Formal"     },
                  { value: "confident",  label: "Confident"  },
                  { value: "friendly",   label: "Friendly"   },
                ]}
              />
            </div>
            <div>
              <FieldLabel>Length</FieldLabel>
              <SegmentedControl
                value={form.coverLetterLength}
                onChange={(v) => update("coverLetterLength", v)}
                options={[
                  { value: "short",    label: "Short (~150 words)"   },
                  { value: "medium",   label: "Medium (~250 words)"  },
                  { value: "detailed", label: "Detailed (~400 words)" },
                ]}
              />
            </div>
            <div>
              <FieldLabel hint="How much the letter references the specific company and role.">
                Personalisation Level
              </FieldLabel>
              <SegmentedControl
                value={form.coverLetterPersonalization}
                onChange={(v) => update("coverLetterPersonalization", v)}
                options={[
                  { value: "low",    label: "Generic"       },
                  { value: "medium", label: "Personalised"  },
                  { value: "high",   label: "Deep-dived"    },
                ]}
              />
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── Section 6: AI Safety Rules ────────────────────────────────────── */}
      <SectionCard
        icon={<Shield className="h-4 w-4 text-[#4F8CFF]" />}
        title="AI Safety Rules"
        subtitle="Guardrails that prevent the AI from misrepresenting your experience"
      >
        {(
          [
            ["noFakeExperience",    "Do not add fake experience",       "AI will never invent jobs, projects, or skills you haven't listed."],
            ["noChangeTitles",      "Do not change job titles",          "Your exact titles are preserved — no promotion inflation."],
            ["noExaggerateMetrics", "Do not exaggerate metrics",         "Numbers in your key achievements are used verbatim."],
            ["onlyRephrase",        "Only rephrase & reorder content",   "AI restructures for clarity but never adds new facts."],
          ] as [keyof FormState, string, string][]
        ).map(([key, label, desc]) => (
          <div key={key} className="flex items-start justify-between gap-4 py-1">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-white">{label}</p>
              <p className="text-[11px] text-[#6B7280] mt-0.5">{desc}</p>
            </div>
            <Switch
              checked={form[key] as boolean}
              onCheckedChange={(v) => update(key, v)}
            />
          </div>
        ))}
      </SectionCard>
    </div>
  );
}
