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
