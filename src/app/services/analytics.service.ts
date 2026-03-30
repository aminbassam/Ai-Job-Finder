import { api } from "./api";

export interface DashboardAnalytics {
  jobsFoundToday: number;
  highMatchJobs: number;
  resumesGenerated: number;
  applicationsSent: number;
}

export interface JobsPerWeekPoint {
  week: string;
  jobs: number;
}

export interface SourcePerformancePoint {
  source: string;
  jobs: number;
  avgScore: number;
}

export interface FunnelPoint {
  stage: string;
  count: number;
}

export interface ScoreDistributionPoint {
  range: string;
  count: number;
}

export const analyticsService = {
  getDashboard: () => api.get<DashboardAnalytics>("/analytics/dashboard"),
  getJobsPerWeek: () => api.get<JobsPerWeekPoint[]>("/analytics/jobs-per-week"),
  getSourcePerformance: () => api.get<SourcePerformancePoint[]>("/analytics/source-performance"),
  getFunnel: () => api.get<FunnelPoint[]>("/analytics/funnel"),
  getScoreDistribution: () => api.get<ScoreDistributionPoint[]>("/analytics/score-distribution"),
};
