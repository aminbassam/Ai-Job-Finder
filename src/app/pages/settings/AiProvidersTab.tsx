import { useState, useEffect } from "react";
import {
  CheckCircle2, XCircle, Loader2, AlertTriangle, Eye, EyeOff,
  RefreshCw, Unplug, Plug,
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import { settingsService, type AiProviderInfo, type ProviderStatus } from "../../services/settings.service";

// ── Constants ─────────────────────────────────────────────────────────────────

const MODELS: Record<string, { value: string; label: string; recommended?: boolean }[]> = {
  openai: [
    { value: "gpt-4o",            label: "GPT-4o",             recommended: true },
    { value: "gpt-4o-mini",       label: "GPT-4o mini"         },
    { value: "gpt-4-turbo",       label: "GPT-4 Turbo"         },
    { value: "gpt-3.5-turbo",     label: "GPT-3.5 Turbo"       },
  ],
  anthropic: [
    { value: "claude-opus-4-6",          label: "Claude Opus 4.6",          recommended: true },
    { value: "claude-sonnet-4-6",        label: "Claude Sonnet 4.6"         },
    { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5"         },
  ],
};

const PROVIDERS: { id: "openai" | "anthropic"; name: string; description: string; keyPrefix: string; placeholder: string }[] = [
  {
    id:          "openai",
    name:        "OpenAI (ChatGPT)",
    description: "GPT-4o for resume generation and job analysis",
    keyPrefix:   "sk-",
    placeholder: "sk-…",
  },
  {
    id:          "anthropic",
    name:        "Anthropic (Claude)",
    description: "Claude for deep job matching and cover letters",
    keyPrefix:   "sk-ant-",
    placeholder: "sk-ant-…",
  },
];

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ProviderStatus }) {
  const cfg: Record<ProviderStatus, { label: string; icon: React.ReactNode; color: string }> = {
    disconnected: {
      label: "Not connected",
      icon:  <Unplug className="h-3 w-3" />,
      color: "border-[#374151] text-[#6B7280]",
    },
    validating: {
      label: "Validating…",
      icon:  <Loader2 className="h-3 w-3 animate-spin" />,
      color: "border-[#F59E0B]/40 text-[#F59E0B] bg-[#F59E0B]/10",
    },
    connected: {
      label: "Connected",
      icon:  <CheckCircle2 className="h-3 w-3" />,
      color: "border-[#22C55E]/40 text-[#22C55E] bg-[#22C55E]/10",
    },
    error: {
      label: "Connection failed",
      icon:  <XCircle className="h-3 w-3" />,
      color: "border-[#EF4444]/40 text-[#EF4444] bg-[#EF4444]/10",
    },
  };
  const { label, icon, color } = cfg[status] ?? cfg.disconnected;
  return (
    <Badge variant="outline" className={`flex items-center gap-1 text-[11px] font-medium ${color}`}>
      {icon}
      {label}
    </Badge>
  );
}

// ── Provider card ─────────────────────────────────────────────────────────────

