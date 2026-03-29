import { pool } from "../db/pool";
import {
  DEFAULT_RESUME_FORMATTING,
  normalizeResumeFormatting,
  type ResumeBodyFont,
  type ResumeDensity,
  type ResumeTemplate,
  type ResumeTitleFont,
} from "./resume-renderer";

export interface GlobalAiSettings {
  aiTone: "concise" | "impact-driven" | "technical";
  resumeStyle: "ats-safe" | "balanced" | "human-friendly";
  bulletStyle: "metrics-heavy" | "responsibility-focused";
  atsLevel: "basic" | "balanced" | "aggressive";
  includeCoverLetters: boolean;
  coverLetterTone: "formal" | "friendly" | "confident";
  coverLetterLength: "short" | "medium" | "detailed";
  coverLetterPersonalization: "low" | "medium" | "high";
  noFakeExperience: boolean;
  noChangeTitles: boolean;
  noExaggerateMetrics: boolean;
  onlyRephrase: boolean;
  aiCustomRoles: string[];
  aiDefaultInstructions: string;
  resumeTitleFont: ResumeTitleFont;
  resumeBodyFont: ResumeBodyFont;
  resumeAccentColor: string;
  resumeTemplate: ResumeTemplate;
  resumeDensity: ResumeDensity;
}

const DEFAULT_AI_SETTINGS: GlobalAiSettings = {
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
  resumeTitleFont: DEFAULT_RESUME_FORMATTING.titleFont,
  resumeBodyFont: DEFAULT_RESUME_FORMATTING.bodyFont,
  resumeAccentColor: DEFAULT_RESUME_FORMATTING.accentColor,
  resumeTemplate: DEFAULT_RESUME_FORMATTING.template,
  resumeDensity: DEFAULT_RESUME_FORMATTING.density,
};

export async function getGlobalAiSettings(userId: string): Promise<GlobalAiSettings> {
  const { rows } = await pool.query<Record<string, unknown>>(
    `SELECT ai_tone, resume_style, bullet_style, ats_level, include_cover_letters,
            cover_letter_tone, cover_letter_length, cover_letter_personalization,
            no_fake_experience, no_change_titles, no_exaggerate_metrics, only_rephrase,
            ai_custom_roles, ai_default_instructions,
            resume_title_font, resume_body_font, resume_accent_color, resume_template, resume_density
     FROM user_preferences
     WHERE user_id = $1`,
    [userId]
  );

  const row = rows[0];
  if (!row) return DEFAULT_AI_SETTINGS;

  const resumeFormatting = normalizeResumeFormatting({
    titleFont: typeof row.resume_title_font === "string" ? row.resume_title_font : undefined,
    bodyFont: typeof row.resume_body_font === "string" ? row.resume_body_font : undefined,
    accentColor: typeof row.resume_accent_color === "string" ? row.resume_accent_color : undefined,
    template: typeof row.resume_template === "string" ? row.resume_template : undefined,
    density: typeof row.resume_density === "string" ? row.resume_density : undefined,
  });

  return {
    aiTone: (row.ai_tone as GlobalAiSettings["aiTone"]) ?? DEFAULT_AI_SETTINGS.aiTone,
    resumeStyle: (row.resume_style as GlobalAiSettings["resumeStyle"]) ?? DEFAULT_AI_SETTINGS.resumeStyle,
    bulletStyle: (row.bullet_style as GlobalAiSettings["bulletStyle"]) ?? DEFAULT_AI_SETTINGS.bulletStyle,
    atsLevel: (row.ats_level as GlobalAiSettings["atsLevel"]) ?? DEFAULT_AI_SETTINGS.atsLevel,
    includeCoverLetters: row.include_cover_letters === undefined ? DEFAULT_AI_SETTINGS.includeCoverLetters : Boolean(row.include_cover_letters),
    coverLetterTone: (row.cover_letter_tone as GlobalAiSettings["coverLetterTone"]) ?? DEFAULT_AI_SETTINGS.coverLetterTone,
    coverLetterLength: (row.cover_letter_length as GlobalAiSettings["coverLetterLength"]) ?? DEFAULT_AI_SETTINGS.coverLetterLength,
    coverLetterPersonalization:
      (row.cover_letter_personalization as GlobalAiSettings["coverLetterPersonalization"]) ??
      DEFAULT_AI_SETTINGS.coverLetterPersonalization,
    noFakeExperience: row.no_fake_experience === undefined ? DEFAULT_AI_SETTINGS.noFakeExperience : Boolean(row.no_fake_experience),
    noChangeTitles: row.no_change_titles === undefined ? DEFAULT_AI_SETTINGS.noChangeTitles : Boolean(row.no_change_titles),
    noExaggerateMetrics:
      row.no_exaggerate_metrics === undefined ? DEFAULT_AI_SETTINGS.noExaggerateMetrics : Boolean(row.no_exaggerate_metrics),
    onlyRephrase: row.only_rephrase === undefined ? DEFAULT_AI_SETTINGS.onlyRephrase : Boolean(row.only_rephrase),
    aiCustomRoles: Array.isArray(row.ai_custom_roles) ? (row.ai_custom_roles as string[]) : [],
    aiDefaultInstructions: typeof row.ai_default_instructions === "string" ? row.ai_default_instructions : "",
    resumeTitleFont: resumeFormatting.titleFont,
    resumeBodyFont: resumeFormatting.bodyFont,
    resumeAccentColor: resumeFormatting.accentColor,
    resumeTemplate: resumeFormatting.template,
    resumeDensity: resumeFormatting.density,
  };
}

