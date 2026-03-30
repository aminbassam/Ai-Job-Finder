import { api } from "./api";

export interface ProfileData {
  id: string;
  email: string;
  username?: string;
  firstName: string;
  lastName: string;
  location?: string;
  currentTitle?: string;
  linkedinUrl?: string;
  summary?: string;
  yearsExperience?: number;
  preferredLocation?: string;
  remoteOnly?: boolean;
  minSalary?: number;
  maxSalary?: number;
  skills: string[];
}

export interface UpdateProfileRequest {
  username?: string | null;
  firstName?: string;
  lastName?: string;
  location?: string;
  currentTitle?: string;
  linkedinUrl?: string;
  summary?: string;
  yearsExperience?: number;
  remoteOnly?: boolean;
  minSalary?: number;
  maxSalary?: number;
  skills?: string[];
}

export interface ResumePreferences {
  executiveSkills?: string;
  keyAchievements?: string;
  certifications?: string;
  toolsTechnologies: string[];
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

export const profileService = {
  getProfile: (): Promise<ProfileData> =>
    api.get<ProfileData>("/profile"),

  updateProfile: (data: UpdateProfileRequest): Promise<{ message: string }> =>
    api.put<{ message: string }>("/profile", data),

  getResumePreferences: (): Promise<Partial<ResumePreferences>> =>
    api.get<Partial<ResumePreferences>>("/settings/resume-preferences"),

  updateResumePreferences: (data: Partial<ResumePreferences>): Promise<{ message: string }> =>
    api.put<{ message: string }>("/settings/resume-preferences", data),
};
