import { api } from "./api";

export type ProviderStatus = "disconnected" | "validating" | "connected" | "error";

export interface AiProviderInfo {
  provider:        "openai" | "anthropic";
  status:          ProviderStatus;
  isDefault?:      boolean;
  keyHint?:        string;
  selectedModel?:  string;
  lastValidatedAt?: string;
  lastError?:      string;
}

export const settingsService = {
  getAiProviders: (): Promise<AiProviderInfo[]> =>
    api.get<AiProviderInfo[]>("/settings/ai-providers"),

  connectProvider: (provider: string, apiKey: string): Promise<{
    message: string; status: string; keyHint: string; selectedModel: string;
  }> =>
    api.post("/settings/ai-providers", { provider, apiKey }),

  disconnectProvider: (provider: string): Promise<{ message: string }> =>
    api.delete(`/settings/ai-providers/${provider}`),

  testProvider: (provider: string): Promise<{ status: string; lastError: string | null }> =>
    api.post(`/settings/ai-providers/${provider}/test`, {}),

  setProviderModel: (provider: string, model: string): Promise<{ message: string; model: string }> =>
    api.put(`/settings/ai-providers/${provider}/model`, { model }),
};
