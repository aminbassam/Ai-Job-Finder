/**
 * Sources Tab — configure job source connectors per the 4-lane strategy:
 *  Lane 1: ATS connectors (Greenhouse, Lever, Ashby) — primary autonomous discovery
 *  Lane 2: Official APIs (Upwork OAuth) — structured source
 *  Lane 3: Browser Extension — manual/LinkedIn/Indeed (setup guide)
 *  Lane 4: Email ingestion — alert emails from any platform
 */
import { useState, useEffect } from "react";
import {
  Settings2, CheckCircle2, AlertCircle, Loader2,
  ChevronDown, ChevronUp, ExternalLink, Plus, X, Info,
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Switch } from "../../components/ui/switch";
import { Badge } from "../../components/ui/badge";
import { ConnectorConfig, getConnectors, saveConnector } from "../../services/agent.service";

/* ─── Lane badge ──────────────────────────────────────────────────────── */
function LaneBadge({ n, label }: { n: number; label: string }) {
  const colors = [
    "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20",
    "bg-[#4F8CFF]/10 text-[#4F8CFF] border-[#4F8CFF]/20",
    "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20",
    "bg-[#6366F1]/10 text-[#6366F1] border-[#6366F1]/20",
  ];
  return (
    <Badge className={`text-[10px] font-semibold border ${colors[(n - 1) % 4]}`}>
      Lane {n} · {label}
    </Badge>
  );
}

