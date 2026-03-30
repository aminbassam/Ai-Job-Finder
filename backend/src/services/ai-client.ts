import { queryOne } from "../db/pool";
import { decrypt } from "../utils/encryption";
import { buildAiSystemPrompt, getGlobalAiSettings } from "./ai-global-settings";

export type AiProvider = "openai" | "anthropic";

export interface AiConnection {
  provider: AiProvider;
  apiKey: string;
  model: string;
  systemPrompt: (base: string) => Promise<string>;
}

async function getConnectedProvider(
  userId: string,
  requestedProvider?: AiProvider
): Promise<{
  provider: AiProvider;
  encrypted_key: string;
  encryption_iv: string;
  encryption_tag: string;
  selected_model: string | null;
}> {
  if (requestedProvider) {
    const requestedRow = await queryOne<{
      provider: AiProvider;
      encrypted_key: string;
      encryption_iv: string;
      encryption_tag: string;
      selected_model: string | null;
    }>(
      `SELECT provider, encrypted_key, encryption_iv, encryption_tag, selected_model
       FROM ai_provider_connections
       WHERE user_id = $1 AND provider = $2 AND is_connected = true
       LIMIT 1`,
      [userId, requestedProvider]
    );

    if (!requestedRow?.encrypted_key) {
      throw new Error(`No ${requestedProvider === "openai" ? "OpenAI" : "Anthropic"} API key connected. Go to Settings → AI Providers to add one.`);
    }

    return requestedRow;
  }

  const row = await queryOne<{
    provider: AiProvider;
    encrypted_key: string;
    encryption_iv: string;
    encryption_tag: string;
    selected_model: string | null;
  }>(
    `SELECT c.provider, c.encrypted_key, c.encryption_iv, c.encryption_tag, c.selected_model
     FROM ai_provider_connections c
     LEFT JOIN user_preferences up ON up.user_id = c.user_id
     WHERE c.user_id = $1
       AND c.is_connected = true
     ORDER BY
       CASE WHEN c.provider = up.default_ai_provider THEN 0 ELSE 1 END,
       CASE WHEN c.is_default THEN 0 ELSE 1 END,
       CASE WHEN c.provider = 'openai' THEN 0 ELSE 1 END,
       c.updated_at DESC NULLS LAST
     LIMIT 1`,
    [userId]
  );

  if (!row?.encrypted_key) {
    throw new Error("No AI provider is connected. Go to Settings → AI Providers to add one.");
  }

  return row;
}

export async function getAiConnection(userId: string, requestedProvider?: AiProvider): Promise<AiConnection> {
  const row = await getConnectedProvider(userId, requestedProvider);

  return {
    provider: row.provider,
    apiKey: decrypt({
      encrypted: row.encrypted_key,
      iv: row.encryption_iv,
      tag: row.encryption_tag,
    }),
    model:
      row.selected_model ??
      (row.provider === "openai" ? "gpt-4o-mini" : "claude-sonnet-4-6"),
    systemPrompt: async (base: string) => {
      const globalAi = await getGlobalAiSettings(userId);
      return buildAiSystemPrompt(base, globalAi);
    },
  };
}

export async function getOpenAiConnection(userId: string): Promise<AiConnection> {
  return getAiConnection(userId, "openai");
}

interface ChatOptions {
  userId: string;
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
  provider?: AiProvider;
}

export async function runChatCompletion(options: ChatOptions): Promise<string> {
  const { provider, apiKey, model, systemPrompt } = await getAiConnection(options.userId, options.provider);
  const resolvedSystemPrompt = await systemPrompt(options.system);
  const userPrompt = options.json
    ? `${options.prompt}\n\nReturn valid JSON only. Do not include markdown fences or commentary.`
    : options.prompt;

  const content = provider === "anthropic"
    ? await runAnthropicCompletion({
        apiKey,
        model,
        system: resolvedSystemPrompt,
        prompt: userPrompt,
        temperature: options.temperature ?? 0.2,
        maxTokens: options.maxTokens ?? 1200,
      })
    : await runOpenAiCompletion({
        apiKey,
        model,
        system: resolvedSystemPrompt,
        prompt: userPrompt,
        temperature: options.temperature ?? 0.2,
        maxTokens: options.maxTokens ?? 1200,
        json: Boolean(options.json),
      });

  if (!content) {
    throw new Error("AI returned an empty response.");
  }
  return content;
}

async function runOpenAiCompletion(params: {
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
  json: boolean;
}): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.prompt },
      ],
      response_format: params.json ? { type: "json_object" } : undefined,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenAI returned ${response.status}. ${body.slice(0, 160)}`);
  }

  const data = await response.json() as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

async function runAnthropicCompletion(params: {
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
}): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      system: params.system,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
      messages: [
        { role: "user", content: params.prompt },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Anthropic returned ${response.status}. ${body.slice(0, 160)}`);
  }

  const data = await response.json() as { content?: Array<{ type?: string; text?: string }> };
  return data.content
    ?.filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim() ?? "";
}

export async function runJsonCompletion<T>(options: ChatOptions): Promise<T> {
  const content = await runChatCompletion({ ...options, json: true });
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new Error("AI returned invalid JSON.");
  }
}
