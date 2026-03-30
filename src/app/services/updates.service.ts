import { api } from "./api";

export interface UpdateEntry {
  fullHash: string;
  version: string;
  timestamp: string;
  summary: string;
  details: string[];
}

export interface UpdatesResponse {
  automated: boolean;
  branch: string | null;
  message?: string;
  updates: UpdateEntry[];
}

export const updatesService = {
  getUpdates: () => api.get<UpdatesResponse>("/updates"),
};
