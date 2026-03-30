// JobFlow AI — Options / Settings Script

const $ = (id) => document.getElementById(id);

function send(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

function setError(msg) {
  const el = $("opt-error");
  el.textContent = msg ?? "";
  el.classList.toggle("hidden", !msg);
}

async function renderAuthState(auth) {
  const apiUrlInput = $("api-url");
  if (auth.apiUrl) apiUrlInput.value = auth.apiUrl;

  const dot = $("status-dot");
  const statusText = $("status-text");

  if (auth.token && auth.user) {
    dot.className = "status-dot dot-connected";
    statusText.textContent = `Connected as ${auth.user.email ?? ""}`;
    $("account-email").textContent = auth.user.email ?? auth.user.firstName ?? "Logged in";
    $("account-logged-in").classList.remove("hidden");
    $("account-logged-out").classList.add("hidden");
  } else {
    dot.className = "status-dot dot-disconnected";
    statusText.textContent = "Not connected — sign in below";
    $("account-logged-in").classList.add("hidden");
    $("account-logged-out").classList.remove("hidden");
  }
}

async function handleLogin() {
  const identifier = $("opt-email").value.trim();
  const password = $("opt-password").value;
  const apiUrl = $("api-url").value.trim() || "http://localhost:3001/api";

  setError(null);
  $("login-label").textContent = "Signing in…";
  $("login-spinner").classList.remove("hidden");
  $("btn-login").disabled = true;

  const res = await send({ type: "LOGIN", identifier, email: identifier, password, apiUrl });

  $("login-label").textContent = "Sign In";
  $("login-spinner").classList.add("hidden");
  $("btn-login").disabled = false;

  if (res?.error) { setError(res.error); return; }
  await renderAuthState(await send({ type: "GET_AUTH" }));
}

async function handleLogout() {
  await send({ type: "LOGOUT" });
  await renderAuthState(await send({ type: "GET_AUTH" }));
}

async function handleSave() {
  const apiUrl = $("api-url").value.trim() || "http://localhost:3001/api";
  await chrome.storage.local.set({ apiUrl });
  const msg = $("saved-msg");
  msg.classList.add("show");
  setTimeout(() => msg.classList.remove("show"), 2000);
}

async function init() {
  const auth = await send({ type: "GET_AUTH" });
  renderAuthState(auth);

  $("btn-login")?.addEventListener("click", handleLogin);
  $("opt-password")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLogin();
  });
  $("btn-logout")?.addEventListener("click", handleLogout);
  $("btn-save")?.addEventListener("click", handleSave);
}

document.addEventListener("DOMContentLoaded", init);
