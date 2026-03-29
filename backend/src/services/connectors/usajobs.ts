/**
 * USAJobs connector — official US federal government jobs API.
 *
 * Registration (free):
 *   1. Go to https://developer.usajobs.gov/tutorials/
 *   2. Register with your email address
 *   3. You'll receive an API key by email
 *
 * Required headers:
 *   User-Agent:        the email address you registered with
 *   Authorization-Key: your API key
 *   Host:              data.usajobs.gov
 *
 * Docs: https://developer.usajobs.gov/
 */
import { Connector, ConnectorConfig, RawJob, SearchQuery, titleMatches, normalizeJobType } from "./base";

/* ─── API response types ────────────────────────────────────────────────── */

interface USAJobsRemuneration {
  MinimumRange: string;
  MaximumRange: string;
  RateIntervalCode: string; // "PA" = per annum, "PH" = per hour, "WC" = without compensation
  Description: string;
}

interface USAJobsLocation {
  LocationName: string;
  CountryCode: string;
  CountrySubDivisionCode: string;
  CityName: string;
  Longitude: number;
  Latitude: number;
}

interface USAJobsDescriptor {
  PositionID: string;
  PositionTitle: string;
  PositionURI: string;
  ApplyURI: string[];
  PositionLocationDisplay: string;
  PositionLocation: USAJobsLocation[];
  OrganizationName: string;
  DepartmentName: string;
  JobCategory: Array<{ Name: string; Code: string }>;
  JobGrade: Array<{ Code: string }>;
  PositionSchedule: Array<{ Name: string; Code: string }>;
  PositionOfferingType: Array<{ Name: string; Code: string }>;
  QualificationSummary: string;
  PositionRemuneration: USAJobsRemuneration[];
  PublicationStartDate: string;
  ApplicationCloseDate: string;
  UserArea?: {
    Details?: {
      MajorDuties?: string;
      Education?: string;
      Requirements?: string;
      HiringPath?: string[];
      TotalOpenings?: string;
      Telework?: string;
      RemoteIndicator?: boolean;
    };
  };
}

interface USAJobsItem {
  MatchedObjectId: string;
  MatchedObjectDescriptor: USAJobsDescriptor;
  RelevanceRank: number;
}

interface USAJobsResponse {
  SearchResult: {
    SearchResultCount: number;
    SearchResultCountAll: number;
    SearchResultItems: USAJobsItem[];
  };
}

/* ─── Salary normalization ──────────────────────────────────────────────── */

function parseUSASalary(remuneration: USAJobsRemuneration[]): { min?: number; max?: number } {
  if (!remuneration?.length) return {};
  const r = remuneration[0];
  const min = parseFloat(r.MinimumRange);
  const max = parseFloat(r.MaximumRange);
  const code = r.RateIntervalCode?.toUpperCase();

  if (code === "WC") return {}; // without compensation — volunteer
  const mult = code === "PH" ? 2080 : code === "PW" ? 52 : code === "PM" ? 12 : 1; // PA = 1

  return {
    min: isNaN(min) ? undefined : Math.round(min * mult),
    max: isNaN(max) ? undefined : Math.round(max * mult),
  };
}

/* ─── Schedule → job type ───────────────────────────────────────────────── */

function parseSchedule(schedules: Array<{ Name: string; Code: string }>): string | undefined {
  const name = schedules?.[0]?.Name ?? "";
  return normalizeJobType(name);
}

/* ─── Connector ─────────────────────────────────────────────────────────── */

