/**
 * Jobs service
 *
 * Wraps all job-related API endpoints. Currently uses in-memory mock data.
 * Replace each function body with the commented-out api call when a real
 * backend is available.
 *
 * Real endpoints (see architecture doc §11):
 *   GET    /api/jobs
 *   GET    /api/jobs/:id
 *   POST   /api/jobs/import-link
 *   POST   /api/jobs/:id/score
 *   POST   /api/jobs/:id/generate-resume
 *   POST   /api/jobs/:id/generate-cover-letter
 */

// import { api } from "./api";
import { mockJobs, type Job } from "../data/mockData";

export interface JobsFilter {
  status?: string;
  minScore?: number;
  source?: string;
  query?: string;
  remoteOnly?: boolean;
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
  getJobs: async (filter?: JobsFilter): Promise<Job[]> => {
    // return api.get<Job[]>("/jobs?" + new URLSearchParams(filter as Record<string, string>));
    await delay(300);
    let jobs = [...mockJobs];

    if (filter?.query) {
      const q = filter.query.toLowerCase();
      jobs = jobs.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          j.company.toLowerCase().includes(q) ||
          j.description.toLowerCase().includes(q)
      );
    }
    if (filter?.minScore !== undefined) {
      jobs = jobs.filter((j) => j.score >= filter.minScore!);
    }
    if (filter?.status && filter.status !== "all") {
      jobs = jobs.filter((j) => j.status === filter.status);
    }
    if (filter?.source) {
      jobs = jobs.filter((j) => j.source === filter.source);
    }
    if (filter?.remoteOnly) {
      jobs = jobs.filter(
        (j) =>
          j.location.toLowerCase().includes("remote") ||
          j.tags.some((t) => t.toLowerCase() === "remote")
      );
    }

    return jobs;
  },

  getJob: async (id: string): Promise<Job | null> => {
    // return api.get<Job>(`/jobs/${id}`);
    await delay(200);
    return mockJobs.find((j) => j.id === id) ?? null;
  },

  importLink: async (url: string): Promise<{ jobId: string }> => {
    // return api.post<{ jobId: string }>("/jobs/import-link", { url });
    await delay(1500);
    return { jobId: `imported_${Date.now()}` };
  },

  scoreJob: async (jobId: string): Promise<ScoreResult> => {
    // return api.post<ScoreResult>(`/jobs/${jobId}/score`, {});
    await delay(2000);
    const score = Math.floor(Math.random() * 30) + 70;
    return {
      score,
      recommendation: score >= 70 ? "strong_fit" : score >= 50 ? "maybe" : "reject",
      strengths: [
        "Strong alignment with required skills",
        "Relevant domain experience",
        "Location match",
      ],
      gaps: [
        "Could emphasize leadership experience",
        "Add specific metrics to resume",
      ],
      explanation: `This role scored ${score}/100 based on your profile analysis.`,
    };
  },

  generateResume: async (jobId: string): Promise<GenerateResumeResult> => {
    // return api.post<GenerateResumeResult>(`/jobs/${jobId}/generate-resume`, {});
    await delay(3000);
    return {
      resumeId: `resume_${jobId}_${Date.now()}`,
      downloadUrl: "#",
    };
  },

  generateCoverLetter: async (jobId: string): Promise<{ content: string }> => {
    // return api.post<{ content: string }>(`/jobs/${jobId}/generate-cover-letter`, {});
    await delay(2500);
    return {
      content: `Dear Hiring Manager,\n\nI am excited to apply for this position...`,
    };
  },
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
