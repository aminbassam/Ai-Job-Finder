// JobFlow AI — Popup Script

const $ = (id) => document.getElementById(id);

let currentJob = null;
let savedJobId = null;
let recentJobs = [];
let selectedImportedJobId = null;
let relatedProfilesByJobId = {};

function send(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

function show(id) {
  $(id)?.classList.remove("hidden");
}

function hide(id) {
  $(id)?.classList.add("hidden");
}

function toggle(el, visible) {
  if (!el) return;
  el.classList.toggle("hidden", !visible);
}

function setError(id, msg) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg ?? "";
  toggle(el, Boolean(msg));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatSalary(min, max) {
  if (!min && !max) return null;
  const formatValue = (value) => (value >= 1000 ? `$${Math.round(value / 1000)}k` : `$${value}`);
  if (min && max) return `${formatValue(min)} - ${formatValue(max)}`;
  if (min) return `from ${formatValue(min)}`;
  return `up to ${formatValue(max)}`;
}

function tierInfo(tier) {
  if (tier === "strong") return { label: "Strong Match", cls: "tier-strong", color: "#22C55E" };
  if (tier === "maybe") return { label: "Maybe", cls: "tier-maybe", color: "#F59E0B" };
  if (tier === "weak" || tier === "reject") return { label: "Weak", cls: "tier-weak", color: "#EF4444" };
  if (tier === "new") return { label: "Scoring", cls: "tier-new", color: "#4F8CFF" };
  return { label: "Scored", cls: "tier-new", color: "#4F8CFF" };
}

function formatRelativeTime(value) {
  if (!value) return "just now";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "recently";
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

function isScoring(job) {
  return job?.matchTier === "new" && job?.aiScore == null && !job?.scoreBreakdown?.error;
}

function getSelectedImportedJob() {
  return recentJobs.find((job) => job.id === selectedImportedJobId) ?? null;
}

function getActiveJobId() {
  return selectedImportedJobId ?? savedJobId ?? null;
}

function renderScore(score, tier) {
  const circ = 2 * Math.PI * 22;
  const pct = Math.max(0, Math.min(100, score ?? 0)) / 100;
  const offset = circ * (1 - pct);
  const info = tierInfo(tier);

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

  $("saved-score-line").textContent = score == null
    ? "AI scoring in progress…"
    : `AI Score: ${score}/100 • ${info.label}`;
  show("score-panel");
}

async function renderHeader(user) {
  const actions = $("header-actions");
  if (!actions) return;

  if (!user) {
    actions.innerHTML = "";
    return;
  }

  const initials = [user.firstName?.[0], user.lastName?.[0]].filter(Boolean).join("") || "U";
  actions.innerHTML = `
    <div class="user-chip">
      <div class="user-avatar">${escapeHtml(initials.toUpperCase())}</div>
      <span>${escapeHtml(user.firstName ?? user.email ?? "")}</span>
    </div>
    <button class="btn-icon" id="btn-logout" title="Sign out">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
      </svg>
    </button>
  `;

  $("btn-logout")?.addEventListener("click", handleLogout);
}

function showLogin() {
  show("view-login");
  hide("view-main");
}

function showMain() {
  hide("view-login");
  show("view-main");
}

function populateJobCard(job) {
  $("job-source-badge").textContent = (job.source ?? "web").replace(/_/g, " ");
  const urlEl = $("job-source-url");
  try {
    const url = new URL(job.sourceUrl ?? "");
    urlEl.textContent = url.hostname.replace(/^www\./, "") + url.pathname.slice(0, 30);
    urlEl.href = job.sourceUrl;
    urlEl.classList.remove("hidden");
  } catch {
    urlEl.textContent = "";
    urlEl.removeAttribute("href");
    urlEl.classList.add("hidden");
  }

  $("job-title").textContent = job.title ?? "";
  $("job-company").textContent = job.company ?? "";

  const locationChip = $("job-location");
  if (job.location) {
    $("job-location-text").textContent = job.location;
    locationChip.classList.remove("hidden");
  } else {
    locationChip.classList.add("hidden");
  }

  toggle($("job-remote-badge"), Boolean(job.remote));

  const salaryText = formatSalary(job.salaryMin, job.salaryMax);
  const salaryChip = $("job-salary");
  if (salaryText) {
    salaryChip.textContent = salaryText;
    salaryChip.classList.remove("hidden");
  } else {
    salaryChip.classList.add("hidden");
  }

  const descEl = $("job-desc-preview");
  if (job.description) {
    descEl.textContent = job.description.slice(0, 300);
    descEl.classList.remove("hidden");
  } else {
    descEl.classList.add("hidden");
  }

  $("edit-title").value = job.title ?? "";
  $("edit-company").value = job.company ?? "";
  $("edit-location").value = job.location ?? "";
  $("edit-salary-min").value = job.salaryMin ?? "";
  $("edit-salary-max").value = job.salaryMax ?? "";
  $("edit-remote").checked = Boolean(job.remote);
}

async function scanPage() {
  hide("state-no-job");
  hide("state-job");
  hide("action-saved");
  hide("score-panel");
  show("action-save");
  show("state-scanning");
  setError("save-error", null);
  currentJob = null;
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

function renderImportedJobs() {
  const listEl = $("imported-jobs-list");
  const emptyEl = $("imported-jobs-empty");
  if (!listEl || !emptyEl) return;

  if (!recentJobs.length) {
    listEl.innerHTML = "";
    show("imported-jobs-empty");
    hide("selected-import-panel");
    return;
  }

  hide("imported-jobs-empty");

  listEl.innerHTML = recentJobs.map((job) => {
    const info = tierInfo(job.matchTier);
    const selectedClass = job.id === selectedImportedJobId ? " active" : "";
    const statusLine = job.aiScore != null
      ? `${job.aiScore}/100`
      : isScoring(job)
        ? "Scoring…"
        : job.scoreBreakdown?.error
          ? "Needs AI setup"
          : "Saved";

    return `
      <button class="history-item${selectedClass}" data-job-id="${escapeHtml(job.id)}">
        <div class="history-main">
          <div class="history-title">${escapeHtml(job.title ?? "Untitled role")}</div>
          <div class="history-sub">${escapeHtml(job.company ?? "Company pending")} • ${escapeHtml(formatRelativeTime(job.createdAt))}</div>
        </div>
        <div class="history-meta">
          <span class="mini-score ${escapeHtml(info.cls)}">${escapeHtml(statusLine)}</span>
          <span class="history-tier">${escapeHtml(info.label)}</span>
        </div>
      </button>
    `;
  }).join("");

  listEl.querySelectorAll("[data-job-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const { jobId } = button.dataset;
      if (!jobId) return;
      selectedImportedJobId = jobId;
      renderImportedJobs();
      renderSelectedImportedJob();
      loadRelatedProfiles(jobId);
    });
  });
}

