import { api } from "./api";

export interface MasterResumeBullet {
  id?: string;
  description: string;
  tools: string[];
  keywords: string[];
}

export interface MasterResumeCustomSection {
  id?: string;
  name: string;
  description: string;
  tools: string[];
  keywords: string[];
}

export interface MasterResumeExperience {
  id?: string;
  title: string;
  company: string;
  startDate?: string | null;
  endDate?: string | null;
  bullets: MasterResumeBullet[];
}

export interface MasterResumeSkills {
  core: string[];
  tools: string[];
  soft: string[];
  certifications: string[];
}

export interface MasterResumeEducation {
  id?: string;
  school: string;
  degree?: string;
  fieldOfStudy?: string;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string;
}

export interface MasterResumeProject {
  id?: string;
  name: string;
  role?: string;
  description?: string;
  tools: string[];
  teamSize?: number | null;
  outcome?: string;
  metrics?: string;
}

export interface MasterResumeLeadership {
  teamSize?: number | null;
  scope?: string;
  stakeholders: string[];
  budget?: string;
}

export interface MasterResumeProfile {
  id: string;
  masterResumeId: string;
  sourceImportId?: string | null;
  name: string;
  targetRoles: string[];
  summary?: string | null;
  experienceYears: number;
  isActive: boolean;
  useForAi: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  experiences: MasterResumeExperience[];
  skills: MasterResumeSkills;
  education: MasterResumeEducation[];
  projects: MasterResumeProject[];
  leadership?: MasterResumeLeadership | null;
  customSections: MasterResumeCustomSection[];
}

export type MasterResumeProfileInput = Omit<
  MasterResumeProfile,
  "id" | "masterResumeId" | "createdAt" | "updatedAt"
>;

export interface ResumeImportRecord {
  id: string;
  sourceType: "linkedin" | "upload";
  sourceUrl?: string | null;
  fileName?: string | null;
  rawText: string;
  parsedJson: Record<string, unknown>;
  createdAt: string;
}

export interface MatchedJobSuggestion {
  id: string;
  title: string;
  company?: string;
  location?: string;
  remote?: boolean;
  aiScore?: number;
  matchTier?: string;
  sourceUrl?: string;
  status: string;
}

export interface ResumeScoreResult {
  atsScore: number;
  impactScore: number;
  completenessScore: number;
  mqMatch: {
    matchScore: number;
    matchedSkills: string[];
    missingSkills: string[];
  };
  suggestions: string[];
  keywordCoverage: {
    matched: string[];
    missing: string[];
  };
}

export const masterResumeService = {
  listProfiles: () => api.get<MasterResumeProfile[]>("/master-resume/profiles"),
  getProfile: (id: string) => api.get<MasterResumeProfile>(`/master-resume/profiles/${id}`),
  createProfile: (data: MasterResumeProfileInput) => api.post<MasterResumeProfile>("/master-resume/profiles", data),
  updateProfile: (id: string, data: MasterResumeProfileInput) => api.put<MasterResumeProfile>(`/master-resume/profiles/${id}`, data),
  deleteProfile: (id: string) => api.delete<{ ok: boolean }>(`/master-resume/profiles/${id}`),
  listImports: () => api.get<ResumeImportRecord[]>("/master-resume/imports"),
  createProfileFromImport: (data: { importId: string; name?: string; isActive?: boolean; useForAi?: boolean; isDefault?: boolean }) =>
    api.post<MasterResumeProfile>("/master-resume/profiles/from-import", data),

  parseLinkedIn: (data: { url: string; profileName?: string; createProfile?: boolean; isActive?: boolean; useForAi?: boolean; isDefault?: boolean }) =>
    api.post<{
      importId: string;
      rawText: string;
      parsed: Record<string, unknown>;
      profile?: MasterResumeProfile | null;
    }>("/ai/parse-linkedin", data),

  parseResume: (data: { fileName: string; mimeType: string; base64: string; profileName?: string; createProfile?: boolean; isActive?: boolean; useForAi?: boolean; isDefault?: boolean }) =>
    api.post<{
      importId: string;
      rawText: string;
      parsed: Record<string, unknown>;
      profile?: MasterResumeProfile | null;
    }>("/ai/parse-resume", data),

  generateSummary: (profileId: string) =>
    api.post<{ summary: string }>("/ai/generate-summary", { profileId }),

  generateBullets: (data: { profileId?: string; title: string; company: string; roleContext?: string; rawBullets: string[] }) =>
    api.post<{ bullets: MasterResumeBullet[] }>("/ai/generate-bullets", data),

  scoreResume: (data: { profileId: string; jobTitle?: string; jobDescription: string }) =>
    api.post<ResumeScoreResult>("/ai/score-resume", data),

  getMatchedJobs: (profileId: string) =>
    api.get<MatchedJobSuggestion[]>(`/master-resume/profiles/${profileId}/matched-jobs`),
};
