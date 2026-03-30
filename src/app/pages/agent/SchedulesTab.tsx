import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarClock, Loader2, Play, RefreshCw, Save } from "lucide-react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Switch } from "../../components/ui/switch";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  getProfiles,
  runProfile,
  updateProfile,
  type ProfileInput,
  type SearchProfile,
} from "../../services/agent.service";

type ScheduleDraft = Pick<
  ProfileInput,
  "isActive" | "schedule" | "scheduleIntervalMinutes" | "autoResume"
>;

function formatDateTime(value?: string | null) {
  if (!value) return "Not scheduled";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not scheduled";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function scheduleLabel(schedule: SearchProfile["schedule"], customMinutes?: number | null) {
  if (schedule === "6h") return "Every 6 hours";
  if (schedule === "daily") return "Daily";
  if (schedule === "weekdays") return "Weekdays";
  if (schedule === "manual") return "Manual only";
  return `Every ${customMinutes ?? 60} minutes`;
}

function buildDraft(profile: SearchProfile): ScheduleDraft {
  return {
    isActive: profile.isActive,
    schedule: profile.schedule,
    scheduleIntervalMinutes: profile.scheduleIntervalMinutes ?? 60,
    autoResume: profile.autoResume,
  };
}

export function SchedulesTab() {
  const [profiles, setProfiles] = useState<SearchProfile[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ScheduleDraft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const next = await getProfiles();
      const sorted = [...next].sort((a, b) => {
        const aTime = a.nextRunAt ? new Date(a.nextRunAt).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.nextRunAt ? new Date(b.nextRunAt).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime || a.name.localeCompare(b.name);
      });
      setProfiles(sorted);
      setDrafts(Object.fromEntries(sorted.map((profile) => [profile.id, buildDraft(profile)])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scheduler settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const rows = useMemo(
    () =>
      profiles.map((profile) => {
        const draft = drafts[profile.id] ?? buildDraft(profile);
        const isDirty =
          draft.isActive !== profile.isActive ||
          draft.schedule !== profile.schedule ||
          draft.autoResume !== profile.autoResume ||
          (draft.schedule === "custom"
            ? (draft.scheduleIntervalMinutes ?? 60) !== (profile.scheduleIntervalMinutes ?? 60)
            : false);

        return { profile, draft, isDirty };
      }),
    [drafts, profiles]
  );

  function updateDraft(profileId: string, patch: Partial<ScheduleDraft>) {
    setDrafts((current) => ({
      ...current,
      [profileId]: {
        ...(current[profileId] ?? buildDraft(profiles.find((profile) => profile.id === profileId)!)),
        ...patch,
      },
    }));
    setActionError("");
  }

  async function saveSchedule(profile: SearchProfile, draft: ScheduleDraft) {
    if (draft.schedule === "custom" && (!draft.scheduleIntervalMinutes || draft.scheduleIntervalMinutes < 15)) {
      setActionError("Custom scheduler frequency must be at least 15 minutes.");
      return;
    }

    setSavingId(profile.id);
    setActionError("");
    try {
      const updated = await updateProfile(profile.id, {
        isActive: draft.isActive,
        schedule: draft.schedule,
        scheduleIntervalMinutes: draft.schedule === "custom" ? draft.scheduleIntervalMinutes ?? 60 : null,
        autoResume: draft.autoResume,
      });
      setProfiles((prev) =>
        [...prev]
          .map((item) => (item.id === profile.id ? updated : item))
          .sort((a, b) => {
            const aTime = a.nextRunAt ? new Date(a.nextRunAt).getTime() : Number.MAX_SAFE_INTEGER;
            const bTime = b.nextRunAt ? new Date(b.nextRunAt).getTime() : Number.MAX_SAFE_INTEGER;
            return aTime - bTime || a.name.localeCompare(b.name);
          })
      );
      setDrafts((current) => ({ ...current, [profile.id]: buildDraft(updated) }));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update scheduler settings.");
    } finally {
      setSavingId(null);
    }
  }

  async function handleRunNow(profile: SearchProfile) {
    setRunningId(profile.id);
    setActionError("");
    try {
      await runProfile(profile.id);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to start this search profile.");
    } finally {
      setRunningId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-[#4F8CFF]" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-[#1F2937] bg-[#111827] p-5">
        <div>
          <h3 className="text-[16px] font-semibold text-white">Scheduler</h3>
          <p className="mt-1 text-[13px] text-[#9CA3AF]">
            Manage all Job Agent schedules in one place. Update timing, pause profiles, and run any search immediately.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void load()}
          className="border-[#374151] bg-transparent text-[#9CA3AF] hover:bg-[#1F2937] hover:text-white"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-[#EF4444]/20 bg-[#EF4444]/10 px-4 py-3 text-[13px] text-[#FCA5A5]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {actionError && (
        <div className="flex items-start gap-2 rounded-lg border border-[#F59E0B]/20 bg-[#F59E0B]/10 px-4 py-3 text-[13px] text-[#FCD34D]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {rows.length === 0 ? (
        <Card className="border-dashed border-[#374151] bg-[#111827] p-12 text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#4F8CFF]/10">
              <CalendarClock className="h-6 w-6 text-[#4F8CFF]" />
            </div>
          </div>
          <h3 className="text-[15px] font-semibold text-white">No schedules yet</h3>
          <p className="mt-2 text-[13px] text-[#6B7280]">
            Create a search profile first, then come back here to manage all scheduler settings in one place.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map(({ profile, draft, isDirty }) => (
            <Card key={profile.id} className="border-[#1F2937] bg-[#111827] p-5">
              <div className="grid gap-5 xl:grid-cols-[minmax(220px,1.1fr)_minmax(0,1fr)_minmax(220px,0.9fr)]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-[15px] font-semibold text-white">{profile.name}</h4>
                    <Badge
                      className={`border text-[10px] ${
                        profile.isActive
                          ? "border-[#22C55E]/20 bg-[#22C55E]/10 text-[#86EFAC]"
                          : "border-[#374151] bg-[#0B0F14] text-[#9CA3AF]"
                      }`}
                    >
                      {profile.isActive ? "Active" : "Paused"}
                    </Badge>
                    <Badge className="border border-[#1F2937] bg-[#0B0F14] text-[10px] text-[#9CA3AF]">
                      {scheduleLabel(profile.schedule, profile.scheduleIntervalMinutes)}
                    </Badge>
                  </div>
                  <p className="mt-2 text-[12px] text-[#9CA3AF]">
                    {profile.jobTitles.join(", ") || "Any role"} · {profile.locations.join(", ") || "Any location"}
                  </p>
                  <div className="mt-4 space-y-1.5 text-[12px] text-[#9CA3AF]">
                    <p>Last run: <span className="text-white">{formatDateTime(profile.lastRunAt)}</span></p>
                    <p>Next run: <span className="text-white">{formatDateTime(profile.nextRunAt)}</span></p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Label className="text-[12px] uppercase tracking-wide text-[#9CA3AF]">Profile Active</Label>
                        <p className="mt-1 text-[12px] text-[#6B7280]">Turn scheduled runs on or off for this profile.</p>
                      </div>
                      <Switch
                        checked={draft.isActive}
                        onCheckedChange={(checked) => updateDraft(profile.id, { isActive: checked })}
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Label className="text-[12px] uppercase tracking-wide text-[#9CA3AF]">Auto Resume</Label>
                        <p className="mt-1 text-[12px] text-[#6B7280]">Automatically generate resumes after strong matches.</p>
                      </div>
                      <Switch
                        checked={draft.autoResume}
                        onCheckedChange={(checked) => updateDraft(profile.id, { autoResume: checked })}
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4 md:col-span-2">
                    <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Run Schedule</Label>
                    <select
                      value={draft.schedule}
                      onChange={(event) =>
                        updateDraft(profile.id, {
                          schedule: event.target.value as ScheduleDraft["schedule"],
                          scheduleIntervalMinutes:
                            event.target.value === "custom" ? draft.scheduleIntervalMinutes ?? 60 : draft.scheduleIntervalMinutes,
                        })
                      }
                      className="h-10 w-full rounded-lg border border-[#1F2937] bg-[#111827] px-3 text-[13px] text-white outline-none focus:border-[#4F8CFF]"
                    >
                      <option value="manual">Manual only</option>
                      <option value="6h">Every 6 hours</option>
                      <option value="daily">Daily</option>
                      <option value="weekdays">Weekdays</option>
                      <option value="custom">Custom interval</option>
                    </select>

                    {draft.schedule === "custom" && (
                      <div className="mt-3">
                        <Label className="mb-2 block text-[12px] uppercase tracking-wide text-[#9CA3AF]">Custom Interval (minutes)</Label>
                        <Input
                          type="number"
                          min={15}
                          step={15}
                          value={draft.scheduleIntervalMinutes ?? 60}
                          onChange={(event) =>
                            updateDraft(profile.id, {
                              scheduleIntervalMinutes: event.target.value ? Number(event.target.value) : 60,
                            })
                          }
                          className="border-[#1F2937] bg-[#111827] text-white"
                        />
                        <p className="mt-2 text-[11px] text-[#6B7280]">Minimum interval is 15 minutes.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col justify-between rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-[#9CA3AF]">Scheduler Summary</p>
                    <div className="mt-3 space-y-2 text-[12px] text-[#D1D5DB]">
                      <p>Current mode: <span className="font-medium text-white">{scheduleLabel(draft.schedule, draft.scheduleIntervalMinutes)}</span></p>
                      <p>Status: <span className="font-medium text-white">{draft.isActive ? "Ready to run" : "Paused"}</span></p>
                      <p>Resume automation: <span className="font-medium text-white">{draft.autoResume ? "On" : "Off"}</span></p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleRunNow(profile)}
                      disabled={runningId === profile.id}
                      className="border-[#374151] bg-transparent text-white hover:bg-[#1F2937]"
                    >
                      {runningId === profile.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                      Run now
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void saveSchedule(profile, draft)}
                      disabled={!isDirty || savingId === profile.id}
                      className="bg-[#4F8CFF] text-white hover:bg-[#4F8CFF]/90 disabled:opacity-60"
                    >
                      {savingId === profile.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
