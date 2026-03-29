import { api } from "./api";

/* ──────────────────── Types ─────────────────────────────────────────── */

export interface SearchProfile {
  id: string;
  name: string;
  jobTitles: string[];
  locations: string[];
  remoteOnly: boolean;
  includeNearby: boolean;
  salaryMin?: number | null;
  salaryMax?: number | null;
  experienceLevels: string[];
  jobTypes: string[];
  postedWithinDays?: number | null;
  mustHaveKeywords: string[];
  niceToHaveKeywords: string[];
  excludedCompanies: string[];
  includedCompanies: string[];
  companySizes: string[];
  sources: string[];
  searchMode: "strict" | "balanced" | "broad";
  scoreThreshold: number;
  autoResume: boolean;
  schedule: "6h" | "daily" | "weekdays" | "custom" | "manual";
  scheduleIntervalMinutes?: number | null;
  isActive: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
  totalMatches?: number;
  strongMatches?: number;
}

export interface JobMatch {
  id: string;
  profileId?: string;
  profileName?: string;
  externalId?: string;
  source: string;
  sourceUrl?: string;
  title: string;
  company?: string;
  location?: string;
  remote?: boolean;
  jobType?: string;
  description?: string;
  salaryMin?: number;
  salaryMax?: number;
  requirements?: string[];
  aiScore?: number;
  aiSummary?: string;
  scoreBreakdown?: {
    skillsMatch: number;
    experienceMatch: number;
    roleAlignment: number;
    locationSalaryFit: number;
    reasoning?: string;
    strengths?: string[];
    weaknesses?: string[];
    areasToAddress?: string[];
    error?: string;
  };
  matchTier?: "strong" | "maybe" | "weak" | "reject" | "new";
  scoredAt?: string;
  status: "new" | "viewed" | "saved" | "applied" | "dismissed";
  resumeGenerated?: boolean;
  notes?: string;
  postedAt?: string;
  createdAt: string;
}

export interface ConnectorConfig {
  connector: string;
  isActive: boolean;
  config: Record<string, unknown>;
  lastSyncAt?: string;
  lastError?: string;
  jobCount?: number;
}

export interface AgentRun {
  id: string;
  profileId?: string;
  profileName?: string;
  trigger: "schedule" | "manual";
  status: "running" | "completed" | "failed";
  jobsFound: number;
  jobsNew: number;
  jobsScored: number;
  strongMatches: number;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

export type ProfileInput = Omit<SearchProfile, "id" | "createdAt" | "lastRunAt" | "nextRunAt" | "totalMatches" | "strongMatches">;

/* ──────────────────── Profiles ──────────────────────────────────────── */

export const getProfiles = () =>
  api.get<SearchProfile[]>("/agent/profiles");

export const createProfile = (data: Partial<ProfileInput>) =>
  api.post<SearchProfile>("/agent/profiles", data);

export const updateProfile = (id: string, data: Partial<ProfileInput>) =>
  api.put<SearchProfile>(`/agent/profiles/${id}`, data);

export const deleteProfile = (id: string) =>
  api.delete<{ ok: boolean }>(`/agent/profiles/${id}`);

export const runProfile = (id: string) =>
  api.post<{ runId: string; message: string }>(`/agent/profiles/${id}/run`, {});

/* ──────────────────── Connectors ────────────────────────────────────── */

export const getConnectors = () =>
  api.get<ConnectorConfig[]>("/agent/connectors");

export const saveConnector = (connector: string, data: Partial<ConnectorConfig>) =>
  api.put<ConnectorConfig>(`/agent/connectors/${connector}`, data);

/* ──────────────────── Results ───────────────────────────────────────── */

export interface ResultsQuery {
  tier?: string;
  status?: string;
  profileId?: string;
  limit?: number;
  offset?: number;
}

export const getResults = (q: ResultsQuery = {}) => {
  const params = new URLSearchParams();
  if (q.tier) params.set("tier", q.tier);
  if (q.status) params.set("status", q.status);
  if (q.profileId) params.set("profileId", q.profileId);
  if (q.limit) params.set("limit", String(q.limit));
  if (q.offset) params.set("offset", String(q.offset));
  const qs = params.toString();
  return api.get<{ matches: JobMatch[]; total: number }>(
    `/agent/results${qs ? `?${qs}` : ""}`
  );
};

export const setMatchStatus = (id: string, status: JobMatch["status"]) =>
  api.patch<{ ok: boolean }>(`/agent/results/${id}/status`, { status });

/* ──────────────────── Import ────────────────────────────────────────── */

export interface ImportPayload {
  title: string;
  company?: string;
  sourceUrl?: string;
  source?: string;
  externalId?: string;
  description?: string;
  location?: string;
  remote?: boolean;
}

export const importJob = (data: ImportPayload) =>
  api.post<JobMatch>("/agent/import", data);

/* ──────────────────── Runs ──────────────────────────────────────────── */

export const getRuns = () =>
  api.get<AgentRun[]>("/agent/runs");

/* ──────────────────── Resume generation ─────────────────────────────── */

export const generateResume = (matchId: string) =>
  api.post<{ documentId: string; title: string; message: string }>(
    `/agent/results/${matchId}/generate-resume`,
    {}
  );
