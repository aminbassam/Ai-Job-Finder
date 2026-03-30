import { useEffect, useState, type ComponentType } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  BadgeCheck,
  Briefcase,
  Cpu,
  FileText,
  Gauge,
  Mail,
  MapPin,
  PlugZap,
  Search,
  Shield,
  ShieldOff,
  Sparkles,
  User,
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { api } from "../../services/api";

interface AdminUserDetailResponse {
  id: string;
  email: string;
  username: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  authSource: string;
  isDemo: boolean;
  isActive: boolean;
  isAdmin: boolean;
  location: string | null;
  jobTitle: string | null;
  linkedinUrl: string | null;
  avatarUrl: string | null;
  timezone: string;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  lastLogin: string | null;
  createdAt: string;
  updatedAt: string;
  aiCredits: number;
  subscription: {
    plan: string;
    status: string;
    billingInterval: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  };
  profile: {
    professionalSummary: string | null;
    yearsExperience: number | null;
    preferredLocation: string | null;
    remoteOnly: boolean;
    minSalaryUsd: number | null;
    maxSalaryUsd: number | null;
    defaultResumeId: string | null;
  } | null;
  jobPreference: {
    seniority: string;
    workMode: string;
    employmentType: string;
    targetTitle: string | null;
    preferredLocations: string[];
    targetSources: string[];
  } | null;
  usage: {
    searchProfiles: number;
    activeSearchProfiles: number;
    jobsImported: number;
    strongMatches: number;
    applications: number;
    uploadedDocuments: number;
    generatedResumes: number;
    generatedCoverLetters: number;
    masterResumeProfiles: number;
    activeResumeProfiles: number;
    aiConnections: number;
    activeConnectors: number;
  };
  gmailAccount: {
    email: string;
    lastSyncAt: string | null;
    lastError: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  aiProviders: Array<{
    provider: string;
    isConnected: boolean;
    isDefault: boolean;
    keyHint: string | null;
    lastValidatedAt: string | null;
    updatedAt: string;
  }>;
  connectors: Array<{
    connector: string;
    isActive: boolean;
    lastSyncAt: string | null;
    lastError: string | null;
    jobCount: number;
    updatedAt: string;
  }>;
  recentDocuments: Array<{
    id: string;
    title: string;
    kind: string;
    origin: string;
    updatedAt: string;
  }>;
  recentActivity: Array<{
    id: string;
    type: string;
    title: string;
    description: string | null;
    createdAt: string;
  }>;
}

function fmt(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtShort(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtMoney(value: number | null) {
  if (value === null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="border-[#1F2937] bg-[#111827] p-4">
      <div className="mb-2 flex items-center gap-2 text-[#9CA3AF]">
        <Icon className="h-4 w-4" />
        <span className="text-[12px]">{label}</span>
      </div>
      <p className="text-[24px] font-semibold text-white">{value}</p>
    </Card>
  );
}

function StatusPill({
  active,
  admin,
  verified,
}: {
  active: boolean;
  admin: boolean;
  verified: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant="outline" className={active ? "border-[#22C55E]/20 bg-[#22C55E]/10 text-[#22C55E]" : "border-[#EF4444]/20 bg-[#EF4444]/10 text-[#EF4444]"}>
        {active ? "Active" : "Inactive"}
      </Badge>
      <Badge variant="outline" className={admin ? "border-[#A78BFA]/20 bg-[#A78BFA]/10 text-[#A78BFA]" : "border-[#374151] bg-[#111827] text-[#9CA3AF]"}>
        {admin ? "Super Admin Access" : "Client User"}
      </Badge>
      <Badge variant="outline" className={verified ? "border-[#4F8CFF]/20 bg-[#4F8CFF]/10 text-[#4F8CFF]" : "border-[#374151] bg-[#111827] text-[#9CA3AF]"}>
        {verified ? "Email Verified" : "Email Unverified"}
      </Badge>
    </div>
  );
}

export function AdminUserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState<AdminUserDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await api.get<AdminUserDetailResponse>(`/admin/users/${id}`);
        if (active) setUser(data);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load user details.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    if (id) load();

    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3 text-[#9CA3AF]">
          <span className="h-4 w-4 rounded-full border-2 border-[#4F8CFF]/30 border-t-[#4F8CFF] animate-spin" />
          Loading client details…
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="p-8">
        <Card className="max-w-xl border-[#EF4444]/20 bg-[#111827] p-6">
          <h1 className="mb-2 text-[22px] font-semibold text-white">Unable to open client details</h1>
          <p className="text-[14px] text-[#9CA3AF]">{error || "This client could not be found."}</p>
          <Button onClick={() => navigate("/admin/users")} className="mt-4 bg-[#4F8CFF] text-white hover:bg-[#4F8CFF]/90">
            Back to User Management
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Button
            variant="outline"
            onClick={() => navigate("/admin/users")}
            className="border-[#1F2937] bg-transparent text-[#9CA3AF] hover:text-white"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Users
          </Button>
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Shield className="h-5 w-5 text-[#4F8CFF]" />
              <h1 className="text-[30px] font-semibold text-white">{user.fullName}</h1>
            </div>
            <p className="text-[14px] text-[#9CA3AF]">Full client workspace summary for super admin review.</p>
          </div>
          <StatusPill active={user.isActive} admin={user.isAdmin} verified={user.emailVerified} />
        </div>

        <Card className="min-w-[260px] border-[#1F2937] bg-[#111827] p-5">
          <p className="mb-1 text-[12px] uppercase tracking-[0.18em] text-[#6B7280]">Subscription</p>
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="outline" className="border-[#4F8CFF]/20 bg-[#4F8CFF]/10 capitalize text-[#4F8CFF]">
              {user.subscription.plan}
            </Badge>
            <span className="text-[12px] text-[#9CA3AF] capitalize">{user.subscription.status}</span>
          </div>
          <p className="text-[13px] text-[#9CA3AF]">
            Billing: <span className="text-white">{user.subscription.billingInterval ?? "—"}</span>
          </p>
          <p className="mt-1 text-[13px] text-[#9CA3AF]">
            Period ends: <span className="text-white">{fmtShort(user.subscription.currentPeriodEnd)}</span>
          </p>
          <p className="mt-3 text-[12px] text-[#9CA3AF]">
            AI credits balance: <span className="font-medium text-white">{user.aiCredits}</span>
          </p>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Jobs Imported" value={user.usage.jobsImported} icon={Briefcase} />
        <MetricCard label="Strong Matches" value={user.usage.strongMatches} icon={Sparkles} />
        <MetricCard label="Applications" value={user.usage.applications} icon={BadgeCheck} />
        <MetricCard label="Resume Profiles" value={`${user.usage.activeResumeProfiles}/${user.usage.masterResumeProfiles}`} icon={FileText} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-[#1F2937] bg-[#111827] p-6">
          <h2 className="mb-4 text-[18px] font-semibold text-white">Account Details</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              { label: "Email", value: user.email, icon: Mail },
              { label: "Username", value: user.username ?? "—", icon: User },
              { label: "Auth Source", value: user.authSource, icon: Shield },
              { label: "Demo Account", value: user.isDemo ? "Yes" : "No", icon: user.isDemo ? BadgeCheck : ShieldOff },
              { label: "Current Job Title", value: user.jobTitle ?? "—", icon: Briefcase },
              { label: "Location", value: user.location ?? "—", icon: MapPin },
              { label: "Timezone", value: user.timezone, icon: Gauge },
              { label: "LinkedIn", value: user.linkedinUrl ?? "—", icon: User },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
                <div className="mb-2 flex items-center gap-2 text-[#9CA3AF]">
                  <Icon className="h-4 w-4" />
                  <span className="text-[12px] uppercase tracking-[0.16em]">{label}</span>
                </div>
                {label === "LinkedIn" && user.linkedinUrl ? (
                  <a href={user.linkedinUrl} target="_blank" rel="noreferrer" className="break-all text-[14px] text-[#4F8CFF] hover:underline">
                    {user.linkedinUrl}
                  </a>
                ) : (
                  <p className="break-all text-[14px] text-white">{value}</p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              { label: "Joined", value: fmt(user.createdAt) },
              { label: "Last Login", value: fmt(user.lastLogin) },
              { label: "Last Updated", value: fmt(user.updatedAt) },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
                <p className="mb-2 text-[12px] uppercase tracking-[0.16em] text-[#9CA3AF]">{item.label}</p>
                <p className="text-[14px] text-white">{item.value}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border-[#1F2937] bg-[#111827] p-6">
          <h2 className="mb-4 text-[18px] font-semibold text-white">Career Preferences</h2>
          <div className="space-y-4">
            <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
              <p className="mb-2 text-[12px] uppercase tracking-[0.16em] text-[#9CA3AF]">Professional Summary</p>
              <p className="text-[14px] leading-6 text-white">{user.profile?.professionalSummary || "No summary saved yet."}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
                <p className="mb-2 text-[12px] uppercase tracking-[0.16em] text-[#9CA3AF]">Experience & Salary</p>
                <p className="text-[14px] text-white">Years: {user.profile?.yearsExperience ?? "—"}</p>
                <p className="mt-1 text-[14px] text-white">
                  Salary: {fmtMoney(user.profile?.minSalaryUsd ?? null)} to {fmtMoney(user.profile?.maxSalaryUsd ?? null)}
                </p>
                <p className="mt-1 text-[14px] text-white">Remote only: {user.profile?.remoteOnly ? "Yes" : "No"}</p>
              </div>
              <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
                <p className="mb-2 text-[12px] uppercase tracking-[0.16em] text-[#9CA3AF]">Job Preference</p>
                <p className="text-[14px] text-white">Target title: {user.jobPreference?.targetTitle || "—"}</p>
                <p className="mt-1 text-[14px] text-white">Seniority: {user.jobPreference?.seniority || "—"}</p>
                <p className="mt-1 text-[14px] text-white">Work mode: {user.jobPreference?.workMode || "—"}</p>
                <p className="mt-1 text-[14px] text-white">Employment: {user.jobPreference?.employmentType || "—"}</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
                <p className="mb-2 text-[12px] uppercase tracking-[0.16em] text-[#9CA3AF]">Preferred Locations</p>
                <div className="flex flex-wrap gap-2">
                  {(user.jobPreference?.preferredLocations?.length ? user.jobPreference.preferredLocations : [user.profile?.preferredLocation ?? "None set"]).map((item) => (
                    <Badge key={item} variant="outline" className="border-[#374151] bg-[#111827] text-[#D1D5DB]">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
                <p className="mb-2 text-[12px] uppercase tracking-[0.16em] text-[#9CA3AF]">Preferred Sources</p>
                <div className="flex flex-wrap gap-2">
                  {(user.jobPreference?.targetSources?.length ? user.jobPreference.targetSources : ["No sources selected"]).map((item) => (
                    <Badge key={item} variant="outline" className="border-[#374151] bg-[#111827] text-[#D1D5DB] capitalize">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="border-[#1F2937] bg-[#111827] p-6">
          <h2 className="mb-4 text-[18px] font-semibold text-white">Workspace Usage</h2>
          <div className="space-y-3">
            {[
              ["Search profiles", user.usage.searchProfiles],
              ["Active search profiles", user.usage.activeSearchProfiles],
              ["Uploaded documents", user.usage.uploadedDocuments],
              ["Generated resumes", user.usage.generatedResumes],
              ["Generated cover letters", user.usage.generatedCoverLetters],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between rounded-lg border border-[#1F2937] bg-[#0B0F14] px-3 py-2.5">
                <span className="text-[13px] text-[#9CA3AF]">{label}</span>
                <span className="text-[14px] font-medium text-white">{value}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border-[#1F2937] bg-[#111827] p-6">
          <h2 className="mb-4 text-[18px] font-semibold text-white">Integrations</h2>
          <div className="space-y-3">
            <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-4">
              <div className="mb-2 flex items-center gap-2">
                <Mail className="h-4 w-4 text-[#4F8CFF]" />
                <p className="text-[13px] font-medium text-white">Gmail</p>
              </div>
              <p className="text-[13px] text-[#9CA3AF]">Connected inbox: <span className="text-white">{user.gmailAccount?.email ?? "Not connected"}</span></p>
              <p className="mt-1 text-[12px] text-[#9CA3AF]">Last sync: {fmt(user.gmailAccount?.lastSyncAt ?? null)}</p>
              {user.gmailAccount?.lastError && (
                <p className="mt-2 text-[12px] text-[#F59E0B]">{user.gmailAccount.lastError}</p>
              )}
            </div>

            <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-4">
              <div className="mb-2 flex items-center gap-2">
                <Cpu className="h-4 w-4 text-[#A78BFA]" />
                <p className="text-[13px] font-medium text-white">AI Providers</p>
              </div>
              {user.aiProviders.length === 0 ? (
                <p className="text-[13px] text-[#9CA3AF]">No AI provider connections saved.</p>
              ) : (
                <div className="space-y-2">
                  {user.aiProviders.map((provider) => (
                    <div key={provider.provider} className="rounded-lg border border-[#1F2937] bg-[#111827] px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[13px] capitalize text-white">{provider.provider}</p>
                        <div className="flex items-center gap-2">
                          {provider.isDefault && <Badge variant="outline" className="border-[#4F8CFF]/20 bg-[#4F8CFF]/10 text-[#4F8CFF]">Default</Badge>}
                          <Badge variant="outline" className={provider.isConnected ? "border-[#22C55E]/20 bg-[#22C55E]/10 text-[#22C55E]" : "border-[#374151] bg-[#111827] text-[#9CA3AF]"}>
                            {provider.isConnected ? "Connected" : "Disconnected"}
                          </Badge>
                        </div>
                      </div>
                      <p className="mt-1 text-[12px] text-[#9CA3AF]">Key hint: {provider.keyHint ?? "—"}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card className="border-[#1F2937] bg-[#111827] p-6">
          <h2 className="mb-4 text-[18px] font-semibold text-white">Connectors</h2>
          {user.connectors.length === 0 ? (
            <p className="text-[13px] text-[#9CA3AF]">No job-source connectors configured yet.</p>
          ) : (
            <div className="space-y-2">
              {user.connectors.map((connector) => (
                <div key={connector.connector} className="rounded-lg border border-[#1F2937] bg-[#0B0F14] p-3">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <PlugZap className="h-4 w-4 text-[#F59E0B]" />
                      <p className="text-[13px] font-medium capitalize text-white">{connector.connector}</p>
                    </div>
                    <Badge variant="outline" className={connector.isActive ? "border-[#22C55E]/20 bg-[#22C55E]/10 text-[#22C55E]" : "border-[#374151] bg-[#111827] text-[#9CA3AF]"}>
                      {connector.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <p className="text-[12px] text-[#9CA3AF]">Jobs captured: {connector.jobCount}</p>
                  <p className="mt-1 text-[12px] text-[#9CA3AF]">Last sync: {fmt(connector.lastSyncAt)}</p>
                  {connector.lastError && <p className="mt-2 text-[12px] text-[#F59E0B]">{connector.lastError}</p>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-[#1F2937] bg-[#111827] p-6">
          <div className="mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#4F8CFF]" />
            <h2 className="text-[18px] font-semibold text-white">Recent Documents</h2>
          </div>
          {user.recentDocuments.length === 0 ? (
            <p className="text-[13px] text-[#9CA3AF]">No document activity yet.</p>
          ) : (
            <div className="space-y-2">
              {user.recentDocuments.map((document) => (
                <div key={document.id} className="rounded-lg border border-[#1F2937] bg-[#0B0F14] px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[14px] font-medium text-white">{document.title}</p>
                      <p className="mt-1 text-[12px] text-[#9CA3AF]">
                        {document.kind.replace("_", " ")} · {document.origin.replace("_", " ")}
                      </p>
                    </div>
                    <span className="text-[12px] text-[#9CA3AF]">{fmtShort(document.updatedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="border-[#1F2937] bg-[#111827] p-6">
          <div className="mb-4 flex items-center gap-2">
            <Search className="h-5 w-5 text-[#A78BFA]" />
            <h2 className="text-[18px] font-semibold text-white">Recent Activity</h2>
          </div>
          {user.recentActivity.length === 0 ? (
            <p className="text-[13px] text-[#9CA3AF]">No recent activity logged yet.</p>
          ) : (
            <div className="space-y-2">
              {user.recentActivity.map((activity) => (
                <div key={activity.id} className="rounded-lg border border-[#1F2937] bg-[#0B0F14] px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[14px] font-medium text-white">{activity.title}</p>
                      <p className="mt-1 text-[12px] capitalize text-[#9CA3AF]">{activity.type.replace(/_/g, " ")}</p>
                      {activity.description && <p className="mt-2 text-[13px] text-[#D1D5DB]">{activity.description}</p>}
                    </div>
                    <span className="whitespace-nowrap text-[12px] text-[#9CA3AF]">{fmtShort(activity.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