function renderSelectedImportedJob() {
  const panel = $("selected-import-panel");
  const details = $("selected-import-details");
  const heading = $("selected-import-heading");
  const aiHelp = $("selected-import-ai-help");
  const scoring = $("selected-import-scoring");
  const openSourceBtn = $("btn-open-source");

  const job = getSelectedImportedJob();
  if (!panel || !details || !heading || !aiHelp || !scoring || !openSourceBtn) return;

  if (!job) {
    hide("selected-import-panel");
    return;
  }

  show("selected-import-panel");
  heading.textContent = job.title ?? "Imported job";
  toggle(scoring, isScoring(job));

  const scoreInfo = tierInfo(job.matchTier);
  const breakdown = job.scoreBreakdown ?? {};
  const strengths = Array.isArray(breakdown.strengths) ? breakdown.strengths.slice(0, 2) : [];
  const weaknesses = Array.isArray(breakdown.weaknesses) ? breakdown.weaknesses.slice(0, 2) : [];
  const areas = Array.isArray(breakdown.areasToAddress) ? breakdown.areasToAddress.slice(0, 2) : [];

  details.innerHTML = `
    <div class="selected-job-card">
      <div class="selected-job-header">
        <div>
          <div class="selected-job-company">${escapeHtml(job.company ?? "Company pending")}</div>
          <div class="selected-job-meta">
            ${job.location ? `<span>${escapeHtml(job.location)}</span>` : ""}
            ${job.remote ? `<span>Remote</span>` : ""}
            <span>${escapeHtml(formatRelativeTime(job.createdAt))}</span>
          </div>
        </div>
        <div class="selected-job-score">
          <span class="selected-score-pill ${escapeHtml(scoreInfo.cls)}">${escapeHtml(job.aiScore != null ? `${job.aiScore}/100` : isScoring(job) ? "Scoring…" : "Saved")}</span>
          <span class="selected-score-label">${escapeHtml(scoreInfo.label)}</span>
        </div>
      </div>
      ${job.aiSummary ? `<p class="selected-job-summary">${escapeHtml(job.aiSummary)}</p>` : ""}
      <div class="selected-job-meta">
        ${job.jobType ? `<span>${escapeHtml(job.jobType)}</span>` : ""}
        ${job.paymentType ? `<span>${escapeHtml(job.paymentType)}</span>` : ""}
        ${job.isContract != null ? `<span>${job.isContract ? "Contract" : "Not contract"}</span>` : ""}
        ${job.workArrangement ? `<span>${escapeHtml(job.workArrangement)}</span>` : ""}
      </div>
      ${(job.companyAddress || job.compensationText)
        ? `<div class="detail-columns">
            ${job.companyAddress ? `<div class="detail-column"><p class="detail-label">Company address</p><p class="detail-empty">${escapeHtml(job.companyAddress)}</p></div>` : ""}
            ${job.compensationText ? `<div class="detail-column"><p class="detail-label">Payment</p><p class="detail-empty">${escapeHtml(job.compensationText)}</p></div>` : ""}
          </div>`
        : ""}
      <div class="detail-columns">
        <div class="detail-column">
          <p class="detail-label">Strong signals</p>
          ${strengths.length ? `<ul class="detail-list">${strengths.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p class="detail-empty">We’ll surface strengths here once the score is ready.</p>`}
        </div>
        <div class="detail-column">
          <p class="detail-label">Watch-outs</p>
          ${weaknesses.length || areas.length
            ? `<ul class="detail-list">${[...weaknesses, ...areas].slice(0, 3).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
            : `<p class="detail-empty">No major gaps flagged yet.</p>`}
        </div>
      </div>
    </div>
  `;

  if (job.scoreBreakdown?.error) {
    aiHelp.innerHTML = `
      <div class="alert-action-row">
        <span>${escapeHtml(job.scoreBreakdown.error)}</span>
        <button id="btn-open-ai-settings" class="btn-link-inline">Connect API key</button>
      </div>
    `;
    show("selected-import-ai-help");
    $("btn-open-ai-settings")?.addEventListener("click", () => {
      send({ type: "OPEN_JOBFLOW", path: "/settings?tab=ai" });
    });
  } else {
    hide("selected-import-ai-help");
    aiHelp.innerHTML = "";
  }

  openSourceBtn.disabled = !job.sourceUrl;
  openSourceBtn.classList.toggle("is-disabled", !job.sourceUrl);
}

function renderRelatedProfiles(jobId) {
  const loadingEl = $("related-profiles-loading");
  const emptyEl = $("related-profiles-empty");
  const listEl = $("related-profiles-list");

  if (!loadingEl || !emptyEl || !listEl) return;

  const payload = relatedProfilesByJobId[jobId];
  if (!payload) {
    show("related-profiles-loading");
    hide("related-profiles-empty");
    listEl.innerHTML = "";
    return;
  }

  hide("related-profiles-loading");
  const profiles = payload.profiles ?? [];

  if (!profiles.length) {
    show("related-profiles-empty");
    listEl.innerHTML = "";
    return;
  }

  hide("related-profiles-empty");
  listEl.innerHTML = profiles.map((profile) => {
    const matched = (profile.matchedSkills ?? []).slice(0, 3);
    const missing = (profile.missingSkills ?? []).slice(0, 2);
    const suggestions = (profile.suggestions ?? []).slice(0, 2);

    return `
      <div class="profile-card">
        <div class="profile-card-head">
          <div>
            <div class="profile-card-title">${escapeHtml(profile.name)}</div>
            <div class="profile-card-sub">${escapeHtml((profile.targetRoles ?? []).join(" • ") || "Master resume profile")}</div>
          </div>
          <div class="profile-fit">
            <span class="profile-fit-score">${escapeHtml(String(profile.fitScore))}</span>
            <span class="profile-fit-label">fit</span>
          </div>
        </div>
        <div class="profile-metrics">
          <span>ATS ${escapeHtml(String(profile.atsScore))}</span>
          <span>MQ ${escapeHtml(String(profile.mqScore))}</span>
          <span>Impact ${escapeHtml(String(profile.impactScore))}</span>
          <span>Complete ${escapeHtml(String(profile.completenessScore))}</span>
        </div>
        ${matched.length ? `<p class="profile-line"><strong>Matches:</strong> ${escapeHtml(matched.join(", "))}</p>` : ""}
        ${missing.length ? `<p class="profile-line"><strong>Missing:</strong> ${escapeHtml(missing.join(", "))}</p>` : ""}
        ${suggestions.length ? `<ul class="profile-suggestions">${suggestions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
      </div>
    `;
  }).join("");
}

