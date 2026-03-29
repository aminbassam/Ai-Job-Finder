import jwt from "jsonwebtoken";
import { createHash } from "crypto";
import * as cheerio from "cheerio";
import { query, queryOne, transaction } from "../db/pool";
import { decrypt, encrypt } from "../utils/encryption";
import { extractJobSignals } from "./job-ai-extraction";
import { PipelineProfile, scoreRawJobAgainstProfile, toMatchTier } from "./pipeline";
import type { RawJob } from "./connectors/base";
import { runJsonCompletion } from "./ai-client";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GMAIL_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const LINKEDIN_CONNECTOR = "linkedin-email";

interface OAuthTokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

interface StoredGmailAccount {
  id: string;
  user_id: string;
  email: string;
  encrypted_access_token: string;
  access_token_iv: string;
  access_token_tag: string;
  encrypted_refresh_token: string;
  refresh_token_iv: string;
  refresh_token_tag: string;
  token_expires_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
}

interface GmailMessageRef {
  id: string;
  threadId: string;
}

interface ParsedLinkedInEmailJob {
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  subject?: string;
  sender?: string;
  receivedAt?: string | null;
  skills?: string[];
  keywords?: string[];
  minimumQualifications?: string[];
}

export interface GmailConnectionStatus {
  connected: boolean;
  email?: string;
  lastSyncAt?: string | null;
  lastError?: string | null;
  connectorActive: boolean;
}

export interface GmailSyncResult {
  synced: number;
  imported: number;
  skipped: number;
  scored: number;
  ready: number;
  errors: string[];
}

function getGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.");
  }
  return { clientId, clientSecret, redirectUri };
}

function getFrontendSettingsUrl(params: Record<string, string>) {
  const base = process.env.APP_URL ?? process.env.CORS_ORIGIN ?? "http://localhost:5678";
  const url = new URL("/settings", base);
  url.searchParams.set("tab", "integrations");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function getStateSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set.");
  }
  return secret;
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, "base64").toString("utf8");
}

