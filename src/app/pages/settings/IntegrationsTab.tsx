import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Mail, RefreshCw, Unplug } from "lucide-react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { settingsService, type GmailIntegrationStatus, type GmailSyncResult } from "../../services/settings.service";

function fmtDateTime(value?: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function IntegrationsTab() {
  const [status, setStatus] = useState<GmailIntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<GmailSyncResult | null>(null);

  const callbackMessage = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const gmail = params.get("gmail");
    const message = params.get("message");
    const email = params.get("email");
    if (gmail === "connected") {
      return { type: "success" as const, text: `Gmail connected${email ? ` for ${email}` : ""}.` };
    }
    if (gmail === "error") {
      return { type: "error" as const, text: decodeURIComponent(message ?? "Gmail connection failed.") };
    }
    return null;
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const next = await settingsService.getGmailStatus();
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Gmail integration.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      const { authUrl } = await settingsService.getGmailConnectUrl();
      window.location.href = authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start Gmail connection.");
      setConnecting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setError(null);
    setSyncResult(null);
    try {
      const result = await settingsService.syncGmail();
      setSyncResult(result);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync LinkedIn emails.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setError(null);
    try {
      await settingsService.disconnectGmail();
      setSyncResult(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect Gmail.");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="bg-[#111827] border-[#1F2937] p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#4F8CFF]/10">
              <Mail className="h-6 w-6 text-[#4F8CFF]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[18px] font-semibold text-white">LinkedIn Email Ingestion</h2>
                {status?.connected ? (
                  <Badge className="bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/20">Connected</Badge>
                ) : (
                  <Badge variant="outline" className="border-[#374151] text-[#9CA3AF]">Not connected</Badge>
                )}
              </div>
              <p className="mt-1 text-[13px] text-[#9CA3AF] max-w-2xl">
                Connect Gmail once and JobFlow will watch LinkedIn job alert emails, import the jobs,
                score them, and push them into your Job Board automatically.
              </p>
            </div>
          </div>

          {status?.connected ? (
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleSync}
                disabled={syncing}
                className="bg-[#4F8CFF] hover:bg-[#4F8CFF]/90 text-white"
              >
                {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Sync Now
              </Button>
              <Button
                variant="outline"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="border-[#EF4444]/30 text-[#EF4444] hover:bg-[#EF4444]/10"
              >
                {disconnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unplug className="mr-2 h-4 w-4" />}
                Disconnect Gmail
              </Button>
            </div>
          ) : (
            <Button
              onClick={handleConnect}
              disabled={connecting}
              className="bg-[#4F8CFF] hover:bg-[#4F8CFF]/90 text-white"
            >
              {connecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              Connect Gmail
            </Button>
          )}
        </div>

        {callbackMessage && (
          <div className={`mt-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] ${
            callbackMessage.type === "success"
              ? "border-[#22C55E]/20 bg-[#22C55E]/10 text-[#22C55E]"
              : "border-[#EF4444]/20 bg-[#EF4444]/10 text-[#EF4444]"
          }`}>
            {callbackMessage.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            {callbackMessage.text}
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-[#EF4444]/20 bg-[#EF4444]/10 px-3 py-2 text-[12px] text-[#EF4444]">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="mt-6 flex items-center gap-2 text-[13px] text-[#9CA3AF]">
            <Loader2 className="h-4 w-4 animate-spin text-[#4F8CFF]" />
            Loading Gmail integration…
          </div>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
              <p className="text-[12px] text-[#6B7280]">Connected account</p>
              <p className="mt-2 text-[16px] font-semibold text-white">{status?.email ?? "No Gmail connected"}</p>
              <p className="mt-1 text-[12px] text-[#9CA3AF]">
                Scope: <span className="text-white">gmail.readonly</span>
              </p>
            </div>
            <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
              <p className="text-[12px] text-[#6B7280]">Last sync</p>
              <p className="mt-2 text-[16px] font-semibold text-white">{fmtDateTime(status?.lastSyncAt)}</p>
              <p className="mt-1 text-[12px] text-[#9CA3AF]">
                Source availability in Search Profiles:{" "}
                <span className={status?.connectorActive ? "text-[#22C55E]" : "text-[#F59E0B]"}>
                  {status?.connectorActive ? "Active" : "Inactive"}
                </span>
              </p>
            </div>
            <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
              <p className="text-[12px] text-[#6B7280]">Automation</p>
              <p className="mt-2 text-[16px] font-semibold text-white">Every 15 minutes</p>
              <p className="mt-1 text-[12px] text-[#9CA3AF]">
                LinkedIn alert emails are imported into the Job Board automatically.
              </p>
            </div>
          </div>
        )}

        {status?.lastError && (
          <div className="mt-4 rounded-lg border border-[#F59E0B]/20 bg-[#F59E0B]/10 px-3 py-2 text-[12px] text-[#F59E0B]">
            Last sync warning: {status.lastError}
          </div>
        )}

        {syncResult && (
          <div className="mt-4 rounded-lg border border-[#22C55E]/20 bg-[#22C55E]/10 p-3 text-[12px] text-[#E5E7EB]">
            <p className="font-medium text-[#22C55E]">{syncResult.message}</p>
            <p className="mt-1 text-[#9CA3AF]">
              Synced {syncResult.synced} emails • Imported {syncResult.imported} jobs • Scored {syncResult.scored} • Ready {syncResult.ready} • Skipped {syncResult.skipped}
            </p>
            {syncResult.errors.length > 0 && (
              <p className="mt-2 text-[#F59E0B]">
                Some emails could not be processed: {syncResult.errors.slice(0, 2).join(" | ")}
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