async function refreshImportedJobs(selectJobId = null) {
  setError("imported-jobs-error", null);
  show("imports-loading");

  const res = await send({ type: "LIST_IMPORTED_JOBS", limit: 6 });
  hide("imports-loading");

  if (res?.error) {
    setError("imported-jobs-error", res.error);
    return;
  }

  recentJobs = Array.isArray(res?.matches) ? res.matches : [];

  if (selectJobId && recentJobs.some((job) => job.id === selectJobId)) {
    selectedImportedJobId = selectJobId;
  } else if (!selectedImportedJobId || !recentJobs.some((job) => job.id === selectedImportedJobId)) {
    selectedImportedJobId = recentJobs[0]?.id ?? null;
  }

  renderImportedJobs();
  renderSelectedImportedJob();

  if (selectedImportedJobId) {
    loadRelatedProfiles(selectedImportedJobId);
  }
}

async function loadRelatedProfiles(jobId) {
  renderRelatedProfiles(jobId);

  const res = await send({ type: "LIST_RELATED_PROFILES", jobId, limit: 3 });
  if (res?.error) {
    setError("imported-jobs-error", res.error);
    return;
  }

  relatedProfilesByJobId[jobId] = {
    profiles: Array.isArray(res?.profiles) ? res.profiles : [],
    totalProfilesConsidered: res?.totalProfilesConsidered ?? 0,
  };
  renderRelatedProfiles(jobId);
}

