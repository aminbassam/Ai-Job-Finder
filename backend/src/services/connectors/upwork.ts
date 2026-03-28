/**
 * Upwork connector — GraphQL API (requires OAuth2 access token).
 *
 * OAuth setup:
 *   1. Create an app at https://www.upwork.com/developer/apps
 *   2. Exchange OAuth2 code for access_token + refresh_token
 *   3. Store tokens in connector_configs.config for this user
 *
 * GraphQL endpoint: POST https://api.upwork.com/graphql
 */
import { Connector, ConnectorConfig, RawJob, SearchQuery } from "./base";

interface UpworkNode {
  id: string;
  title: string;
  description?: string;
  skills?: Array<{ prettyName: string }>;
  client?: { location?: { country?: string } };
  publishedDateTime?: string;
  jobType?: string;
  engagement?: string;
}

export const upworkConnector: Connector = {
  name: "upwork",

  async search(query: SearchQuery, config: ConnectorConfig): Promise<RawJob[]> {
    const accessToken = config.accessToken as string | undefined;
    if (!accessToken) return [];

    const searchTerms =
      query.jobTitles.length > 0
        ? query.jobTitles.slice(0, 3).join(" OR ")
        : query.mustHaveKeywords.slice(0, 3).join(" ");

    if (!searchTerms) return [];

    const gql = `
      query SearchJobs($q: String!, $paging: PagingInput) {
        marketplaceJobPostings(
          marketplaceJobFilter: { searchExpression: { q: $q } }
          paging: $paging
        ) {
          edges {
            node {
              id
              title
              description
              skills { prettyName }
              client { location { country } }
              publishedDateTime
              jobType
              engagement
            }
          }
        }
      }
    `;

    try {
      const res = await fetch("https://api.upwork.com/graphql", {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "JobFlowAI/1.0",
        },
        body: JSON.stringify({
          query: gql,
          variables: { q: searchTerms, paging: { first: 50 } },
        }),
      });

      if (!res.ok) return [];

      const body = (await res.json()) as {
        data?: { marketplaceJobPostings?: { edges?: Array<{ node: UpworkNode }> } };
        errors?: unknown[];
      };

      if (body.errors?.length) return [];

      const edges = body.data?.marketplaceJobPostings?.edges ?? [];

      return edges.map(({ node }) => ({
        externalId: `upwork_${node.id}`,
        source: "upwork",
        sourceUrl: `https://www.upwork.com/jobs/~${node.id}`,
        title: node.title,
        company: node.client?.location?.country ?? "Upwork Client",
        remote: true, // Upwork is always remote
        jobType: "contract",
        description: node.description,
        requirements: node.skills?.map((s) => s.prettyName) ?? [],
        postedAt: node.publishedDateTime ? new Date(node.publishedDateTime) : new Date(),
        rawData: node as unknown as Record<string, unknown>,
      }));
    } catch {
      return [];
    }
  },
};
