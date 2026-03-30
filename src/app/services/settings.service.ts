import { api } from "./api";

export type ProviderStatus = "disconnected" | "validating" | "connected" | "error";

export interface AiProviderInfo {
  provider:        "openai" | "anthropic";
  status:          ProviderStatus;
  isDefault?:      boolean;
  keyHint?:        string;
  selectedModel?:  string;
  lastValidatedAt?: string;
  lastError?:      string;
}

export interface GlobalAiSettings {
  autoOptimizeAts?: boolean;
  includeCoverLetters?: boolean;
  notifyNewMatches?: boolean;
  notifyApplicationUpdates?: boolean;
  notifyWeeklySummary?: boolean;
  notifyAiInsights?: boolean;
  defaultAiProvider?: "openai" | "anthropic" | "other";
  aiTone?: "concise" | "impact-driven" | "technical";
  resumeStyle?: "ats-safe" | "balanced" | "human-friendly";
  bulletStyle?: "metrics-heavy" | "responsibility-focused";
  atsLevel?: "basic" | "balanced" | "aggressive";
  coverLetterTone?: "formal" | "friendly" | "confident";
  coverLetterLength?: "short" | "medium" | "detailed";
  coverLetterPersonalization?: "low" | "medium" | "high";
  noFakeExperience?: boolean;
  noChangeTitles?: boolean;
  noExaggerateMetrics?: boolean;
  onlyRephrase?: boolean;
  mirrorJobKeywords?: boolean;
  prioritizeRecentExperience?: boolean;
  keepBulletsConcise?: boolean;
  avoidFirstPerson?: boolean;
  emphasizeLeadership?: boolean;
  aiCustomRoles?: string[];
  aiDefaultInstructions?: string | null;
  resumeTitleFont?: "Playfair Display" | "Poppins" | "Space Grotesk" | "Merriweather" | "Libre Baskerville";
  resumeBodyFont?: "Source Sans 3" | "Inter" | "Lora" | "IBM Plex Sans" | "Work Sans";
  resumeAccentColor?: string;
  resumeTemplate?: "modern" | "classic" | "compact" | "product-owner" | "wordpress-operator";
  resumeDensity?: "comfortable" | "balanced" | "compact";
  useLegacyResumePreferencesForAi?: boolean;
}

export interface GmailIntegrationStatus {
  connected: boolean;
  email?: string;
  lastSyncAt?: string | null;
  lastError?: string | null;
  connectorActive: boolean;
}

export interface GmailSyncResult {
  message: string;
  synced: number;
  imported: number;
  skipped: number;
  scored: number;
  ready: number;
  errors: string[];
}

export const settingsService = {
  getPreferences: (): Promise<GlobalAiSettings> =>
    api.get<GlobalAiSettings>("/settings/preferences"),

  updatePreferences: (data: Partial<GlobalAiSettings>): Promise<{ message: string }> =>
    api.put<{ message: string }>("/settings/preferences", data),

  getAiProviders: (): Promise<AiProviderInfo[]> =>
    api.get<AiProviderInfo[]>("/settings/ai-providers"),

  connectProvider: (provider: string, apiKey: string): Promise<{
    message: string; status: string; keyHint: string; selectedModel: string;
  }> =>
    api.post("/settings/ai-providers", { provider, apiKey }),

  disconnectProvider: (provider: string): Promise<{ message: string }> =>
    api.delete(`/settings/ai-providers/${provider}`),

  testProvider: (provider: string): Promise<{ status: string; lastError: string | null }> =>
    api.post(`/settings/ai-providers/${provider}/test`, {}),

  setProviderModel: (provider: string, model: string): Promise<{ message: string; model: string }> =>
    api.put(`/settings/ai-providers/${provider}/model`, { model }),

  getGmailStatus: (): Promise<GmailIntegrationStatus> =>
    api.get<GmailIntegrationStatus>("/gmail/status"),

  getGmailConnectUrl: (): Promise<{ authUrl: string }> =>
    api.post<{ authUrl: string }>("/gmail/connect", {}),

  syncGmail: (): Promise<GmailSyncResult> =>
    api.post<GmailSyncResult>("/gmail/sync", {}),

  disconnectGmail: (): Promise<{ message: string }> =>
    api.delete<{ message: string }>("/gmail/disconnect"),

  improveResume: (data: {
    summary: string; keyAchievements: string; certifications: string;
    coreSkills: string[]; toolsTech: string[]; softSkills: string[];
    targetRoles: string[]; seniorityLevel: string; industryFocus: string[];
    mustHaveKeywords: string[]; yearsExperience: number;
  }): Promise<{
    summary: string | null;
    keyAchievements: string | null;
    suggestedKeywords: string[];
  }> => api.post("/settings/resume/improve", data),
};
