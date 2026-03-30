import { api } from "./api";

const BASE_URL = (import.meta as unknown as { env: Record<string, string> }).env
  ?.VITE_API_URL ?? "/api";
const SESSION_KEY = "jobflow_auth";

export interface DocumentItem {
  id: string;
  kind: "resume" | "cover_letter";
  resumeType?: "master" | "tailored";
  title: string;
  origin: "uploaded" | "manual" | "ai_generated" | "cloned";
  version: number;
  jobTitle?: string;
  company?: string;
  location?: string;
  lastModified: string;
  tags: string[];
}

export interface DocumentDetail extends DocumentItem {
  content_text?: string;
  content_html?: string;
  metadata?: Record<string, unknown>;
  versions: { version_no: number; change_summary: string; created_at: string }[];
}

export interface UpdateDocumentResult {
  message: string;
  document: {
    id: string;
    title: string;
    version: number;
    contentText: string;
    contentHtml: string;
    lastModified: string;
  };
}

export const documentsService = {
  list: (kind?: string): Promise<DocumentItem[]> =>
    api.get<DocumentItem[]>(`/documents${kind ? `?kind=${kind}` : ""}`),

  get: (id: string): Promise<DocumentDetail> =>
    api.get<DocumentDetail>(`/documents/${id}`),

  update: (
    id: string,
    data: { title?: string; contentHtml: string; changeSummary?: string }
  ): Promise<UpdateDocumentResult> =>
    api.put<UpdateDocumentResult>(`/documents/${id}`, data),

  downloadUrl: (id: string) => `/documents/${id}/download`,

  download: async (id: string): Promise<void> => {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const token = raw ? (JSON.parse(raw) as { token?: string }).token : null;
    const response = await fetch(`${BASE_URL}/documents/${id}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(message || "Failed to download document.");
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const disposition = response.headers.get("Content-Disposition") ?? "";
    const match = disposition.match(/filename="([^"]+)"/i);
    const filename = match?.[1] ?? "resume.pdf";

    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  },
};