function ProviderCard({
  def,
  info,
  onRefresh,
}: {
  def: typeof PROVIDERS[0];
  info: AiProviderInfo;
  onRefresh: () => void;
}) {
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [localStatus, setLocalStatus] = useState<ProviderStatus>(info.status);
  const [localError, setLocalError] = useState<string | null>(info.lastError ?? null);
  const [localModel, setLocalModel] = useState<string>(info.selectedModel ?? MODELS[def.id][0].value);
  const [localKeyHint, setLocalKeyHint] = useState<string | undefined>(info.keyHint);
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Sync when parent refreshes
  useEffect(() => {
    setLocalStatus(info.status);
    setLocalError(info.lastError ?? null);
    setLocalModel(info.selectedModel ?? MODELS[def.id][0].value);
    setLocalKeyHint(info.keyHint);
  }, [info, def.id]);

  function validateKeyFormat(key: string): string | null {
    if (!key.trim()) return "API key is required.";
    if (!key.startsWith(def.keyPrefix)) {
      return `${def.name} keys must start with "${def.keyPrefix}".`;
    }
    if (key.length < 20) return "Key is too short.";
    return null;
  }

  async function handleConnect() {
    const err = validateKeyFormat(keyInput);
    if (err) { setFieldError(err); return; }
    setFieldError(null);
    setSaving(true);
    setLocalStatus("validating");
    setLocalError(null);
    try {
      const result = await settingsService.connectProvider(def.id, keyInput);
      setLocalStatus("connected");
      setLocalKeyHint(result.keyHint);
      setLocalModel(result.selectedModel);
      setKeyInput("");
      onRefresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Validation failed.";
      setLocalStatus("error");
      setLocalError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setSaving(true);
    try {
      await settingsService.disconnectProvider(def.id);
      setLocalStatus("disconnected");
      setLocalKeyHint(undefined);
      setLocalError(null);
      setKeyInput("");
      onRefresh();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Disconnect failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setLocalError(null);
    try {
      const result = await settingsService.testProvider(def.id);
      setLocalStatus(result.status as ProviderStatus);
      setLocalError(result.lastError);
      onRefresh();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Test failed.");
    } finally {
      setTesting(false);
    }
  }

  async function handleModelChange(model: string) {
    setLocalModel(model);
    try {
      await settingsService.setProviderModel(def.id, model);
      onRefresh();
    } catch {
      // Revert on error
      setLocalModel(info.selectedModel ?? MODELS[def.id][0].value);
    }
  }

  const isConnected   = localStatus === "connected";
  const isValidating  = localStatus === "validating" || saving;

  return (
    <Card className="bg-[#0D1117] border-[#1F2937] p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold text-white">{def.name}</p>
          <p className="text-[12px] text-[#6B7280] mt-0.5">{def.description}</p>
        </div>
        <StatusBadge status={localStatus} />
      </div>

      {/* Connected state */}
      {isConnected && (
        <div className="space-y-3">
          {/* Key hint row */}
          <div className="flex items-center gap-2 px-3 py-2 bg-[#111827] border border-[#1F2937] rounded-lg">
            <span className="text-[12px] text-[#9CA3AF] flex-1 font-mono">API Key: {localKeyHint ?? "••••"}</span>
            {info.lastValidatedAt && (
              <span className="text-[11px] text-[#4B5563]">
                Validated {new Date(info.lastValidatedAt).toLocaleDateString()}
              </span>
            )}
          </div>

          {/* Model selector */}
          <div>
            <Label className="text-[12px] text-[#9CA3AF] uppercase tracking-wide mb-1.5 block">
              Model
            </Label>
            <Select value={localModel} onValueChange={handleModelChange}>
              <SelectTrigger className="bg-[#111827] border-[#1F2937] text-white text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#111827] border-[#1F2937]">
                {MODELS[def.id].map((m) => (
                  <SelectItem key={m.value} value={m.value} className="text-[13px] text-white focus:bg-[#1F2937]">
                    {m.label}
                    {m.recommended && (
                      <span className="ml-2 text-[10px] text-[#4F8CFF]">recommended</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testing}
              className="bg-[#1F2937] hover:bg-[#374151] text-white border-[#374151] text-[12px]"
            >
              {testing
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Testing…</>
                : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Test Connection</>
              }
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={saving}
              className="text-[#EF4444] hover:text-[#EF4444] border-[#EF4444]/30 hover:bg-[#EF4444]/10 text-[12px]"
            >
              <Unplug className="h-3.5 w-3.5 mr-1.5" />
              Disconnect
            </Button>
          </div>
        </div>
      )}

      {/* Disconnected / error state — show connect form */}
      {!isConnected && (
        <div className="space-y-3">
          <div>
            <Label className="text-[12px] text-[#9CA3AF] uppercase tracking-wide mb-1.5 block">
              API Key
            </Label>
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                value={keyInput}
                onChange={(e) => { setKeyInput(e.target.value); setFieldError(null); }}
                placeholder={def.placeholder}
                disabled={isValidating}
                className="bg-[#111827] border-[#1F2937] text-white placeholder:text-[#4B5563] pr-9 text-[13px]"
                onKeyDown={(e) => e.key === "Enter" && handleConnect()}
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-white transition-colors"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {fieldError && (
              <p className="text-[11px] text-[#EF4444] mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {fieldError}
              </p>
            )}
          </div>

          <Button
            className="bg-[#4F8CFF] hover:bg-[#4F8CFF]/90 text-white text-[13px] w-full"
            onClick={handleConnect}
            disabled={isValidating || !keyInput.trim()}
          >
            {isValidating
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Validating…</>
              : <><Plug className="h-4 w-4 mr-2" /> Connect {def.name.split(" ")[0]}</>
            }
          </Button>
        </div>
      )}

      {/* Error message */}
      {localStatus === "error" && localError && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[#EF4444]/5 border border-[#EF4444]/20">
          <XCircle className="h-4 w-4 text-[#EF4444] shrink-0 mt-0.5" />
          <div>
            <p className="text-[12px] font-medium text-[#EF4444]">Connection failed</p>
            <p className="text-[11px] text-[#EF4444]/80 mt-0.5">{localError}</p>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AiProvidersTab() {
  const [providers, setProviders] = useState<AiProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    settingsService
      .getAiProviders()
      .then((rows) => {
        setProviders(rows);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load AI providers."))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function getInfo(id: "openai" | "anthropic"): AiProviderInfo {
    return (
      providers.find((p) => p.provider === id) ?? {
        provider: id,
        status:   "disconnected",
      }
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 justify-center text-[13px] text-[#9CA3AF]">
        <Loader2 className="h-4 w-4 animate-spin text-[#4F8CFF]" />
        Loading AI providers…
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[#EF4444]/5 border border-[#EF4444]/20 text-[13px] text-[#EF4444]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {PROVIDERS.map((def) => (
        <ProviderCard
          key={def.id}
          def={def}
          info={getInfo(def.id)}
          onRefresh={load}
        />
      ))}

      {/* Security note */}
      <div className="p-3.5 rounded-lg bg-[#4F8CFF]/5 border border-[#4F8CFF]/20">
        <p className="text-[12px] text-[#6B7280] leading-relaxed">
          <span className="font-semibold text-[#4F8CFF]">Security: </span>
          API keys are encrypted at rest using AES-256-GCM before being stored. Only the last 4
          characters are shown. Keys are never returned to the client and are used exclusively
          server-side for AI generation requests.
        </p>
      </div>
    </div>
  );
}