function sanitizeText(value?: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function buildExternalKey(url: string, title: string, company: string, location: string) {
  const base = sanitizeText(url) || `${sanitizeText(title)}|${sanitizeText(company)}|${sanitizeText(location)}`;
  return createHash("sha1").update(base.toLowerCase()).digest("hex").slice(0, 24);
}

function normalizeCompanySlug(name: string): string {
  return sanitizeText(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "company";
}

function locationMatchesProfile(location: string, profile: PipelineProfile) {
  if (profile.remoteOnly) {
    return /remote/i.test(location);
  }
  if (profile.locations.length === 0) return true;
  const lower = location.toLowerCase();
  return profile.locations.some((candidate) => lower.includes(candidate.toLowerCase()));
}

function keywordMatchesProfile(description: string, profile: PipelineProfile) {
  if (profile.mustHaveKeywords.length === 0) return true;
  const text = description.toLowerCase();
  return profile.mustHaveKeywords.every((keyword) => text.includes(keyword.toLowerCase()));
}

function bestProfileForJob(job: RawJob, profiles: PipelineProfile[]) {
  let best: {
    profile: PipelineProfile;
    score: number;
    breakdown: ReturnType<typeof scoreRawJobAgainstProfile>["breakdown"];
  } | null = null;

  for (const profile of profiles) {
    if (!profile.sources.includes(LINKEDIN_CONNECTOR)) continue;
    if (!locationMatchesProfile(job.location ?? "", profile)) continue;
    if (!keywordMatchesProfile(job.description ?? "", profile)) continue;
    const { score, breakdown } = scoreRawJobAgainstProfile(job, profile);
    if (!best || score > best.score) {
      best = { profile, score, breakdown };
    }
  }

  return best;
}

function parseDateHeader(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function htmlToSnippet(html: string) {
  const text = sanitizeText(cheerio.load(html).text());
  return text.slice(0, 1200);
}

function extractHeader(headers: Array<{ name?: string; value?: string }> | undefined, target: string) {
  return headers?.find((header) => header.name?.toLowerCase() === target.toLowerCase())?.value ?? "";
}

function collectBodies(node: Record<string, unknown> | undefined, acc: { html: string[]; text: string[] }) {
  if (!node) return;
  const mimeType = typeof node.mimeType === "string" ? node.mimeType : "";
  const body = node.body as { data?: string } | undefined;

  if (body?.data) {
    const decoded = base64UrlDecode(body.data);
    if (mimeType.includes("text/html")) acc.html.push(decoded);
    else if (mimeType.includes("text/plain")) acc.text.push(decoded);
  }

  const parts = Array.isArray(node.parts) ? node.parts as Record<string, unknown>[] : [];
  for (const part of parts) collectBodies(part, acc);
}

function unwrapTrackedUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    for (const key of ["url", "redirect", "dest", "target"]) {
      const nested = parsed.searchParams.get(key);
      if (nested) {
        return unwrapTrackedUrl(decodeURIComponent(nested));
      }
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

function chooseLinkedInJobUrl($: cheerio.CheerioAPI): string {
  let selected = "";
  $("a[href]").each((_, el) => {
    if (selected) return;
    const href = $(el).attr("href");
    if (!href) return;
    const unwrapped = unwrapTrackedUrl(href);
    if (/linkedin\.com\/jobs/i.test(unwrapped)) {
      selected = unwrapped;
    }
  });
  return selected;
}

function guessCompanyAndLocation(text: string) {
  const lines = text
    .split(/\n+/)
    .map((line) => sanitizeText(line))
    .filter(Boolean)
    .slice(0, 50);

  let company = "";
  let location = "";

  for (const line of lines) {
    if (!company && / at /i.test(line)) {
      const parts = line.split(/\sat\s/i);
      company = sanitizeText(parts[parts.length - 1]);
    }
    if (!location && (/\bremote\b/i.test(line) || /,\s*[A-Z]{2}\b/.test(line))) {
      location = line;
    }
  }

  return { company, location };
}

export function parseLinkedInEmailContent(input: {
  html: string;
  text: string;
  snippet: string;
  subject: string;
  sender: string;
  receivedAt?: string | null;
}): ParsedLinkedInEmailJob {
  const html = input.html || "";
  const text = input.text || htmlToSnippet(html);
  const $ = cheerio.load(html || `<div>${text}</div>`);

  const headingCandidates = [
    $("h1").first().text(),
    $("h2").first().text(),
    $("h3").first().text(),
    $("strong").first().text(),
    input.subject.replace(/^(new\s+job|job alert|linkedin jobs?)[:\-\s]*/i, ""),
  ]
    .map((value) => sanitizeText(value))
    .filter((value) => value && value.length <= 140);

  const title = headingCandidates.find((value) =>
    !/linkedin|job alert|see more|apply now|jobs for you/i.test(value)
  ) ?? "";

  const guessed = guessCompanyAndLocation(`${htmlToSnippet(html)}\n${input.subject}\n${text}`);
  const company = sanitizeText(
    $(".company").first().text() ||
    $('[data-test-id*="company"]').first().text() ||
    guessed.company
  );
  const location = sanitizeText(
    $(".location").first().text() ||
    $('[data-test-id*="location"]').first().text() ||
    guessed.location
  );
  const url = chooseLinkedInJobUrl($);
  const description = sanitizeText(input.snippet || htmlToSnippet(html) || text).slice(0, 5000);

  return {
    title,
    company,
    location,
    url,
    description,
    subject: input.subject,
    sender: input.sender,
    receivedAt: input.receivedAt ?? null,
  };
}

async function aiExtractJobFromEmail(userId: string, content: string) {
  try {
    const result = await runJsonCompletion<{
      title?: string;
      company?: string;
      location?: string;
      url?: string;
    }>({
      userId,
      system: "You extract job details from email content. Return valid JSON only. Never invent missing details.",
      prompt: `Extract job details from this LinkedIn job email. Return only JSON:
{
  "title": "",
  "company": "",
  "location": "",
  "url": ""
}

EMAIL CONTENT:
${content.slice(0, 12000)}`,
      maxTokens: 350,
      temperature: 0.1,
    });
    return {
      title: sanitizeText(result.title),
      company: sanitizeText(result.company),
      location: sanitizeText(result.location),
      url: sanitizeText(result.url),
    };
  } catch {
    return { title: "", company: "", location: "", url: "" };
  }
}

export async function extractJobFromEmailWithFallback(userId: string, emailContent: {
  html: string;
  text: string;
  snippet: string;
  subject: string;
  sender: string;
  receivedAt?: string | null;
}) {
  const parsed = parseLinkedInEmailContent(emailContent);
  if (parsed.title && parsed.company && parsed.url) {
    return parsed;
  }

  const ai = await aiExtractJobFromEmail(
    userId,
    [emailContent.subject, emailContent.snippet, emailContent.text, emailContent.html].filter(Boolean).join("\n\n")
  );

  return {
    ...parsed,
    title: parsed.title || ai.title,
    company: parsed.company || ai.company,
    location: parsed.location || ai.location,
    url: parsed.url || ai.url,
  };
}

async function getStoredGmailAccount(userId: string): Promise<StoredGmailAccount | null> {
  return queryOne<StoredGmailAccount>(
    `SELECT *
     FROM gmail_accounts
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );
}

async function setConnectorStatus(userId: string, isActive: boolean, config: Record<string, unknown>) {
  await query(
    `INSERT INTO connector_configs (user_id, connector, is_active, config)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (user_id, connector) DO UPDATE
       SET is_active = EXCLUDED.is_active,
           config = EXCLUDED.config,
           updated_at = NOW()`,
    [userId, LINKEDIN_CONNECTOR, isActive, JSON.stringify(config)]
  );
}

async function fetchGoogleJson<T>(url: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(25_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Google API returned ${response.status}. ${body.slice(0, 180)}`);
  }

  return response.json() as Promise<T>;
}

async function refreshAccessToken(account: StoredGmailAccount) {
  const { clientId, clientSecret } = getGoogleConfig();
  const refreshToken = decrypt({
    encrypted: account.encrypted_refresh_token,
    iv: account.refresh_token_iv,
    tag: account.refresh_token_tag,
  });

  const response = await fetch(GMAIL_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to refresh Gmail token: ${body.slice(0, 180)}`);
  }

  const data = await response.json() as OAuthTokenResponse;
  const encrypted = encrypt(data.access_token);
  const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null;

  await query(
    `UPDATE gmail_accounts
     SET encrypted_access_token = $2,
         access_token_iv = $3,
         access_token_tag = $4,
         token_expires_at = $5,
         last_error = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [account.id, encrypted.encrypted, encrypted.iv, encrypted.tag, expiresAt]
  );

  return data.access_token;
}

async function getValidAccessToken(account: StoredGmailAccount) {
  const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
  const stillValid = expiresAt > Date.now() + 60_000;
  if (stillValid) {
    return decrypt({
      encrypted: account.encrypted_access_token,
      iv: account.access_token_iv,
      tag: account.access_token_tag,
    });
  }
  return refreshAccessToken(account);
}

async function listCandidateMessages(accessToken: string) {
  const params = new URLSearchParams({
    q: "from:(linkedin.com) (job OR opportunity OR hiring)",
    maxResults: "50",
  });
  const data = await fetchGoogleJson<{ messages?: Array<{ id: string; threadId: string }> }>(
    `${GMAIL_API_BASE}/messages?${params.toString()}`,
    accessToken
  );
  return (data.messages ?? []).map((message) => ({ id: message.id, threadId: message.threadId }));
}

async function fetchMessage(accessToken: string, messageId: string) {
  return fetchGoogleJson<Record<string, unknown>>(
    `${GMAIL_API_BASE}/messages/${messageId}?format=full`,
    accessToken
  );
}

async function upsertJobSource() {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO job_sources (kind, name, base_url)
     VALUES ('linkedin', 'LinkedIn Email', 'https://www.linkedin.com/jobs/')
     ON CONFLICT (kind, name)
     DO UPDATE SET base_url = EXCLUDED.base_url
     RETURNING id`
  );
  if (!row) throw new Error("Could not initialize LinkedIn Email job source.");
  return row.id;
}

async function upsertCompany(company: string) {
  const displayName = sanitizeText(company) || "Unknown Company";
  const normalized = normalizeCompanySlug(displayName);
  const row = await queryOne<{ id: string }>(
    `INSERT INTO companies (normalized_name, display_name)
     VALUES ($1, $2)
     ON CONFLICT (normalized_name)
     DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = NOW()
     RETURNING id`,
    [normalized, displayName]
  );
  if (!row) throw new Error("Could not create company.");
  return row.id;
}

async function loadEligibleProfiles(userId: string) {
  const rows = await query<{
    id: string;
    user_id: string;
    job_titles: string[];
    locations: string[];
    remote_only: boolean;
    experience_levels: string[];
    salary_min: number | null;
    salary_max: number | null;
    job_types: string[];
    posted_within_days: number | null;
    must_have_keywords: string[];
    nice_to_have_keywords: string[];
    excluded_companies: string[];
    sources: string[];
    search_mode: "strict" | "balanced" | "broad";
    score_threshold: number;
    auto_resume: boolean;
    schedule: string;
    schedule_interval_minutes: number | null;
  }>(
    `SELECT
       id, user_id, job_titles, locations, remote_only, experience_levels,
       salary_min, salary_max, job_types, posted_within_days,
       must_have_keywords, nice_to_have_keywords, excluded_companies, sources,
       search_mode, score_threshold, auto_resume, schedule, schedule_interval_minutes
     FROM search_profiles
     WHERE user_id = $1 AND is_active = true`,
    [userId]
  );

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    jobTitles: row.job_titles ?? [],
    locations: row.locations ?? [],
    remoteOnly: row.remote_only,
    experienceLevels: row.experience_levels ?? [],
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    jobTypes: row.job_types ?? [],
    postedWithinDays: row.posted_within_days,
    mustHaveKeywords: row.must_have_keywords ?? [],
    niceToHaveKeywords: row.nice_to_have_keywords ?? [],
    excludedCompanies: row.excluded_companies ?? [],
    sources: row.sources ?? [],
    searchMode: row.search_mode ?? "balanced",
    scoreThreshold: row.score_threshold ?? 70,
    autoResume: row.auto_resume ?? false,
    schedule: row.schedule,
    scheduleIntervalMinutes: row.schedule_interval_minutes,
  } satisfies PipelineProfile));
}

async function saveImportedJob(args: {
  userId: string;
  parsed: ParsedLinkedInEmailJob;
  accountId: string;
  messageId: string;
  threadId: string;
}) {
  const { userId, parsed, accountId, messageId, threadId } = args;
  const sourceId = await upsertJobSource();
  const companyId = await upsertCompany(parsed.company);
  const externalJobKey = buildExternalKey(parsed.url, parsed.title, parsed.company, parsed.location);
  const description = parsed.description || "Imported from LinkedIn job alert email.";
  const rawPayload = {
    source: LINKEDIN_CONNECTOR,
    email: {
      subject: parsed.subject ?? null,
      sender: parsed.sender ?? null,
      receivedAt: parsed.receivedAt ?? null,
      gmailMessageId: messageId,
      gmailThreadId: threadId,
    },
    skills: parsed.skills ?? [],
    keywords: parsed.keywords ?? [],
    minimumQualifications: parsed.minimumQualifications ?? [],
  };

  const jobId = await transaction<string>(async (q) => {
    const existing = await q(
      `SELECT id
       FROM jobs
       WHERE source_id = $1 AND external_job_key = $2
       LIMIT 1`,
      [sourceId, externalJobKey]
    ) as Array<{ id: string }>;

    if (existing[0]?.id) {
      await q(
        `UPDATE jobs
         SET company_id = $2,
             canonical_url = $3,
             title = $4,
             location_text = $5,
             work_mode = $6::work_mode,
             description = $7,
             raw_payload = $8::jsonb,
             updated_at = NOW()
         WHERE id = $1`,
        [
          existing[0].id,
          companyId,
          parsed.url || null,
          parsed.title || "LinkedIn Job",
          parsed.location || null,
          /remote/i.test(parsed.location) ? "remote" : "unknown",
          description,
          JSON.stringify(rawPayload),
        ]
      );
      return existing[0].id;
    }

    const inserted = await q(
      `INSERT INTO jobs (
         company_id, source_id, external_job_key, canonical_url, title, location_text,
         work_mode, description, posted_at, raw_payload
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7::work_mode, $8, $9::date, $10::jsonb
       )
       RETURNING id`,
      [
        companyId,
        sourceId,
        externalJobKey,
        parsed.url || null,
        parsed.title || "LinkedIn Job",
        parsed.location || null,
        /remote/i.test(parsed.location) ? "remote" : "unknown",
        description,
        parsed.receivedAt ? new Date(parsed.receivedAt).toISOString().slice(0, 10) : null,
        JSON.stringify(rawPayload),
      ]
    ) as Array<{ id: string }>;

    return inserted[0].id;
  });

  const eligibleProfiles = await loadEligibleProfiles(userId);
  const rawJob: RawJob = {
    externalId: externalJobKey,
    source: LINKEDIN_CONNECTOR,
    sourceUrl: parsed.url,
    title: parsed.title || "LinkedIn Job",
    company: parsed.company,
    location: parsed.location,
    remote: /remote/i.test(parsed.location),
    jobType: undefined,
    description,
    requirements: parsed.minimumQualifications ?? [],
    salaryMin: undefined,
    salaryMax: undefined,
    postedAt: parsed.receivedAt ? new Date(parsed.receivedAt) : undefined,
    rawData: rawPayload,
  };

  const signals = await extractJobSignals(userId, description).catch(() => ({
    skills: parsed.skills ?? [],
    minimumQualifications: parsed.minimumQualifications ?? [],
    keywords: parsed.keywords ?? [],
  }));
  rawPayload.skills = signals.skills;
  rawPayload.keywords = signals.keywords;
  rawPayload.minimumQualifications = signals.minimumQualifications;

  const best = bestProfileForJob(rawJob, eligibleProfiles);

  let scored = 0;
  let ready = 0;
  if (best) {
    const tier = toMatchTier(best.score);
    await query(
      `INSERT INTO job_matches (
         user_id, profile_id, external_id, source, source_url, title, company, location,
         remote, job_type, description, requirements, posted_at, raw_data,
         ai_score, score_breakdown, match_tier, scored_at, status
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,
         $9,$10,$11,$12::text[],$13,$14::jsonb,
         $15,$16::jsonb,$17,NOW(),'new'
       )
       ON CONFLICT (user_id, source, external_id) DO UPDATE SET
         profile_id = EXCLUDED.profile_id,
         source_url = EXCLUDED.source_url,
         title = EXCLUDED.title,
         company = EXCLUDED.company,
         location = EXCLUDED.location,
         remote = EXCLUDED.remote,
         description = EXCLUDED.description,
         requirements = EXCLUDED.requirements,
         posted_at = EXCLUDED.posted_at,
         raw_data = EXCLUDED.raw_data,
         ai_score = EXCLUDED.ai_score,
         score_breakdown = EXCLUDED.score_breakdown,
         match_tier = EXCLUDED.match_tier,
         scored_at = NOW(),
         updated_at = NOW()`,
      [
        userId,
        best.profile.id,
        externalJobKey,
        LINKEDIN_CONNECTOR,
        parsed.url || null,
        parsed.title || "LinkedIn Job",
        parsed.company || null,
        parsed.location || null,
        /remote/i.test(parsed.location),
        null,
        description,
        signals.minimumQualifications ?? [],
        parsed.receivedAt ?? new Date().toISOString(),
        JSON.stringify(rawPayload),
        best.score,
        JSON.stringify(best.breakdown),
        tier,
      ]
    );

    await query(
      `INSERT INTO user_job_states (user_id, job_id, stage, is_saved)
       VALUES ($1, $2, $3::job_stage, false)
       ON CONFLICT (user_id, job_id) DO UPDATE SET
         stage = EXCLUDED.stage,
         updated_at = NOW()`,
      [userId, jobId, best.score >= best.profile.scoreThreshold ? "ready" : "new"]
    );

    await query(
      `INSERT INTO job_score_runs (
         user_id, job_id, ai_provider, score, recommendation, explanation, strengths, gaps, model_name, input_snapshot
       ) VALUES (
         $1, $2, 'other', $3, $4, $5, $6::jsonb, $7::jsonb, 'linkedin-email-ingestion-v1', $8::jsonb
       )`,
      [
        userId,
        jobId,
        best.score,
        best.score >= best.profile.scoreThreshold ? "Ready to pursue" : "Review before applying",
        `Imported from LinkedIn email and matched against profile ${best.profile.id}.`,
        JSON.stringify(signals.skills.slice(0, 6)),
        JSON.stringify(signals.minimumQualifications.slice(0, 6)),
        JSON.stringify({
          source: LINKEDIN_CONNECTOR,
          externalJobKey,
          jobFitScore: best.score,
          scoreBreakdown: best.breakdown,
          matchedProfileId: best.profile.id,
        }),
      ]
    );

    scored = 1;
    ready = best.score >= best.profile.scoreThreshold ? 1 : 0;
  } else {
    await query(
      `INSERT INTO user_job_states (user_id, job_id, stage, is_saved)
       VALUES ($1, $2, 'new', false)
       ON CONFLICT (user_id, job_id) DO NOTHING`,
      [userId, jobId]
    );
  }

  await query(
    `INSERT INTO gmail_synced_messages (
       gmail_account_id, gmail_message_id, gmail_thread_id, subject, sender, received_at, status, imported_job_id, parsed_payload
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb
     )
     ON CONFLICT (gmail_account_id, gmail_message_id) DO NOTHING`,
    [
      accountId,
      messageId,
      threadId,
      parsed.subject ?? null,
      parsed.sender ?? null,
      parsed.receivedAt ?? null,
      scored ? "scored" : "imported",
      jobId,
      JSON.stringify(rawPayload),
    ]
  );

  await query(
    `INSERT INTO activity_events (user_id, type, title, description, job_id)
     VALUES ($1, 'job_found', $2, $3, $4)`,
    [
      userId,
      parsed.title || "Imported LinkedIn job alert",
      `Imported from Gmail LinkedIn alert${best ? ` • score ${best.score}` : ""}`,
      jobId,
    ]
  ).catch(() => {});

  return { jobId, scored, ready };
}

export async function getGmailConnectionStatus(userId: string): Promise<GmailConnectionStatus> {
  const [account, connector] = await Promise.all([
    getStoredGmailAccount(userId),
    queryOne<{ is_active: boolean }>(
      `SELECT is_active FROM connector_configs WHERE user_id = $1 AND connector = $2 LIMIT 1`,
      [userId, LINKEDIN_CONNECTOR]
    ),
  ]);

  return {
    connected: Boolean(account),
    email: account?.email,
    lastSyncAt: account?.last_sync_at ?? null,
    lastError: account?.last_error ?? null,
    connectorActive: Boolean(connector?.is_active),
  };
}

export async function buildGmailConnectUrl(userId: string) {
  const { clientId, redirectUri } = getGoogleConfig();
  const state = jwt.sign({ userId, kind: "gmail-connect" }, getStateSecret(), { expiresIn: "10m" });

  const url = new URL(GMAIL_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function completeGmailOAuth(code: string, state: string) {
  const decoded = jwt.verify(state, getStateSecret()) as { userId?: string; kind?: string };
  if (!decoded.userId || decoded.kind !== "gmail-connect") {
    throw new Error("Invalid Gmail OAuth state.");
  }

  const { clientId, clientSecret, redirectUri } = getGoogleConfig();
  const response = await fetch(GMAIL_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to connect Gmail: ${body.slice(0, 180)}`);
  }

  const token = await response.json() as OAuthTokenResponse;
  if (!token.access_token || !token.refresh_token) {
    throw new Error("Google did not return both access and refresh tokens.");
  }

  const profile = await fetchGoogleJson<{ emailAddress?: string }>(
    `${GMAIL_API_BASE}/profile`,
    token.access_token
  );

  if (!profile.emailAddress) {
    throw new Error("Could not read Gmail account profile.");
  }

  const access = encrypt(token.access_token);
  const refresh = encrypt(token.refresh_token);
  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;

  await query(
    `INSERT INTO gmail_accounts (
       user_id, email, encrypted_access_token, access_token_iv, access_token_tag,
       encrypted_refresh_token, refresh_token_iv, refresh_token_tag, token_expires_at, last_error
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, $9, NULL
     )
     ON CONFLICT (user_id) DO UPDATE SET
       email = EXCLUDED.email,
       encrypted_access_token = EXCLUDED.encrypted_access_token,
       access_token_iv = EXCLUDED.access_token_iv,
       access_token_tag = EXCLUDED.access_token_tag,
       encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
       refresh_token_iv = EXCLUDED.refresh_token_iv,
       refresh_token_tag = EXCLUDED.refresh_token_tag,
       token_expires_at = EXCLUDED.token_expires_at,
       last_error = NULL,
       updated_at = NOW()`,
    [
      decoded.userId,
      profile.emailAddress,
      access.encrypted,
      access.iv,
      access.tag,
      refresh.encrypted,
      refresh.iv,
      refresh.tag,
      expiresAt,
    ]
  );

  await setConnectorStatus(decoded.userId, true, {
    provider: "gmail",
    accountEmail: profile.emailAddress,
    senders: ["linkedin.com"],
  });

  return { userId: decoded.userId, email: profile.emailAddress };
}

export async function disconnectGmail(userId: string) {
  await query(`DELETE FROM gmail_accounts WHERE user_id = $1`, [userId]);
  await setConnectorStatus(userId, false, { provider: "gmail", disconnected: true });
}

export async function syncLinkedInEmails(userId: string): Promise<GmailSyncResult> {
  const result: GmailSyncResult = {
    synced: 0,
    imported: 0,
    skipped: 0,
    scored: 0,
    ready: 0,
    errors: [],
  };

  const account = await getStoredGmailAccount(userId);
  if (!account) {
    throw new Error("Gmail is not connected.");
  }

  try {
    const accessToken = await getValidAccessToken(account);
    const messages = await listCandidateMessages(accessToken);

    for (const message of messages) {
      result.synced++;

      const existing = await queryOne<{ id: string }>(
        `SELECT id
         FROM gmail_synced_messages
         WHERE gmail_account_id = $1 AND gmail_message_id = $2
         LIMIT 1`,
        [account.id, message.id]
      );
      if (existing) {
        result.skipped++;
        continue;
      }

      try {
        const full = await fetchMessage(accessToken, message.id);
        const payload = full.payload as Record<string, unknown> | undefined;
        const bodies = { html: [] as string[], text: [] as string[] };
        collectBodies(payload, bodies);

        const headers = Array.isArray(payload?.headers)
          ? payload?.headers as Array<{ name?: string; value?: string }>
          : [];
        const subject = extractHeader(headers, "Subject");
        const sender = extractHeader(headers, "From");
        const receivedAt = parseDateHeader(extractHeader(headers, "Date"));

        const parsed = await extractJobFromEmailWithFallback(userId, {
          html: bodies.html.join("\n\n"),
          text: bodies.text.join("\n\n"),
          snippet: typeof full.snippet === "string" ? full.snippet : "",
          subject,
          sender,
          receivedAt,
        });

        if (!parsed.title || !(parsed.url || parsed.company)) {
          await query(
            `INSERT INTO gmail_synced_messages (
               gmail_account_id, gmail_message_id, gmail_thread_id, subject, sender, received_at, status, parsed_payload
             ) VALUES (
               $1, $2, $3, $4, $5, $6, 'skipped', $7::jsonb
             )
             ON CONFLICT (gmail_account_id, gmail_message_id) DO NOTHING`,
            [
              account.id,
              message.id,
              message.threadId,
              subject || null,
              sender || null,
              receivedAt,
              JSON.stringify({ reason: "Could not parse LinkedIn job details." }),
            ]
          );
          result.skipped++;
          continue;
        }

        const saved = await saveImportedJob({
          userId,
          parsed,
          accountId: account.id,
          messageId: message.id,
          threadId: message.threadId,
        });

        result.imported++;
        result.scored += saved.scored;
        result.ready += saved.ready;
      } catch (err) {
        const messageText = err instanceof Error ? err.message : "Unknown Gmail sync error.";
        result.errors.push(messageText);
      }
    }

    await query(
      `UPDATE gmail_accounts
       SET last_sync_at = NOW(), last_error = $2, updated_at = NOW()
       WHERE id = $1`,
      [account.id, result.errors[0] ?? null]
    );

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to sync Gmail.";
    await query(
      `UPDATE gmail_accounts
       SET last_error = $2, updated_at = NOW()
       WHERE id = $1`,
      [account.id, message]
    ).catch(() => {});
    throw err;
  }
}

export async function syncAllConnectedGmailAccounts() {
  const rows = await query<{ user_id: string }>(
    `SELECT user_id FROM gmail_accounts ORDER BY updated_at DESC`
  );

  for (const row of rows) {
    try {
      await syncLinkedInEmails(row.user_id);
      console.log(`[gmail-sync] Completed LinkedIn email sync for ${row.user_id}`);
    } catch (err) {
      console.error(`[gmail-sync] Failed for ${row.user_id}:`, (err as Error).message);
    }
  }
}

export function buildGmailCallbackRedirect(params: Record<string, string>) {
  return getFrontendSettingsUrl(params);
}
