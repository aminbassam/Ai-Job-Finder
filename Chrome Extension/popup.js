// JobFlow AI — Popup Script

const $ = (id) => document.getElementById(id);

// ── State ────────────────────────────────────────────────────────────────────

let currentJob = null;   // raw extracted job data
let savedJobId = null;   // returned after successful save

// ── Helpers ──────────────────────────────────────────────────────────────────

function send(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

function show(id)  { $(id)?.classList.remove("hidden"); }
function hide(id)  { $(id)?.classList.add("hidden"); }
function toggle(el, visible) { el.classList.toggle("hidden", !visible); }

function setError(id, msg) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg ?? "";
  toggle(el, !!msg);
}

function formatSalary(min, max) {
  if (!min && !max) return null;
  const fmt = (n) => n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  if (min) return `from ${fmt(min)}`;
  return `up to ${fmt(max)}`;
}

function tierInfo(tier, score) {
  if (tier === "strong") return { label: "Strong Match", cls: "tier-strong", color: "#22C55E" };
  if (tier === "maybe")  return { label: "Maybe",        cls: "tier-maybe",  color: "#F59E0B" };
  if (tier === "weak" || tier === "reject") return { label: "Weak", cls: "tier-weak", color: "#EF4444" };
  return { label: "Scored", cls: "tier-new", color: "#4F8CFF" };
}

// ── Render score ring ────────────────────────────────────────────────────────

function renderScore(score, tier) {
  const circ = 2 * Math.PI * 22; // radius=22
  const pct = Math.max(0, Math.min(100, score ?? 0)) / 100;
  const offset = circ * (1 - pct);
  const info = tierInfo(tier, score);

  const arc = document.querySelector(".score-arc");
  if (arc) {
    arc.style.strokeDashoffset = offset;
    arc.style.stroke = info.color;
  }

  const numEl = $("score-num");
  if (numEl) {
    numEl.textContent = score ?? "—";
    numEl.style.color = info.color;
  }

  const tierEl = $("score-tier");
  if (tierEl) {
    tierEl.textContent = info.label;
    tierEl.className = `score-tier ${info.cls}`;
  }

  $("saved-score-line").textContent = `AI Score: ${score ?? "—"}/100`;
  show("score-panel");
}

// ── Auth / header ─────────────────────────────────────────────────────────────

async function renderHeader(user) {
  const actions = $("header-actions");
  if (!user) { actions.innerHTML = ""; return; }

  const initials = [user.firstName?.[0], user.lastName?.[0]].filter(Boolean).join("") || "U";
  actions.innerHTML = `
    <div class="user-chip">
      <div class="user-avatar">${initials.toUpperCase()}</div>
      <span>${user.firstName ?? user.email ?? ""}</span>
    </div>
    <button class="btn-icon" id="btn-logout" title="Sign out">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
      </svg>
    </button>
  `;
  $("btn-logout")?.addEventListener("click", handleLogout);
}

// ── Login view ────────────────────────────────────────────────────────────────

function showLogin() {
  show("view-login");
  hide("view-main");
}

function showMain() {
  hide("view-login");
  show("view-main");
}

async function handleLogin() {
  const identifier = $("login-email").value.trim();
  const password = $("login-password").value;
  const apiUrl = $("login-api-url").value.trim() || "http://localhost:3001/api";

  setError("login-error", null);
  $("login-label").textContent = "Signing in…";
  $("login-spinner").classList.remove("hidden");
  $("btn-login").disabled = true;

  const res = await send({ type: "LOGIN", identifier, email: identifier, password, apiUrl });

  $("login-label").textContent = "Sign In";
  $("login-spinner").classList.add("hidden");
  $("btn-login").disabled = false;

  if (res?.error) { setError("login-error", res.error); return; }

  await renderHeader(res.user);
  showMain();
  await scanPage();
}

async function handleLogout() {
  await send({ type: "LOGOUT" });
  renderHeader(null);
  currentJob = null;
  savedJobId = null;
  showLogin();
}

// ── Scan page ─────────────────────────────────────────────────────────────────

async function scanPage() {
  // Reset state
  hide("state-no-job");
  hide("state-job");
  hide("action-saved");
  show("action-save");
  show("state-scanning");
  setError("save-error", null);
  savedJobId = null;

  const res = await send({ type: "EXTRACT_JOB" });
  hide("state-scanning");

  if (res?.error || !res?.title) {
    show("state-no-job");
    return;
  }

  currentJob = res;
  populateJobCard(res);
  show("state-job");
}

