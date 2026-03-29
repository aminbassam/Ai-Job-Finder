import { queryOne } from "../db/pool";
import { decrypt } from "../utils/encryption";
import { buildAiSystemPrompt, getGlobalAiSettings } from "./ai-global-settings";

export interface AiConnection {
  apiKey: string;
  model: string;
  systemPrompt: (base: string) => Promise<string>;
}

export async function getOpenAiConnection(userId: string): Promise<AiConnection> {
  const row = await queryOne<{
    encrypted_key: string;
    encryption_iv: string;
    encryption_tag: string;
    selected_model: string | null;
  }>(
    `SELECT encrypted_key, encryption_iv, encryption_tag, selected_model
     FROM ai_provider_connections
     WHERE user_id = $1 AND provider = 'openai' AND is_connected = true
     LIMIT 1`,
    [userId]
  );

  if (!row?.encrypted_key) {
    throw new Error("No OpenAI API key connected. Go to Settings → AI Providers to add one.");
  }

  return {
    apiKey: decrypt({
      encrypted: row.encrypted_key,
      iv: row.encryption_iv,
      tag: row.encryption_tag,
    }),
    model: row.selected_model ?? "gpt-4o-mini",
    systemPrompt: async (base: string) => {
      const globalAi = await getGlobalAiSettings(userId);
      return buildAiSystemPrompt(base, globalAi);
    },
  };
}

interface ChatOptions {
  userId: string;
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
}

export async function runChatCompletion(options: ChatOptions): Promise<string> {
  const { apiKey, model, systemPrompt } = await getOpenAiConnection(options.userId);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: await systemPrompt(options.system) },
        { role: "user", content: options.prompt },
      ],
      response_format: options.json ? { type: "json_object" } : undefined,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 1200,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenAI returned ${response.status}. ${body.slice(0, 160)}`);
  }

  const data = await response.json() as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) {
    throw new Error("AI returned an empty response.");
  }
  return content;
}

export async function runJsonCompletion<T>(options: ChatOptions): Promise<T> {
  const content = await runChatCompletion({ ...options, json: true });
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new Error("AI returned invalid JSON.");
  }
}