export function buildAiSystemPrompt(basePrompt: string, settings: GlobalAiSettings): string {
  const parts = [basePrompt.trim()];

  if (settings.aiCustomRoles.length > 0) {
    parts.push(`Adopt these standing roles when responding: ${settings.aiCustomRoles.join(", ")}.`);
  }

  parts.push(`Writing tone: ${settings.aiTone}. Resume style: ${settings.resumeStyle}. Bullet style: ${settings.bulletStyle}. ATS optimisation: ${settings.atsLevel}.`);

  const safetyRules = [
    settings.noFakeExperience ? "Never invent experience, projects, or skills." : null,
    settings.noChangeTitles ? "Do not change the candidate's original job titles." : null,
    settings.noExaggerateMetrics ? "Do not exaggerate or fabricate metrics." : null,
    settings.onlyRephrase ? "Only rephrase, reorder, and clarify facts already supported by the provided data." : null,
  ].filter(Boolean);

  if (safetyRules.length > 0) {
    parts.push(`Safety rules: ${safetyRules.join(" ")}`);
  }

  if (settings.aiDefaultInstructions.trim()) {
    parts.push(`Additional default instructions to always follow:\n${settings.aiDefaultInstructions.trim()}`);
  }

  parts.push(
    `Resume formatting defaults: title font ${settings.resumeTitleFont}, body font ${settings.resumeBodyFont}, template ${settings.resumeTemplate}, density ${settings.resumeDensity}, accent color ${settings.resumeAccentColor}.`
  );

  return parts.join("\n\n");
}

export function buildAiPreferenceNotes(settings: GlobalAiSettings): string[] {
  const notes = [
    `Preferred tone: ${settings.aiTone}`,
    `Preferred resume style: ${settings.resumeStyle}`,
    `Preferred bullet style: ${settings.bulletStyle}`,
    `ATS optimisation level: ${settings.atsLevel}`,
    `Cover letter generation: ${settings.includeCoverLetters ? "enabled" : "disabled"}`,
  ];

  if (settings.includeCoverLetters) {
    notes.push(`Cover letter tone: ${settings.coverLetterTone}`);
    notes.push(`Cover letter length: ${settings.coverLetterLength}`);
    notes.push(`Cover letter personalization: ${settings.coverLetterPersonalization}`);
  }

  if (settings.aiCustomRoles.length > 0) {
    notes.push(`Custom AI roles: ${settings.aiCustomRoles.join(", ")}`);
  }

  if (settings.aiDefaultInstructions.trim()) {
    notes.push(`Default AI instructions: ${settings.aiDefaultInstructions.trim()}`);
  }

  notes.push(`Resume title font: ${settings.resumeTitleFont}`);
  notes.push(`Resume body font: ${settings.resumeBodyFont}`);
  notes.push(`Resume template: ${settings.resumeTemplate}`);
  notes.push(`Resume density: ${settings.resumeDensity}`);

  return notes;
}