async function pollScore(jobId) {
  if (!jobId) return;

  let attempts = 0;
  const maxAttempts = 20;

  const check = async () => {
    attempts += 1;
    const res = await send({ type: "GET_JOB_RESULT", jobId });
    if (res?.error) {
      if (attempts < maxAttempts) setTimeout(check, 2000);
      return;
    }

    const job = res?.job;
    if (!job) return;

    recentJobs = recentJobs.map((item) => (item.id === job.id ? job : item));
    if (!recentJobs.some((item) => item.id === job.id)) {
      recentJobs = [job, ...recentJobs].slice(0, 6);
    }

    if (job.aiScore != null || job.matchTier !== "new" || job.scoreBreakdown?.error) {
      renderScore(job.aiScore, job.matchTier);
      renderImportedJobs();
      renderSelectedImportedJob();
      await loadRelatedProfiles(job.id);
      return;
    }

    renderImportedJobs();
    renderSelectedImportedJob();
    if (attempts < maxAttempts) setTimeout(check, 2000);
  };

  setTimeout(check, 2000);
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

  if (res?.error) {
    setError("login-error", res.error);
    return;
  }

  await renderHeader(res.user);
  showMain();
  await Promise.all([scanPage(), refreshImportedJobs()]);
}

async function handleLogout() {
  await send({ type: "LOGOUT" });
  currentJob = null;
  savedJobId = null;
  recentJobs = [];
  selectedImportedJobId = null;
  relatedProfilesByJobId = {};
  renderHeader(null);
  showLogin();
}

