export interface RawJob {
  externalId: string;
  source: string;
  sourceUrl?: string;
  title: string;
  company?: string;
  location?: string;
  remote?: boolean;
  jobType?: string;
  description?: string;
  requirements?: string[];
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  postedAt?: Date;
  rawData?: Record<string, unknown>;
}

export interface SearchQuery {
  jobTitles: string[];
  locations: string[];
  remoteOnly: boolean;
  mustHaveKeywords: string[];
  jobTypes?: string[];
  postedWithinDays?: number | null;
  searchMode: "strict" | "balanced" | "broad";
}

export type ConnectorConfig = Record<string, unknown>;

export interface Connector {
  name: string;
  search(query: SearchQuery, config: ConnectorConfig): Promise<RawJob[]>;
}

/** Title-match helper shared across connectors */
export function titleMatches(title: string, query: SearchQuery): boolean {
  if (query.jobTitles.length === 0) return true;
  const t = title.toLowerCase();

  if (query.searchMode === "strict") {
    return query.jobTitles.some((jt) => t === jt.toLowerCase());
  }
  if (query.searchMode === "broad") {
    return query.jobTitles.some((jt) =>
      jt
        .toLowerCase()
        .split(/\s+/)
        .some((w) => w.length > 2 && t.includes(w))
    );
  }
  // balanced
  return query.jobTitles.some((jt) => {
    const words = jt.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    return t.includes(jt.toLowerCase()) || words.every((w) => t.includes(w));
  });
}

export function normalizeJobType(value?: string | null): string | undefined {
  const raw = value?.trim().toLowerCase();
  if (!raw) return undefined;

  if (/(full[\s-]?time|permanent)/i.test(raw)) return "full-time";
  if (/(part[\s-]?time)/i.test(raw)) return "part-time";
  if (/(contract|contractor|consultant|temporary|temp)/i.test(raw)) return "contract";
  if (/(intern|internship|apprentice)/i.test(raw)) return "internship";
  if (/(freelance|gig)/i.test(raw)) return "freelance";
  return raw;
}

export function jobTypeMatches(jobType: string | undefined, selectedTypes: string[] = []): boolean {
  if (selectedTypes.length === 0) return true;
  const normalized = normalizeJobType(jobType);
  if (!normalized) return false;
  return selectedTypes
    .map((type) => normalizeJobType(type))
    .filter((type): type is string => Boolean(type))
    .includes(normalized);
}

export function postedWithinRange(postedAt: Date | undefined, days?: number | null): boolean {
  if (!days) return true;
  if (!postedAt) return false;
  return Date.now() - postedAt.getTime() <= days * 24 * 60 * 60 * 1000;
}