function populateJobCard(job) {
  // Source badge + URL
  $("job-source-badge").textContent = (job.source ?? "web").replace(/_/g, " ");
  const urlEl = $("job-source-url");
  try {
    const u = new URL(job.sourceUrl ?? "");
    urlEl.textContent = u.hostname.replace(/^www\./, "") + u.pathname.slice(0, 30);
    urlEl.href = job.sourceUrl;
  } catch {
    urlEl.textContent = "";
    hide("job-source-url");
  }

  // Core fields
  $("job-title").textContent = job.title ?? "";
  $("job-company").textContent = job.company ?? "";

  // Location
  const locText = $("job-location-text");
  const locChip = $("job-location");
  if (job.location) {
    locText.textContent = job.location;
    locChip.classList.remove("hidden");
  } else {
    locChip.classList.add("hidden");
  }

  // Remote badge
  toggle($("job-remote-badge"), !!job.remote);

  // Salary
  const salaryFmt = formatSalary(job.salaryMin, job.salaryMax);
  const salaryChip = $("job-salary");
  if (salaryFmt) {
    salaryChip.textContent = salaryFmt;
    salaryChip.classList.remove("hidden");
  } else {
    salaryChip.classList.add("hidden");
  }

  // Description preview
  const descEl = $("job-desc-preview");
  if (job.description) {
    descEl.textContent = job.description.slice(0, 300);
    descEl.classList.remove("hidden");
  } else {
    descEl.classList.add("hidden");
  }

  // Populate edit fields
  $("edit-title").value = job.title ?? "";
  $("edit-company").value = job.company ?? "";
  $("edit-location").value = job.location ?? "";
  $("edit-salary-min").value = job.salaryMin ?? "";
  $("edit-salary-max").value = job.salaryMax ?? "";
  $("edit-remote").checked = !!job.remote;
}

// ── Save job ──────────────────────────────────────────────────────────────────

async function handleSave() {
  if (!currentJob) return;

  // Merge edits
  const job = {
    ...currentJob,
    title: $("edit-title").value.trim() || currentJob.title,
    company: $("edit-company").value.trim() || currentJob.company,
    location: $("edit-location").value.trim() || currentJob.location,
    salaryMin: parseInt($("edit-salary-min").value) || currentJob.salaryMin,
    salaryMax: parseInt($("edit-salary-max").value) || currentJob.salaryMax,
    remote: $("edit-remote").checked,
  };

  setError("save-error", null);
  $("btn-save").disabled = true;
  $("save-spinner").classList.remove("hidden");

  const res = await send({ type: "SAVE_JOB", job });

  $("btn-save").disabled = false;
  $("save-spinner").classList.add("hidden");

  if (res?.error) {
    setError("save-error", res.error);
    return;
  }

  // Show saved state
  savedJobId = res.job?.id ?? null;
  hide("action-save");
  show("action-saved");

  // If already scored, show immediately; otherwise poll
  if (res.job?.aiScore != null) {
    renderScore(res.job.aiScore, res.job.matchTier);
  } else {
    pollScore(savedJobId);
  }
}

// ── Poll for AI score ─────────────────────────────────────────────────────────

async function pollScore(jobId) {
  if (!jobId) return;
  let attempts = 0;
  const max = 20; // 40s max

  const check = async () => {
    attempts++;
    const auth = await send({ type: "GET_AUTH" });
    if (!auth.token) return;

    const res = await fetch(
      `${(auth.apiUrl ?? "http://localhost:3001/api").replace(/\/$/, "")}/agent/results/${jobId}`,
      { headers: { Authorization: `Bearer ${auth.token}` } }
    ).catch(() => null);

    if (!res?.ok) {
      if (attempts < max) setTimeout(check, 2000);
      return;
    }

    const job = await res.json().catch(() => null);
    if (!job) return;

    if (job.aiScore != null || job.matchTier !== "new" || job.scoreBreakdown?.error) {
      renderScore(job.aiScore, job.matchTier);
    } else if (attempts < max) {
      setTimeout(check, 2000);
    }
  };

  setTimeout(check, 2000);
}

// ── Generate resume ───────────────────────────────────────────────────────────

async function handleGenerateResume() {
  if (!savedJobId) return;

  setError("resume-error", null);
  hide("resume-success");
  $("btn-generate-resume").disabled = true;
  $("resume-spinner").classList.remove("hidden");

  const res = await send({ type: "GENERATE_RESUME", jobId: savedJobId });

  $("btn-generate-resume").disabled = false;
  $("resume-spinner").classList.add("hidden");

  if (res?.error) {
    setError("resume-error", res.error);
    return;
  }

  show("resume-success");
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  // Bind login
  $("btn-login")?.addEventListener("click", handleLogin);
  $("login-password")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLogin();
  });
  $("btn-toggle-api-url")?.addEventListener("click", () => {
    $("api-url-group").classList.toggle("show");
  });

  // Bind main actions
  $("btn-save")?.addEventListener("click", handleSave);
  $("btn-generate-resume")?.addEventListener("click", handleGenerateResume);
  $("btn-open-jobflow")?.addEventListener("click", () => {
    send({ type: "OPEN_JOBFLOW", path: savedJobId ? `/jobs/${savedJobId}` : "/jobs" });
  });

  // Check auth
  const auth = await send({ type: "GET_AUTH" });

  if (!auth?.token) {
    showLogin();
    return;
  }

  await renderHeader(auth.user);
  showMain();
  await scanPage();
}

document.addEventListener("DOMContentLoaded", init);