export const usaJobsConnector: Connector = {
  name: "usajobs",

  async search(query: SearchQuery, config: ConnectorConfig): Promise<RawJob[]> {
    const email  = (config.email  as string | undefined)?.trim();
    const apiKey = (config.apiKey as string | undefined)?.trim();
    if (!email || !apiKey) return [];

    const maxPages     = Math.min(Number(config.maxPages ?? 3), 10);
    const perPage      = Math.min(Number(config.resultsPerPage ?? 25), 500);
    const daysPosted   = query.postedWithinDays ?? Number(config.daysPosted ?? 30);

    // USAJobs DatePosted only accepts: 1, 7, 30, 90, 365
    const datePostedParam = daysPosted <= 1 ? 1
      : daysPosted <= 7 ? 7
      : daysPosted <= 30 ? 30
      : daysPosted <= 90 ? 90
      : 365;

    // Build search terms — use all job titles (USAJobs supports comma-separated Keyword)
    const keyword = [...query.jobTitles, ...query.mustHaveKeywords]
      .slice(0, 5)
      .join(" ");

    if (!keyword.trim()) return [];

    // Locations: use profile locations, or skip for remote-only
    const locationsToSearch =
      query.remoteOnly ? [""] :
      query.locations.length > 0 ? query.locations.slice(0, 3) :
      [""];  // empty = nationwide

    const seenIds = new Set<string>();
    const results: RawJob[] = [];

    await Promise.allSettled(
      locationsToSearch.map(async (location) => {
        for (let page = 1; page <= maxPages; page++) {
          try {
            const params = new URLSearchParams({
              Keyword:        keyword,
              ResultsPerPage: String(perPage),
              Page:           String(page),
              DatePosted:     String(datePostedParam),
              WhoMayApply:    "public",  // jobs open to all US citizens
              Fields:         "Min",     // include full details
            });

            if (location) params.set("LocationName", location);
            if (query.remoteOnly) params.set("RemoteIndicator", "True");

            const url = `https://data.usajobs.gov/api/search?${params}`;
            const res = await fetch(url, {
              headers: {
                "Host":              "data.usajobs.gov",
                "User-Agent":        email,
                "Authorization-Key": apiKey,
              },
              signal: AbortSignal.timeout(20_000),
            });

            if (res.status === 401) {
              console.warn("[usajobs] Invalid API key or email.");
              return;
            }
            if (!res.ok) break;

            const data = (await res.json()) as USAJobsResponse;
            const items = data?.SearchResult?.SearchResultItems ?? [];
            if (items.length === 0) break;

            for (const item of items) {
              const desc = item.MatchedObjectDescriptor;
              const id   = item.MatchedObjectId;

              if (seenIds.has(id)) continue;
              seenIds.add(id);

              if (!titleMatches(desc.PositionTitle, query)) continue;

              const details    = desc.UserArea?.Details;
              const isRemote   =
                details?.RemoteIndicator === true ||
                /remote/i.test(details?.Telework ?? "") ||
                /remote/i.test(desc.PositionLocationDisplay ?? "");

              if (query.remoteOnly && !isRemote) continue;

              const salary = parseUSASalary(desc.PositionRemuneration ?? []);

              // Build a rich description from available fields
              const descParts: string[] = [];
              if (desc.QualificationSummary) descParts.push(desc.QualificationSummary);
              if (details?.MajorDuties)      descParts.push(`**Major Duties:**\n${details.MajorDuties}`);
              if (details?.Requirements)     descParts.push(`**Requirements:**\n${details.Requirements}`);
              if (details?.Education)        descParts.push(`**Education:**\n${details.Education}`);

              const requirements: string[] = desc.JobCategory?.map((c) => c.Name) ?? [];
              if (details?.HiringPath?.length) {
                requirements.push(`Hiring path: ${details.HiringPath.join(", ")}`);
              }
              if (details?.TotalOpenings && details.TotalOpenings !== "1") {
                requirements.push(`${details.TotalOpenings} openings`);
              }

              results.push({
                externalId:   id,
                source:       "usajobs",
                sourceUrl:    desc.ApplyURI?.[0] ?? desc.PositionURI,
                title:        desc.PositionTitle,
                company:      desc.OrganizationName || desc.DepartmentName,
                location:     desc.PositionLocationDisplay,
                remote:       isRemote,
                jobType:      parseSchedule(desc.PositionSchedule),
                description:  descParts.join("\n\n").slice(0, 10_000),
                requirements,
                salaryMin:    salary.min,
                salaryMax:    salary.max,
                postedAt:     desc.PublicationStartDate
                                ? new Date(desc.PublicationStartDate)
                                : undefined,
                rawData: item as unknown as Record<string, unknown>,
              });
            }

            if (items.length < perPage) break; // last page
          } catch (err) {
            console.error("[usajobs] fetch error:", (err as Error).message);
            break;
          }
        }
      })
    );

    return results;
  },
};