/* ─── Company-slug list editor ───────────────────────────────────────── */
function SlugList({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [input, setInput] = useState("");

  function add() {
    const s = input.trim().toLowerCase().replace(/\s+/g, "-");
    if (s && !value.includes(s)) onChange([...value, s]);
    setInput("");
  }

  return (
    <div>
      <Label className="text-[12px] text-[#9CA3AF] mb-2 block">{label}</Label>
      <div className="flex gap-2 mb-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="bg-[#0B0F14] border-[#1F2937] text-white placeholder:text-[#4B5563] h-9 text-[13px]"
        />
        <Button
          type="button"
          onClick={add}
          size="sm"
          variant="outline"
          className="border-[#374151] text-[#9CA3AF] hover:text-white h-9 shrink-0"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((slug) => (
            <span
              key={slug}
              className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 rounded-md bg-[#1F2937] text-[#9CA3AF] text-[12px] border border-[#374151]"
            >
              {slug}
              <button
                type="button"
                onClick={() => onChange(value.filter((s) => s !== slug))}
                className="hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Connector card ──────────────────────────────────────────────────── */
function ConnectorCard({
  lane,
  laneLabel,
  connector,
  title,
  description,
  color,
  logoChar,
  cfg,
  onSave,
  children,
}: {
  lane: number;
  laneLabel: string;
  connector: string;
  title: string;
  description: string;
  color: string;
  logoChar: string;
  cfg: ConnectorConfig | undefined;
  onSave: (isActive: boolean, config: Record<string, unknown>) => Promise<void>;
  children: (
    config: Record<string, unknown>,
    setConfig: React.Dispatch<React.SetStateAction<Record<string, unknown>>>,
  ) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isActive, setIsActive] = useState(cfg?.isActive ?? false);
  const [config, setConfig] = useState<Record<string, unknown>>(cfg?.config ?? {});

  async function handleSave() {
    setSaving(true);
    try { await onSave(isActive, config); } finally { setSaving(false); }
  }

  return (
    <Card className={`bg-[#111827] border-[#1F2937] transition-colors ${isActive ? "border-l-2 border-l-[#10B981]" : ""}`}>
      <div className="p-4">
        <div className="flex items-center gap-3">
          <div
            className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold text-[14px] shrink-0"
            style={{ backgroundColor: color }}
          >
            {logoChar}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[14px] font-semibold text-white">{title}</span>
              <LaneBadge n={lane} label={laneLabel} />
              {isActive && cfg?.lastSyncAt && (
                <span className="text-[11px] text-[#6B7280]">
                  synced {new Date(cfg.lastSyncAt).toLocaleDateString()}
                </span>
              )}
            </div>
            <p className="text-[12px] text-[#6B7280] truncate">{description}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Switch
              checked={isActive}
              onCheckedChange={setIsActive}
            />
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="text-[#6B7280] hover:text-white transition-colors"
            >
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {cfg?.lastError && (
          <div className="mt-3 flex items-center gap-2 text-[12px] text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/20 rounded-lg px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {cfg.lastError}
          </div>
        )}
      </div>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-[#1F2937] pt-4">
          {children(config, setConfig)}
          <div className="flex gap-3">
            <Button
              onClick={handleSave}
              disabled={saving}
              size="sm"
              className="bg-[#4F8CFF] hover:bg-[#4F8CFF]/90 text-white text-[13px]"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ─── Main tab ────────────────────────────────────────────────────────── */
export function SourcesTab() {
  const [cfgMap, setCfgMap] = useState<Record<string, ConnectorConfig>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getConnectors().then((list) => {
      const m: Record<string, ConnectorConfig> = {};
      for (const c of list) m[c.connector] = c;
      setCfgMap(m);
    }).finally(() => setLoading(false));
  }, []);

  async function save(connector: string, isActive: boolean, config: Record<string, unknown>) {
    const updated = await saveConnector(connector, { isActive, config });
    setCfgMap((m) => ({ ...m, [connector]: updated }));
  }

  if (loading)
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[#4F8CFF]" /></div>;

  return (
    <div className="space-y-6">
      {/* Strategy summary */}
      <Card className="bg-[#0B0F14] border-[#1F2937] p-4">
        <div className="flex items-start gap-3">
          <Info className="h-4 w-4 text-[#4F8CFF] mt-0.5 shrink-0" />
          <div className="text-[12px] text-[#9CA3AF] space-y-1">
            <p><span className="text-[#10B981] font-medium">Lane 1 — ATS connectors</span>: autonomous discovery from Greenhouse, Lever, Ashby company boards (no auth required).</p>
            <p><span className="text-[#4F8CFF] font-medium">Lane 2 — Official APIs</span>: Upwork GraphQL with your OAuth token for structured contract work.</p>
            <p><span className="text-[#F59E0B] font-medium">Lane 3 — Browser extension</span>: manual save from LinkedIn, Indeed, and any job page you visit.</p>
            <p><span className="text-[#6366F1] font-medium">Lane 4 — Email ingestion</span>: parse job alert emails from LinkedIn, Indeed, ZipRecruiter automatically.</p>
          </div>
        </div>
      </Card>

      {/* ── Lane 1: ATS Connectors ── */}
      <div>
        <h4 className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">
          Lane 1 — ATS Connectors (Autonomous)
        </h4>
        <div className="space-y-3">
          <ConnectorCard
            lane={1} laneLabel="Autonomous"
            connector="greenhouse"
            title="Greenhouse"
            description="Searches public job boards from companies using Greenhouse ATS"
            color="#24a362"
            logoChar="G"
            cfg={cfgMap["greenhouse"]}
            onSave={(a, c) => save("greenhouse", a, c)}
          >
            {(config, setConfig) => (
              <SlugList
                label="Company slugs (found in greenhouse.io/boards/{slug})"
                placeholder="e.g. stripe, notion, linear"
                value={(config.companySlugs as string[]) ?? []}
                onChange={(v) => setConfig({ ...config, companySlugs: v })}
              />
            )}
          </ConnectorCard>

          <ConnectorCard
            lane={1} laneLabel="Autonomous"
            connector="lever"
            title="Lever"
            description="Searches public postings from companies using Lever ATS"
            color="#3c5a99"
            logoChar="L"
            cfg={cfgMap["lever"]}
            onSave={(a, c) => save("lever", a, c)}
          >
            {(config, setConfig) => (
              <SlugList
                label="Company slugs (found in jobs.lever.co/{slug})"
                placeholder="e.g. figma, vercel, airbnb"
                value={(config.companySlugs as string[]) ?? []}
                onChange={(v) => setConfig({ ...config, companySlugs: v })}
              />
            )}
          </ConnectorCard>

          <ConnectorCard
            lane={1} laneLabel="Autonomous"
            connector="ashby"
            title="Ashby"
            description="Searches job boards from companies using Ashby ATS"
            color="#7c3aed"
            logoChar="A"
            cfg={cfgMap["ashby"]}
            onSave={(a, c) => save("ashby", a, c)}
          >
            {(config, setConfig) => {
              const feeds = (config.feeds as Array<{ type: string; company: string; slug: string }>) ?? [];
              const [co, setCo] = useState("");
              const [slug, setSlug] = useState("");
              return (
                <div>
                  <Label className="text-[12px] text-[#9CA3AF] mb-2 block">
                    Company boards (jobs.ashbyhq.com/{"{slug}"})
                  </Label>
                  <div className="flex gap-2 mb-2">
                    <Input
                      value={co}
                      onChange={(e) => setCo(e.target.value)}
                      placeholder="Company name"
                      className="bg-[#0B0F14] border-[#1F2937] text-white placeholder:text-[#4B5563] h-9 text-[13px]"
                    />
                    <Input
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      placeholder="Board slug"
                      className="bg-[#0B0F14] border-[#1F2937] text-white placeholder:text-[#4B5563] h-9 text-[13px]"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (co && slug) {
                          setConfig({ ...config, feeds: [...feeds, { type: "ashby", company: co, slug: slug.trim() }] });
                          setCo(""); setSlug("");
                        }
                      }}
                      className="border-[#374151] text-[#9CA3AF] hover:text-white h-9 shrink-0"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {feeds.map((f, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded bg-[#0B0F14] border border-[#1F2937] mb-1.5">
                      <span className="text-[12px] text-white">{f.company}</span>
                      <span className="text-[11px] text-[#6B7280]">{f.slug}</span>
                      <button
                        type="button"
                        onClick={() => setConfig({ ...config, feeds: feeds.filter((_, j) => j !== i) })}
                        className="text-[#6B7280] hover:text-[#EF4444]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              );
            }}
          </ConnectorCard>
        </div>
      </div>

      {/* ── Lane 2: Official APIs ── */}
      <div>
        <h4 className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">
          Lane 2 — Official APIs
        </h4>
        <ConnectorCard
          lane={2} laneLabel="Official API"
          connector="upwork"
          title="Upwork"
          description="GraphQL API — searches contract & freelance jobs. Requires OAuth2 access token."
          color="#14a800"
          logoChar="U"
          cfg={cfgMap["upwork"]}
          onSave={(a, c) => save("upwork", a, c)}
        >
          {(config, setConfig) => (
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-[12px] text-[#9CA3AF] bg-[#111827] border border-[#1F2937] rounded-lg p-3">
                <Info className="h-3.5 w-3.5 mt-0.5 text-[#4F8CFF] shrink-0" />
                <span>
                  Create an app at{" "}
                  <a
                    href="https://www.upwork.com/developer/apps"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#4F8CFF] underline inline-flex items-center gap-1"
                  >
                    upwork.com/developer/apps <ExternalLink className="h-3 w-3" />
                  </a>
                  {" "}then paste your OAuth2 access token below.
                </span>
              </div>
              <div>
                <Label className="text-[12px] text-[#9CA3AF] mb-1.5 block">Access Token</Label>
                <Input
                  type="password"
                  value={(config.accessToken as string) ?? ""}
                  onChange={(e) => setConfig({ ...config, accessToken: e.target.value })}
                  placeholder="oauth2_access_token…"
                  className="bg-[#0B0F14] border-[#1F2937] text-white placeholder:text-[#4B5563] font-mono"
                />
              </div>
            </div>
          )}
        </ConnectorCard>
      </div>

      {/* ── Lane 3: Extension ── */}
      <div>
        <h4 className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">
          Lane 3 — Browser Extension (Manual Import)
        </h4>
        <Card className="bg-[#111827] border-[#1F2937] p-5">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-[#F59E0B] flex items-center justify-center text-white font-bold text-[14px] shrink-0">E</div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[14px] font-semibold text-white">JobFlow Extension</span>
                <LaneBadge n={3} label="Manual capture" />
                <Badge className="bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20 text-[10px]">Coming soon</Badge>
              </div>
              <p className="text-[12px] text-[#6B7280] mb-3">
                One-click save from LinkedIn, Indeed, company career pages, and any recruiter page.
                Jobs flow into the same pipeline — normalized, scored, and ready to act on.
              </p>
              <div className="text-[12px] text-[#9CA3AF] space-y-1">
                <p>✓ Works on LinkedIn, Indeed, Glassdoor, company sites</p>
                <p>✓ Captures title, company, location, salary, description</p>
                <p>✓ Routes through the same AI scoring pipeline</p>
                <p>✓ Generate tailored resume in one click from any job page</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Lane 4: Email ── */}
      <div>
        <h4 className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">
          Lane 4 — Email Ingestion (Alert Backup)
        </h4>
        <ConnectorCard
          lane={4} laneLabel="Email"
          connector="email"
          title="Job Alert Emails"
          description="Parse job alert emails from LinkedIn, Indeed, ZipRecruiter, and more"
          color="#6366F1"
          logoChar="@"
          cfg={cfgMap["email"]}
          onSave={(a, c) => save("email", a, c)}
        >
          {(config, setConfig) => (
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-[12px] text-[#9CA3AF] bg-[#111827] border border-[#1F2937] rounded-lg p-3">
                <Info className="h-3.5 w-3.5 mt-0.5 text-[#4F8CFF] shrink-0" />
                <span>
                  Forward job alert emails to your JobFlow inbox address. Works with LinkedIn Jobs,
                  Indeed alerts, ZipRecruiter, and any job board that sends email digests.
                </span>
              </div>
              <div>
                <Label className="text-[12px] text-[#9CA3AF] mb-1.5 block">Your JobFlow email inbox</Label>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#0B0F14] border border-[#1F2937]">
                  <span className="text-[13px] font-mono text-[#4F8CFF]">
                    jobs+{`{your-id}`}@ingest.jobflow.ai
                  </span>
                  <Badge className="bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20 text-[10px] ml-auto">
                    Coming soon
                  </Badge>
                </div>
              </div>
              <div>
                <Label className="text-[12px] text-[#9CA3AF] mb-2 block">Supported senders (auto-parsed)</Label>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {["LinkedIn Jobs", "Indeed", "ZipRecruiter", "Glassdoor", "Monster"].map((s) => (
                    <span key={s} className="px-2 py-0.5 rounded bg-[#1F2937] text-[#6B7280] border border-[#374151]">{s}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </ConnectorCard>
      </div>
    </div>
  );
}
