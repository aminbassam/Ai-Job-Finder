/**
 * Base API client
 *
 * Reads the JWT from sessionStorage and attaches it to every request.
 * On 401 it clears the session and redirects to login so the user is never
 * left in a broken authenticated state.
 *
 * Usage (real backend):
 *   import { api } from "./api";
 *   const jobs = await api.get<Job[]>("/jobs");
 *   const result = await api.post<LoginResponse>("/auth/login", { email, password });
 */

const BASE_URL = (import.meta as unknown as { env: Record<string, string> }).env
  ?.VITE_API_URL ?? "/api";

const SESSION_KEY = "jobflow_auth";

function getToken(): string | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return (JSON.parse(raw) as { token?: string }).token ?? null;
  } catch {
    // ignore parse errors
  }
  return null;
}

interface ApiError extends Error {
  status: number;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const text = await response.text();
      const json = JSON.parse(text) as { message?: string };
      message = json.message ?? text ?? message;
    } catch {
      // keep default message
    }

    if (response.status === 401) {
      sessionStorage.removeItem(SESSION_KEY);
      window.location.href = "/auth/login";
    }

    const error = new Error(message) as ApiError;
    error.status = response.status;
    throw error;
  }

  const text = await response.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export const api = {
  get: <T>(endpoint: string, options?: RequestInit) =>
    request<T>(endpoint, { method: "GET", ...options }),

  post: <T>(endpoint: string, body: unknown, options?: RequestInit) =>
    request<T>(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
      ...options,
    }),

  put: <T>(endpoint: string, body: unknown, options?: RequestInit) =>
    request<T>(endpoint, {
      method: "PUT",
      body: JSON.stringify(body),
      ...options,
    }),

  patch: <T>(endpoint: string, body: unknown, options?: RequestInit) =>
    request<T>(endpoint, {
      method: "PATCH",
      body: JSON.stringify(body),
      ...options,
    }),

  delete: <T>(endpoint: string, options?: RequestInit) =>
    request<T>(endpoint, { method: "DELETE", ...options }),
};