async function handleSave() {
  if (!currentJob) return;

  const job = {
    ...currentJob,
    title: $("edit-title").value.trim() || currentJob.title,
    company: $("edit-company").value.trim() || currentJob.company,
    location: $("edit-location").value.trim() || currentJob.location,
    salaryMin: parseInt($("edit-salary-min").value, 10) || currentJob.salaryMin,
    salaryMax: parseInt($("edit-salary-max").value, 10) || currentJob.salaryMax,
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

  savedJobId = res.job?.id ?? null;
  selectedImportedJobId = savedJobId;
  hide("action-save");
  show("action-saved");

  if (res.job?.aiScore != null || res.job?.scoreBreakdown?.error) {
    renderScore(res.job.aiScore, res.job.matchTier);
  } else {
    $("saved-score-line").textContent = "AI scoring in progress…";
    hide("score-panel");
  }

  await refreshImportedJobs(savedJobId);

  if (res.job?.aiScore != null || res.job?.matchTier !== "new" || res.job?.scoreBreakdown?.error) {
    await loadRelatedProfiles(savedJobId);
  } else {
    pollScore(savedJobId);
  }
}

async function handleGenerateResume() {
  const jobId = getActiveJobId();
  if (!jobId) {
    setError("resume-error", "Save a job first or pick one from your recent imports.");
    return;
  }

  setError("resume-error", null);
  hide("resume-success");
  $("btn-generate-resume").disabled = true;
  $("resume-spinner").classList.remove("hidden");

  const res = await send({ type: "GENERATE_RESUME", jobId });

  $("btn-generate-resume").disabled = false;
  $("resume-spinner").classList.add("hidden");

  if (res?.error) {
    setError("resume-error", res.error);
    return;
  }

  show("resume-success");
}

async function init() {
  $("btn-login")?.addEventListener("click", handleLogin);
  $("login-password")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") handleLogin();
  });
  $("btn-toggle-api-url")?.addEventListener("click", () => {
    $("api-url-group").classList.toggle("show");
  });

  $("btn-save")?.addEventListener("click", handleSave);
  $("btn-generate-resume")?.addEventListener("click", handleGenerateResume);
  $("btn-open-jobflow")?.addEventListener("click", () => {
    const jobId = getActiveJobId();
    send({ type: "OPEN_JOBFLOW", path: jobId ? `/jobs/${jobId}` : "/jobs" });
  });
  $("btn-refresh-imports")?.addEventListener("click", () => {
    refreshImportedJobs(selectedImportedJobId);
  });
  $("btn-open-selected-jobflow")?.addEventListener("click", () => {
    const jobId = getActiveJobId();
    send({ type: "OPEN_JOBFLOW", path: jobId ? `/jobs/${jobId}` : "/jobs" });
  });
  $("btn-open-source")?.addEventListener("click", () => {
    const job = getSelectedImportedJob();
    if (job?.sourceUrl) chrome.tabs.create({ url: job.sourceUrl });
  });

  const auth = await send({ type: "GET_AUTH" });
  if (!auth?.token) {
    showLogin();
    return;
  }

  await renderHeader(auth.user);
  showMain();
  await Promise.all([scanPage(), refreshImportedJobs()]);
}

document.addEventListener("DOMContentLoaded", init);
