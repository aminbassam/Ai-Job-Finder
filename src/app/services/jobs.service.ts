/**
 * Jobs service — real API calls.
 *
 * Endpoints (backend/src/routes/jobs.ts):
 *   GET  /api/jobs
 *   GET  /api/jobs/:id
 *   POST /api/jobs/import-link
 *   POST /api/jobs/:id/score
 *   POST /api/jobs/:id/generate-resume
 *   POST /api/jobs/:id/generate-cover-letter
 */
import { api } from "./api";
import type { Job } from "../data/mockData";

export interface JobsFilter {
  query?: string;
  minScore?: number;
  status?: string;
  source?: string;
  remoteOnly?: boolean;
  page?: number;
  limit?: number;
}

export interface ScoreResult {
  score: number;
  recommendation: "reject" | "maybe" | "strong_fit";
  strengths: string[];
  gaps: string[];
  explanation: string;
}

export interface GenerateResumeResult {
  resumeId: string;
  downloadUrl: string;
}

export const jobsService = {
  getJobs: (filter?: JobsFilter): Promise<Job[]> => {
    const params = new URLSearchParams();
    if (filter?.query) params.set("query", filter.query);
    if (filter?.minScore !== undefined) params.set("minScore", String(filter.minScore));
    if (filter?.status && filter.status !== "all") params.set("status", filter.status);
    if (filter?.source) params.set("source", filter.source);
    if (filter?.remoteOnly) params.set("remoteOnly", "true");
    if (filter?.page) params.set("page", String(filter.page));
    if (filter?.limit) params.set("limit", String(filter.limit));
    const qs = params.toString();
    return api.get<Job[]>(`/jobs${qs ? `?${qs}` : ""}`);
  },

  getJob: (id: string): Promise<Job> =>
    api.get<Job>(`/jobs/${id}`),

  importLink: (url: string): Promise<{ jobId: string }> =>
    api.post<{ jobId: string }>("/jobs/import-link", { url }),

  scoreJob: (jobId: string): Promise<ScoreResult> =>
    api.post<ScoreResult>(`/jobs/${jobId}/score`, {}),

  generateResume: (jobId: string): Promise<GenerateResumeResult> =>
    api.post<GenerateResumeResult>(`/jobs/${jobId}/generate-resume`, {}),

  generateCoverLetter: (jobId: string): Promise<{ content: string }> =>
    api.post<{ content: string }>(`/jobs/${jobId}/generate-cover-letter`, {}),
};
