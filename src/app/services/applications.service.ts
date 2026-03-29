import { api } from "./api";

export type ApplicationStatus =
  | "draft"
  | "ready"
  | "applied"
  | "interview"
  | "offer"
  | "accepted"
  | "rejected"
  | "withdrawn";

export interface ApplicationItem {
  id: string;
  jobId: string;
  jobTitle: string;
  company: string;
  status: ApplicationStatus;
  score: number;
  jobFitScore: number;
  resumeScore: number;
  resumeId?: string | null;
  resumeTitle?: string | null;
  appliedDate?: string | null;
  source: string;
  notes?: string | null;
  applicationUrl?: string | null;
}

export const applicationsService = {
  list: () => api.get<ApplicationItem[]>("/applications"),
  update: (id: string, data: { status?: ApplicationStatus; notes?: string; applicationUrl?: string }) =>
    api.put<{ message: string }>(`/applications/${id}`, data),
  createFromMatch: (jobMatchId: string) =>
    api.post<{
      id: string;
      score: number;
      jobFitScore: number;
      resumeScore: number;
      message: string;
    }>("/applications/from-match", { jobMatchId }),
};
