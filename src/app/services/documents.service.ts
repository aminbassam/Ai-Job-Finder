import { api } from "./api";

export interface DocumentItem {
  id: string;
  kind: "resume" | "cover_letter";
  resumeType?: "master" | "tailored";
  title: string;
  origin: "uploaded" | "manual" | "ai_generated" | "cloned";
  version: number;
  jobTitle?: string;
  company?: string;
  lastModified: string;
  tags: string[];
}

export interface DocumentDetail extends DocumentItem {
  content_text?: string;
  versions: { version_no: number; change_summary: string; created_at: string }[];
}

export const documentsService = {
  list: (kind?: string): Promise<DocumentItem[]> =>
    api.get<DocumentItem[]>(`/documents${kind ? `?kind=${kind}` : ""}`),

  get: (id: string): Promise<DocumentDetail> =>
    api.get<DocumentDetail>(`/documents/${id}`),

  downloadUrl: (id: string) => `/documents/${id}/download`,
};
