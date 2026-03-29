// JobFlow AI — Service Worker
// Handles API calls, auth, and tab script injection.

const DEFAULT_API_URL = "http://localhost:3001/api";

// ── Auth helpers ────────────────────────────────────────────────────────────

async function getAuth() {
  const result = await chrome.storage.local.get(["token", "apiUrl"]);
  return {
    token: result.token ?? null,
    apiUrl: (result.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, ""),
  };
}

async function apiFetch(path, options = {}) {
  const { token, apiUrl } = await getAuth();
  const res = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { message: text }; }
  if (!res.ok) throw new Error(json?.message ?? `HTTP ${res.status}`);
  return json;
}

// ── Extract job data from active tab ────────────────────────────────────────

async function extractJobFromTab(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "EXTRACT_JOB" }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ error: chrome.runtime.lastError.message });
      } else {
        resolve(response ?? { error: "No response from page." });
      }
    });
  });
}

// ── Message router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handle = async () => {
    switch (message.type) {

      // Login with email + password
      case "LOGIN": {
        const { email, password, apiUrl } = message;
        const base = (apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
        const res = await fetch(`${base}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.message ?? "Login failed.");
        await chrome.storage.local.set({ token: json.token, apiUrl: base, user: json.user });
        return { ok: true, user: json.user };
      }

      // Logout
      case "LOGOUT": {
        await chrome.storage.local.remove(["token", "user"]);
        return { ok: true };
      }

      // Get stored auth state
      case "GET_AUTH": {
        const data = await chrome.storage.local.get(["token", "user", "apiUrl"]);
        return {
          token: data.token ?? null,
          user: data.user ?? null,
          apiUrl: data.apiUrl ?? DEFAULT_API_URL,
        };
      }

      // Extract job from active tab
      case "EXTRACT_JOB": {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) throw new Error("No active tab.");
        return extractJobFromTab(tab.id);
      }

      // Save job to JobFlow
      case "SAVE_JOB": {
        const { job } = message;
        const result = await apiFetch("/agent/import", {
          method: "POST",
          body: JSON.stringify({
            title: job.title,
            company: job.company,
            location: job.location,
            description: job.description,
            remote: job.remote ?? false,
            sourceUrl: job.sourceUrl,
            source: "extension",
            externalId: job.externalId,
          }),
        });
        return { ok: true, job: result };
      }

      // Generate tailored resume for a saved job
      case "GENERATE_RESUME": {
        const { jobId, provider } = message;
        const result = await apiFetch(`/agent/results/${jobId}/generate-resume`, {
          method: "POST",
          body: JSON.stringify({ provider: provider ?? "openai" }),
        });
        return { ok: true, result };
      }

      // Open JobFlow in a new tab
      case "OPEN_JOBFLOW": {
        const { path } = message;
        const { apiUrl } = await getAuth();
        const appUrl = apiUrl.replace(/:\d+\/api$/, ":5678").replace(/\/api$/, "");
        await chrome.tabs.create({ url: `${appUrl}${path ?? "/jobs"}` });
        return { ok: true };
      }

      default:
        return { error: `Unknown message type: ${message.type}` };
    }
  };

  handle()
    .then(sendResponse)
    .catch((err) => sendResponse({ error: err.message }));

  return true; // keep channel open for async response
});
