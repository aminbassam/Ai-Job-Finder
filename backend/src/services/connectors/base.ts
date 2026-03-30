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

function textCandidates(...values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value && value.trim())).join(" ");
}

export interface SearchQuery {
  jobTitles: string[];
  locations: string[];
  remoteOnly: boolean;
  mustHaveKeywords: string[];
  experienceLevels?: string[];
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

export function inferWorkArrangement(...values: Array<string | null | undefined>): string | undefined {
  const raw = textCandidates(...values).toLowerCase();
  if (!raw) return undefined;
  if (/\bhybrid\b/.test(raw)) return "hybrid";
  if (/\bremote\b|\bwork from home\b|\bwfh\b|\btelecommute\b|\btelework\b/.test(raw)) return "remote";
  if (/\bonsite\b|\bon-site\b|\bin office\b|\bin-office\b|\bon campus\b/.test(raw)) return "onsite";
  return undefined;
}

export function inferPaymentType(...values: Array<string | null | undefined>): string | undefined {
  const raw = textCandidates(...values).toLowerCase();
  if (!raw) return undefined;
  if (/\bper hour\b|\/hr\b|\/hour\b|\bhourly\b/.test(raw)) return "hourly";
  if (/\bper day\b|\/day\b|\bdaily\b/.test(raw)) return "daily";
  if (/\bper week\b|\/week\b|\bweekly\b/.test(raw)) return "weekly";
  if (/\bper month\b|\/month\b|\bmonthly\b/.test(raw)) return "monthly";
  if (/\bper year\b|\/year\b|\byearly\b|\bannual\b|\bannually\b/.test(raw)) return "yearly";
  if (/\bper project\b|\bproject[- ]based\b/.test(raw)) return "project";
  return undefined;
}

export function inferContractFlag(jobType?: string | null, ...values: Array<string | null | undefined>): boolean | undefined {
  const normalized = normalizeJobType(jobType);
  if (normalized === "contract" || normalized === "freelance") return true;
  if (normalized === "full-time" || normalized === "part-time" || normalized === "internship") return false;

  const raw = textCandidates(jobType, ...values).toLowerCase();
  if (!raw) return undefined;
  if (/\bcontract\b|\bcontractor\b|\bconsultant\b|\btemporary\b|\btemp\b|\b1099\b|\bfreelance\b/.test(raw)) return true;
  if (/\bfull[\s-]?time\b|\bpart[\s-]?time\b|\bpermanent\b|\bw2\b/.test(raw)) return false;
  return undefined;
}

export function buildNormalizedJobMeta(job: {
  title?: string | null;
  company?: string | null;
  location?: string | null;
  remote?: boolean | null;
  jobType?: string | null;
  description?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  rawData?: Record<string, unknown> | null;
}) {
  const existing = job.rawData ?? {};
  const existingMeta =
    existing.jobMeta && typeof existing.jobMeta === "object"
      ? (existing.jobMeta as Record<string, unknown>)
      : {};

  const compensationText =
    typeof existingMeta.compensationText === "string" && existingMeta.compensationText.trim()
      ? existingMeta.compensationText.trim()
      : (job.salaryMin != null || job.salaryMax != null)
        ? [
            job.salaryMin != null ? `$${Math.round(job.salaryMin).toLocaleString()}` : null,
            job.salaryMax != null ? `$${Math.round(job.salaryMax).toLocaleString()}` : null,
          ].filter(Boolean).join(" - ")
        : undefined;

  const paymentType =
    typeof existingMeta.paymentType === "string" && existingMeta.paymentType.trim()
      ? existingMeta.paymentType.trim()
      : inferPaymentType(
          compensationText,
          typeof existingMeta.salaryText === "string" ? existingMeta.salaryText : undefined,
          job.description ?? undefined,
          job.jobType ?? undefined
        );

  const workArrangement =
    typeof existingMeta.workArrangement === "string" && existingMeta.workArrangement.trim()
      ? existingMeta.workArrangement.trim()
      : (job.remote ? "remote" : inferWorkArrangement(
          typeof existingMeta.workLocation === "string" ? existingMeta.workLocation : undefined,
          job.location ?? undefined,
          job.description ?? undefined,
          job.title ?? undefined,
        ) ?? "onsite");

  const companyAddress =
    typeof existingMeta.companyAddress === "string" && existingMeta.companyAddress.trim()
      ? existingMeta.companyAddress.trim()
      : (typeof existingMeta.address === "string" && existingMeta.address.trim()
          ? existingMeta.address.trim()
          : job.location ?? undefined);

  const workLocation =
    typeof existingMeta.workLocation === "string" && existingMeta.workLocation.trim()
      ? existingMeta.workLocation.trim()
      : job.location ?? undefined;

  const normalizedJobType = normalizeJobType(job.jobType ?? undefined) ?? job.jobType ?? undefined;
  const isContract = inferContractFlag(
    normalizedJobType,
    typeof existingMeta.contractLabel === "string" ? existingMeta.contractLabel : undefined,
    job.title ?? undefined,
    job.description ?? undefined,
    compensationText,
  );

  return {
    ...existing,
    jobMeta: {
      ...existingMeta,
      title: job.title ?? existingMeta.title ?? undefined,
      company: job.company ?? existingMeta.company ?? undefined,
      workLocation,
      companyAddress,
      workArrangement,
      paymentType,
      compensationText,
      isContract,
      employmentType: normalizedJobType,
      salaryMin: job.salaryMin ?? existingMeta.salaryMin ?? undefined,
      salaryMax: job.salaryMax ?? existingMeta.salaryMax ?? undefined,
      remote: job.remote ?? existingMeta.remote ?? undefined,
    },
  };
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
